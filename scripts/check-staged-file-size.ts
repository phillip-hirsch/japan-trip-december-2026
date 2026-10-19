import { execFileSync } from 'node:child_process'

// Plain `node` runs this script and can't resolve the '@/' alias, so imports
// are relative.
import { generatedFiles } from './generated-files.ts'
import { supportsAttributeSource } from './git-features.ts'

const maxTokens = 5_000

const bytesPerToken = 4

// Files agents don't write: generated files, the vendored anti-slop rules
// and the shadcn/ui registry components. Research notes are skipped too:
// each is one dated write-up, and splitting it would only scatter it.
const skippedPatterns = [
  ...generatedFiles,
  'tools/oxlint/anti-slop/**',
  'src/components/ui/**',
  'docs/research/**',
]

const git = (args: ReadonlyArray<string>, input = '') =>
  execFileSync('git', args, {
    encoding: 'buffer',
    input: Buffer.from(input),
    maxBuffer: 256 * 1024 * 1024,
  })

const gitText = (args: ReadonlyArray<string>) =>
  git(args).toString('utf8').trim()

// Every staged path except deletions. --no-renames reports a rename as an
// add, and status T reports a symlink replaced by a file.
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

// Keeps regular files. Symlinks and submodules have no content to split.
const stagedFiles = rawFields.flatMap((meta, index) => {
  if (index % 2 === 1 || meta === '') return []

  const [, mode, , blob] = meta.split(' ')

  if (mode !== '100644' && mode !== '100755') return []

  return [{ path: rawFields[index + 1], blob }]
})

// Reads the staged blobs' sizes, so a partly staged file counts as committed.
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

// Asks git which over-limit files are binary, such as fonts, images or files
// marked binary in .gitattributes. The diff runs against an empty tree, so
// only the staged side counts, and --numstat prints "-" for a binary file.
const binaryPaths = (paths: ReadonlyArray<string>) => {
  if (paths.length === 0) return new Set<string>()

  const emptyTree = gitText(['hash-object', '-t', 'tree', '--stdin'])

  const diffArgs = [
    'diff',
    '--cached',
    '--numstat',
    '-z',
    '--no-renames',
    emptyTree,
    '--',
    ...paths.map((path) => `:(top,literal)${path}`),
  ]

  // --attr-source points git at the index written as a tree, so it reads
  // .gitattributes as staged and an unstaged edit can't change which files
  // count as binary. Git before 2.41 has no --attr-source and reads the
  // working tree's copy.
  const numstat = supportsAttributeSource(gitText(['version']))
    ? git([`--attr-source=${gitText(['write-tree'])}`, ...diffArgs])
    : git(diffArgs)

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
Commit blocked. These staged files are over the ${formatCount(maxTokens)}-token limit. A token counts as ${bytesPerToken} bytes, so the limit is ${formatCount(maxTokens * bytesPerToken)} bytes.

${oversized.join('\n')}

Split each file before committing. Aim well under the limit, with one clear responsibility per file.

1. Read the whole file and list its top-level parts: functions, types, components, constants, test groups or sections. Group them by responsibility. Parts that call each other or change together stay in one group. Split along those groups, never at an arbitrary line.

2. Move each group into a new sibling file named for what it holds:
   - TypeScript and TSX: move the group with its private helpers and the types only it uses. Types shared by several groups get their own module. Import across files with the '@/' alias, except under scripts/, where plain node runs the file and imports must be relative. Keep the original path as the module's entry point. It keeps the public API and imports the pieces, so callers' imports still work. If two new files would import each other, they belong together, or their shared part moves to a third file.
   - Tests (*.test.ts): split by behaviour into <Module>.<area>.test.ts files, like src/trip/trip/Trip.activities.test.ts. Shared layers and fixtures go in a testing.ts next to them (see src/trip/trip/testing.ts), not into each file.
   - Markdown: split at the top-level headings into files named for each section, and reduce the original file to an index that links to them.
   - JSON and other data: split by top-level key or record into separate files, and import them where the original was read.

3. Stage the new files with 'git add', run 'vp check', 'vp run typecheck' and 'vp test', then commit again.

Don't bypass this check with --no-verify. If a tool writes the file (a lockfile or codegen), add its path to generatedFiles in scripts/generated-files.ts instead of splitting it.
`)

  process.exitCode = 1
}
