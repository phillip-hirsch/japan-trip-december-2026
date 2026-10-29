import { readFileSync } from 'node:fs'

// `effect`, `@effect/vitest` and every Effect SQL driver ship together and
// must share one exact version. `@effect/tsgo` is versioned on its own,
// against the TypeScript and Oxlint versions it supports.
const isPinnedTogether = (name: string) =>
  name === 'effect' ||
  name === '@effect/vitest' ||
  name.startsWith('@effect/sql-')

const exactVersion = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/

// Run from the repository root, as `vp test` does. Tests pass another
// package.json.
const packageFile = process.argv[2] ?? 'package.json'

const manifest: {
  readonly dependencies?: Readonly<Record<string, string>>
  readonly devDependencies?: Readonly<Record<string, string>>
} = JSON.parse(readFileSync(packageFile, 'utf8'))

const pinned = Object.entries({
  ...manifest.dependencies,
  ...manifest.devDependencies,
}).filter(([name]) => isPinnedTogether(name))

const versions = new Set(pinned.map(([, version]) => version))

const allExact = pinned.every(([, version]) => exactVersion.test(version))

if (versions.size > 1 || !allExact) {
  const target =
    manifest.dependencies?.effect?.replace(/^[\^~=v]+/, '') ?? 'X.Y.Z'

  console.error(`
Effect versions check failed. effect, @effect/vitest and every @effect/sql-* driver share one exact version, bumped together. ${packageFile} has:

${pinned.map(([name, version]) => `  ${name}: ${version}`).join('\n')}

Set each of them to the same exact version, such as "${target}", with no ^ or ~, then run 'vp install'. Leave @effect/tsgo as it is: it follows TypeScript and Oxlint instead.
`)

  process.exitCode = 1
}
