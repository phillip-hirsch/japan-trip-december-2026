import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

import { Predicate } from 'effect'
import { experimental_readRawConfig } from 'wrangler'

// Checks, in the working directory, that wrangler.jsonc says what
// cloudflare.config.ts says, and that worker-configuration.d.ts is what
// `wrangler types` generates from it. Dev, build and deploy read
// cloudflare.config.ts (ADR 0005); wrangler.jsonc serves `wrangler tail`,
// `wrangler secret put` and `wrangler types`.

type Json = null | boolean | number | string | ReadonlyArray<Json> | JsonObject

interface JsonObject {
  readonly [key: string]: Json
}

/** cloudflare.config.ts as @cloudflare/config parses it. */
interface ParsedConfig {
  readonly worker: JsonObject
}

// cf converts its config to Wrangler's with @cloudflare/config, its own
// dependency, which the project can't import by name. It is resolved next to
// cf, so it is always the version cf uses.
const loadConverter = async () => {
  const cfConfig = import.meta.resolve('cf/config')

  const module: {
    readonly loadAndParseConfig: (path: string) => Promise<{
      readonly result:
        | { readonly success: true; readonly data: ParsedConfig }
        | { readonly success: false; readonly error: Error }
    }>
    readonly convertToWranglerConfig: (config: ParsedConfig) => JsonObject
  } = await import(
    new URL('../../@cloudflare/config/dist/index.mjs', cfConfig).href
  ).catch((cause: Error) => {
    throw new Error(
      'Could not load @cloudflare/config next to cf. If a cf update moved it, update loadConverter in scripts/check-cloudflare-config.ts.',
      { cause },
    )
  })

  return module
}

const { loadAndParseConfig, convertToWranglerConfig } = await loadConverter()

const { result } = await loadAndParseConfig('cloudflare.config.ts')

if (!result.success) {
  throw new Error('cloudflare.config.ts is invalid', { cause: result.error })
}

const isObject = (value: Json | undefined): value is JsonObject =>
  Predicate.isObject(value)

// A Durable Object binding to this Worker's own class may name the Worker or
// leave it out; both mean the same.
const withoutOwnScriptName = (config: JsonObject): JsonObject => {
  const durableObjects = config.durable_objects

  if (!isObject(durableObjects) || !Array.isArray(durableObjects.bindings)) {
    return config
  }

  const bindings: ReadonlyArray<Json> = durableObjects.bindings

  return {
    ...config,
    durable_objects: {
      ...durableObjects,
      bindings: bindings.map((binding) => {
        if (!isObject(binding) || binding.script_name !== config.name) {
          return binding
        }

        const { script_name: _ownWorker, ...rest } = binding

        return rest
      }),
    },
  }
}

const expected = withoutOwnScriptName(convertToWranglerConfig(result.data))

const { $schema: _schema, ...rawWrangler }: JsonObject =
  experimental_readRawConfig({ config: 'wrangler.jsonc' }).rawConfig

const actual = withoutOwnScriptName(rawWrangler)

// The paths where the two configs differ, such as `vars.ACCESS_AUD`.
const differences = (
  left: Json | undefined,
  right: Json | undefined,
  path: string,
): ReadonlyArray<string> => {
  if (isDeepStrictEqual(left, right)) return []

  if (isObject(left) && isObject(right)) {
    return [...new Set([...Object.keys(left), ...Object.keys(right)])]
      .sort()
      .flatMap((key) =>
        differences(left[key], right[key], path ? `${path}.${key}` : key),
      )
  }

  const show = (value: Json | undefined) =>
    value === undefined ? 'nothing' : JSON.stringify(value)

  return [
    `  ${path}: cloudflare.config.ts gives ${show(left)}, wrangler.jsonc has ${show(right)}`,
  ]
}

const configDifferences = differences(expected, actual, '')

if (configDifferences.length > 0) {
  console.error(`
Cloudflare config check failed. wrangler.jsonc is out of step with cloudflare.config.ts:

${configDifferences.join('\n')}

cloudflare.config.ts is the source: dev, build and deploy read it. Make the change there first, then mirror it in wrangler.jsonc using Wrangler's names, so each path above matches. Then run 'vp run cf-typegen' and commit worker-configuration.d.ts.
`)

  process.exitCode = 1
} else {
  // `wrangler types --check` compares only the hashes in the file's header,
  // so it misses a hand edit. This generates the file afresh beside the
  // committed one, so the import paths inside come out the same, and compares
  // the two.
  const wrangler = fileURLToPath(
    new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url),
  )

  const typesFile = 'worker-configuration.d.ts'
  const freshFile = '.worker-configuration.check.d.ts'

  try {
    const typegen = spawnSync(
      process.execPath,
      [wrangler, 'types', freshFile],
      {
        encoding: 'utf8',
        env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
      },
    )

    if (typegen.status !== 0) {
      throw new Error(
        `wrangler types failed:\n${typegen.stderr || typegen.stdout}`,
      )
    }

    // A checkout with core.autocrlf gives the committed file CRLF line
    // endings; wrangler writes LF.
    const lf = (text: string) => text.replaceAll('\r\n', '\n')

    // The header records the command, which names the output file.
    const fresh = lf(readFileSync(freshFile, 'utf8')).replace(
      `running \`wrangler types ${freshFile}\``,
      'running `wrangler types`',
    )

    const committed = lf(readFileSync(typesFile, 'utf8'))

    if (fresh !== committed) {
      const freshLines = fresh.split('\n')
      const committedLines = committed.split('\n')

      const firstDifference = freshLines.findIndex(
        (text, index) => text !== committedLines[index],
      )

      const line = firstDifference === -1 ? freshLines.length : firstDifference

      console.error(`
Cloudflare config check failed. ${typesFile} is not what 'wrangler types' generates from wrangler.jsonc and the installed workerd. The first difference is on line ${line + 1}:

  generated: ${freshLines[line] ?? '(end of file)'}
  committed: ${committedLines[line] ?? '(end of file)'}

Run 'vp run cf-typegen' and commit ${typesFile}; never edit it by hand. A wrangler or workerd update changes the runtime types too, so run it after one.
`)

      process.exitCode = 1
    }
  } finally {
    rmSync(freshFile, { force: true })
  }
}
