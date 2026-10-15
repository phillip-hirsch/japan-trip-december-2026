import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { isDeepStrictEqual } from 'node:util'

const requireFromVoid = createRequire(
  createRequire(import.meta.url).resolve('void/config'),
)

const { parse } = requireFromVoid('jsonc-parser')

const original = parse(
  execFileSync('git', ['show', 'HEAD:wrangler.jsonc'], { encoding: 'utf8' }),
)

const { default: migrated } = await import(
  new URL('../void.config.ts', import.meta.url)
)

console.log(
  'void.config.ts cloudflare deep-equals HEAD:wrangler.jsonc:',
  isDeepStrictEqual(migrated.cloudflare, original),
)

console.log(
  'access.dev equal:',
  isDeepStrictEqual(migrated.cloudflare.access, original.access),
  JSON.stringify(migrated.cloudflare.access),
)

console.log(
  'exports.TripStore equal:',
  isDeepStrictEqual(migrated.cloudflare.exports, original.exports),
  JSON.stringify(migrated.cloudflare.exports),
)

console.log(
  'top-level keys besides cloudflare:',
  JSON.stringify(Object.keys(migrated).filter((key) => key !== 'cloudflare')),
)
