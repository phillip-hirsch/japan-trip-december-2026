import { execFileSync } from 'node:child_process'

// Relative, not '@/': plain `node` runs this script and can't resolve the alias.
import { generatedFiles } from './generated-files.ts'

const maxTokens = 5_000

const bytesPerToken = 4

// Files agents don't author: generated files, plus code copied from upstream
// (the vendored anti-slop rules and shadcn/ui registry components).
const skippedPatterns = [
  ...generatedFiles,
  'tools/oxlint/anti-slop/**',
  'src/components/ui/**',
]

const git = (args: ReadonlyArray<string>, input = '') =>
  execFileSync('git', args, {
    encoding: 'buffer',
    input: Buffer.from(input),
    maxBuffer: 256 * 1024 * 1024,
  })

// Every staged path that isn't a deletion. With --no-renames a rename counts
// as an add; T catches a symlink replaced by a file.
const rawDiff = git([
  'diff',
  '--cached',
  '--raw',
  '-z',
  '--no-abbrev',
  '--no-renames',
  '--diff-filter=ACMT',
  '--',
  ':/',
  ...skippedPatterns.map((pattern) => `:(top,glob,exclude)${pattern}`),
])

// -z output alternates ":oldmode newmode oldblob newblob status" and the path.
const rawFields = rawDiff.toString('utf8').split('\0')

// Regular files only: symlinks and submodules have no content to split.
const stagedFiles = rawFields.flatMap((meta, index) => {
  if (index % 2 === 1 || meta === '') return []

  const [, mode, , blob] = meta.split(' ')

  if (mode !== '100644' && mode !== '100755') return []

  return [{ path: rawFields[index + 1], blob }]
})

// Sizes of the staged blobs, so a partly staged file is measured as committed.
const sizes = git(
  ['cat-file', '--batch-check=%(objectsize)'],
  stagedFiles.map(({ blob }) => blob).join('\n'),
)
  .toString('utf8')
  .trim()
  .split('\n')
  .map(Number)

const overLimit = stagedFiles.flatMap(({ path }, index) =>
  sizes[index] > maxTokens * bytesPerToken
    ? [{ path, bytes: sizes[index] }]
    : [],
)

// Lets git decide which over-limit files are binary (fonts, images, or files
// marked binary in .gitattributes): diffed against an empty tree, only the
// staged side counts, and --numstat reports a binary file as "-".
const binaryPaths = (paths: ReadonlyArray<string>) => {
  if (paths.length === 0) return new Set<string>()

  const emptyTree = git(['hash-object', '-t', 'tree', '--stdin'])
    .toString('utf8')
    .trim()

  const numstat = git([
    'diff',
    '--cached',
    '--numstat',
    '-z',
    '--no-renames',
    emptyTree,
    '--',
    ...paths.map((path) => `:(top,literal)${path}`),
  ])

  return new Set(
    numstat
      .toString('utf8')
      .split('\0')
      .flatMap((record) =>
        record.startsWith('-\t-\t') ? [record.slice('-\t-\t'.length)] : [],
      ),
  )
}

const binary = binaryPaths(overLimit.map(({ path }) => path))

const formatCount = (count: number) => count.toLocaleString('en-US')

const oversized = overLimit.flatMap(({ path, bytes }) => {
  if (binary.has(path)) return []

  const tokens = Math.ceil(bytes / bytesPerToken)

  const parts = Math.ceil(tokens / maxTokens)

  return [
    `  ${path}: ${formatCount(tokens)} tokens (${formatCount(bytes)} bytes), split it into at least ${parts} files`,
  ]
})

if (oversized.length > 0) {
  console.error(`
Commit blocked: these staged files are over the ${formatCount(maxTokens)}-token limit (tokens = bytes / ${bytesPerToken}, so ${formatCount(maxTokens * bytesPerToken)} bytes):

${oversized.join('\n')}

Split each file before committing. Aim well under the limit, with one clear responsibility per file.

1. Read the whole file and list its top-level parts: functions, types, components, constants, test groups or sections. Group them by responsibility, keeping together code that calls each other or changes together. Split along those groups, never at an arbitrary line.

2. Move each group into a new sibling file named for what it holds:
   - TypeScript and TSX: move the group with its private helpers and the types only it uses. Types shared by several groups get their own module. Import across files with the '@/' alias. Keep the original path as the module's entry point, holding the public API and importing the pieces, so callers' imports keep working. If two new files would import each other, they belong together, or their shared part moves to a third file.
   - Tests (*.test.ts): split by behaviour into <Module>.<area>.test.ts files, like src/trip/Trip.activities.test.ts. Shared layers and fixtures go in a testing.ts next to them (see src/trip/testing.ts) instead of being copied into each file.
   - Markdown: split at the top-level headings into files named for each section, and reduce the original file to an index that links to them.
   - JSON and other data: split by top-level key or record into separate files, and import them where the original was read.

3. Stage the new files with 'git add', run 'vp check', 'vp run typecheck' and 'vp test', then commit again.

Don't bypass this check with --no-verify. If a tool writes the file (a lockfile or codegen), add its path to generatedFiles in scripts/generated-files.ts instead of splitting it.
`)

  process.exitCode = 1
}
