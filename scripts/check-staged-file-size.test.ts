import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { assert, describe, it, onTestFinished } from '@effect/vitest'

import { supportsAttributeSource } from './git-features.ts'

const checker = fileURLToPath(
  new URL('./check-staged-file-size.ts', import.meta.url),
)

const limitBytes = 20_000

const text = (bytes: number) => 'a'.repeat(bytes)

const binary = (bytes: number) => `\0${text(bytes - 1)}`

const attributeSource = supportsAttributeSource(
  execFileSync('git', ['version'], { encoding: 'utf8' }),
)

const missingCommit = '1234567890123456789012345678901234567890'

// The environment without Git variables a parent process, such as a hook, may
// have set (GIT_DIR, GIT_INDEX_FILE, GIT_CONFIG_PARAMETERS), which would point
// git at another repository or add config.
const inheritedEnv = { ...process.env }

for (const name of Object.keys(inheritedEnv))
  if (name.toUpperCase().startsWith('GIT_')) delete inheritedEnv[name]

// A throwaway repository that ignores the machine's global and system Git
// config (signing, hooks, line endings). The checker runs in it as its own
// process, the way the pre-commit hook runs it.
const makeRepo = () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'staged-size-'))

  onTestFinished(() => rmSync(sandbox, { recursive: true, force: true }))

  const root = join(sandbox, 'repo')

  const globalConfig = join(sandbox, 'gitconfig')

  mkdirSync(root)
  writeFileSync(globalConfig, '')

  const env = {
    ...inheritedEnv,
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_CONFIG_NOSYSTEM: '1',
  }

  const git = (args: ReadonlyArray<string>, input = '') =>
    execFileSync('git', args, {
      cwd: root,
      env,
      input,
      encoding: 'utf8',
    }).trim()

  git(['init', '-q'])
  git(['config', 'user.email', 'test@example.com'])
  git(['config', 'user.name', 'Test'])

  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }

  const stage = (path: string, content: string) => {
    write(path, content)
    git(['add', '--', path])
  }

  // Stages an index entry directly, for symlinks without filesystem support.
  const stageEntry = (mode: string, path: string, content: string) => {
    const blob = git(['hash-object', '-w', '--stdin'], content)

    git(['update-index', '--add', '--cacheinfo', `${mode},${blob},${path}`])
  }

  const commit = () => git(['commit', '-q', '-m', 'base'])

  // Runs the checker. blocked lists every path it reports, in order, whatever
  // the token count says, so a malformed count still shows up.
  const check = () => {
    const run = spawnSync(process.execPath, [checker], {
      cwd: root,
      env,
      encoding: 'utf8',
    })

    const paths = [...run.stderr.matchAll(/^ {2}(.+): \S+ tokens/gm)].map(
      (match) => match[1],
    )

    assert.strictEqual(run.status, paths.length > 0 ? 1 : 0, run.stderr)

    return { blocked: paths, report: run.stderr }
  }

  return { git, write, stage, stageEntry, commit, check }
}

describe('check-staged-file-size', () => {
  it('allows a commit with nothing staged', () => {
    assert.deepStrictEqual(makeRepo().check().blocked, [])
  })

  it('blocks a staged file over 5,000 tokens and says how to split it', () => {
    const repo = makeRepo()

    repo.stage('src/big.ts', text(limitBytes + 1))

    const { blocked, report } = repo.check()

    assert.deepStrictEqual(blocked, ['src/big.ts'])

    assert.include(
      report,
      'src/big.ts: 5,001 tokens (20,001 bytes), split it into at least 2 files',
    )

    assert.include(report, 'Move each group into a new sibling file')
  })

  it('allows a file of exactly 5,000 tokens', () => {
    const repo = makeRepo()

    repo.stage('exact.ts', text(limitBytes))

    assert.deepStrictEqual(repo.check().blocked, [])
  })

  it('measures the staged content, not the working tree', () => {
    const repo = makeRepo()

    repo.stage('grown.ts', text(10))
    repo.write('grown.ts', text(limitBytes * 2))
    repo.stage('shrunk.ts', text(limitBytes * 2))
    repo.write('shrunk.ts', text(10))

    assert.deepStrictEqual(repo.check().blocked, ['shrunk.ts'])
  })

  it('skips lockfiles, codegen, vendored code and shadcn/ui components', () => {
    const repo = makeRepo()

    for (const path of [
      'pnpm-lock.yaml',
      'src/routeTree.gen.ts',
      'src/trip/rail-geometry.json',
      'worker-configuration.d.ts',
      'tools/oxlint/anti-slop/rules/rule.ts',
      'src/components/ui/map.tsx',
    ])
      repo.stage(path, text(limitBytes * 2))

    assert.deepStrictEqual(repo.check().blocked, [])
  })

  it('skips binary files, but checks a binary file replaced by text', () => {
    const repo = makeRepo()

    repo.stage('.gitattributes', '*.svg binary')
    repo.stage('was-binary.dat', binary(10))
    repo.commit()
    repo.stage('font.woff2', binary(limitBytes * 2))
    repo.stage('icon.svg', text(limitBytes * 2))
    repo.stage('was-binary.dat', text(limitBytes * 2))

    assert.deepStrictEqual(repo.check().blocked, ['was-binary.dat'])
  })

  // Older git reads the working tree's .gitattributes; see git-features.ts.
  it.skipIf(!attributeSource)(
    'reads .gitattributes from the index, not the working tree',
    () => {
      const repo = makeRepo()

      repo.stage('.gitattributes', '*.svg binary')
      repo.write('.gitattributes', '*.ts binary')
      repo.stage('icon.svg', text(limitBytes * 2))
      repo.stage('big.ts', text(limitBytes * 2))

      assert.deepStrictEqual(repo.check().blocked, ['big.ts'])
    },
  )

  it('skips symlinks, submodules and deletions, but checks a symlink replaced by a file', () => {
    const repo = makeRepo()

    repo.stage('deleted.md', text(limitBytes * 2))
    repo.stageEntry('120000', 'link', 'target')
    repo.commit()
    repo.git(['rm', '-q', '--cached', 'deleted.md'])
    repo.stageEntry('100644', 'link', text(limitBytes * 2))
    repo.stageEntry('120000', 'long-link', text(limitBytes * 2))
    repo.git([
      'update-index',
      '--add',
      '--cacheinfo',
      `160000,${missingCommit},submodule`,
    ])

    assert.deepStrictEqual(repo.check().blocked, ['link'])
  })

  it('reports file names with spaces and non-ASCII characters as written', () => {
    const repo = makeRepo()

    repo.stage('notes/big file ü.md', text(limitBytes * 2))

    assert.deepStrictEqual(repo.check().blocked, ['notes/big file ü.md'])
  })
})
