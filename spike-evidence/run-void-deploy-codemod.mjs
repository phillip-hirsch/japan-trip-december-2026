// Runs the one step of `void deploy --platform cloudflare` that turns
// dist/server/wrangler.json into a cf Build Output tree. No upload, no login,
// no Cloudflare API call. CLOUDFLARE_API_TOKEN is unset and Void strips
// CLOUDFLARE_*, CF_* and WRANGLER* from the codemod's environment anyway.
import { cpSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')

const voidEntry = createRequire(join(root, 'package.json')).resolve(
  'void/config',
)

const chunk = join(dirname(voidEntry), 'cf-build-output-Bc8i3dzE.mjs')

const { t: prepareCfBuildOutput } = await import(pathToFileURL(chunk).href)

const workerDirectory = join(root, 'dist/server')

const destination = join(root, '.cloudflare/output')

const placeholderAccountId = '0'.repeat(32)

console.log(`chunk: ${relative(root, chunk)}`)

console.log(`input: ${relative(root, join(workerDirectory, 'wrangler.json'))}`)

const output = await prepareCfBuildOutput(workerDirectory, placeholderAccountId)

if (!output) {
  console.log('prepareCfBuildOutput returned null')
  process.exit(1)
}

try {
  rmSync(destination, { recursive: true, force: true })
  cpSync(output.directory, destination, { recursive: true })
  console.log(`temp tree: ${output.directory}`)
  console.log(`copied to: ${relative(root, destination)}`)

  const entries = readdirSync(destination, {
    recursive: true,
    withFileTypes: true,
  })

  for (const entry of entries) {
    if (!entry.isFile()) continue

    const name = relative(destination, join(entry.parentPath, entry.name))

    if (name.startsWith('assets/') || name.includes('/assets/')) continue

    console.log(`file: .cloudflare/output/${name}`)
  }
} finally {
  await output.dispose()
}
