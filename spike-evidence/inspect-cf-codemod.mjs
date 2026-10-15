// Reproduces Void's migrateBuiltWranglerConfig up to the point where it rejects
// follow-ups, so the generated cf config and the follow-up list can be read.
// The deleted keys mirror migrationInput() in void/dist/cf-build-output-Bc8i3dzE.mjs.
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')

const requireFromVoid = createRequire(
  createRequire(join(root, 'package.json')).resolve('void/config'),
)

const cfPackage = requireFromVoid.resolve('cf/package.json')

const voidModules = dirname(realpathSync(join(root, 'node_modules/void')))

const codemods = join(voidModules, '@cloudflare/codemods/dist/index.mjs')

const raw = JSON.parse(
  readFileSync(join(root, 'dist/server/wrangler.json'), 'utf8'),
)

const buildOnlyKeys = new Set([
  'configPath',
  'userConfigPath',
  'topLevelName',
  'main',
  'jsx_factory',
  'jsx_fragment',
  'rules',
  'python_modules',
  'dev',
  'no_bundle',
  'build',
  'keep_vars',
  'keep_secrets',
  'keep_assets',
  'send_metrics',
  'workflows',
])

const isEmpty = (value) =>
  value === undefined ||
  value === null ||
  isDeepStrictEqual(value, []) ||
  isDeepStrictEqual(value, {}) ||
  isDeepStrictEqual(value, { bindings: [] })

const input = Object.fromEntries(
  Object.entries(raw).filter(
    ([key, value]) => !buildOnlyKeys.has(key) && !isEmpty(value),
  ),
)

const directory = mkdtempSync(join(tmpdir(), 'spike-cf-config-'))

try {
  mkdirSync(join(directory, 'node_modules'))
  symlinkSync(
    dirname(cfPackage),
    join(directory, 'node_modules', 'cf'),
    'junction',
  )
  writeFileSync(
    join(directory, 'package.json'),
    JSON.stringify({
      name: 'void-private-cf-build',
      private: true,
      type: 'module',
      dependencies: { cf: '1.0.0', '@cloudflare/vite-plugin': '1.0.0' },
    }),
  )

  const configPath = join(directory, 'wrangler.json')

  writeFileSync(configPath, JSON.stringify(input))
  console.log('--- codemod input (keys) ---')
  console.log(Object.keys(input).join(', '))
  console.log('--- codemod input exports / durable_objects / migrations ---')
  console.log(
    JSON.stringify({
      exports: input.exports,
      durable_objects: input.durable_objects,
      migrations: input.migrations ?? '(deleted as empty)',
    }),
  )

  const { migrateWranglerToCf } = await import(pathToFileURL(codemods).href)

  const migration = await migrateWranglerToCf(configPath, {
    bundler: 'vite',
    force: true,
    installDependencies: false,
  })

  console.log(`--- migration.status: ${migration.status} ---`)
  console.log('--- migration.followUps ---')
  console.log(JSON.stringify(migration.followUps, null, 2))
  console.log(`--- generated ${join(directory, 'cloudflare.config.ts')} ---`)
  console.log(readFileSync(join(directory, 'cloudflare.config.ts'), 'utf8'))
} finally {
  rmSync(directory, { recursive: true, force: true })
}
