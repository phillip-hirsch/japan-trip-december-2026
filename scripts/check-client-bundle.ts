import path from 'node:path'

import type { Plugin } from 'vite-plus'

/** The Effect modules browser code may import by value. */
const allowedEffectModules = ['Predicate', 'Data', 'Match']

const effectModule = /[\\/]node_modules[\\/]effect[\\/]dist[\\/](.+)\.js$/

const effectName = (id: string) =>
  effectModule.exec(id)?.[1].replaceAll('\\', '/')

const isFirstParty = (id: string) =>
  !/[\\/]node_modules[\\/]/.test(id) && !id.startsWith('\0')

const effectImport =
  /import\s*(?:\*\s*as\s+\w+|\{([^}]*)\})\s*from\s*["'](effect(?:\/[^"']*)?)["']/g

/** What `code` imports from Effect beyond the allowed modules. */
const disallowedEffectImports = (code: string) =>
  [...code.matchAll(effectImport)].flatMap(([statement, names, source]) => {
    if (source !== 'effect' || names === undefined) return [statement]

    return names
      .split(',')
      .map((name) => name.trim().split(/\s+as\s+/)[0])
      .filter((name) => name !== '' && !allowedEffectModules.includes(name))
  })

/**
 * Fails a browser build that bundles any Effect module beyond what Predicate,
 * Data and Match import, such as Schema or the Effect runtime, which cost
 * about 75 KB gzip (docs/research/effect-v4.md). A lint rule catches a direct
 * import in browser code; this also catches one through a shared module. It
 * checks the client build and the service worker's.
 */
export const checkClientBundle = (): Plugin => ({
  name: 'japan-trip:check-client-bundle',
  apply: 'build',
  applyToEnvironment: (environment) => environment.config.consumer === 'client',
  generateBundle(_options, bundle) {
    const bundled = Object.values(bundle).flatMap((output) =>
      output.type === 'chunk'
        ? Object.entries(output.modules).flatMap(([id, module]) =>
            module.renderedLength > 0 ? [id] : [],
          )
        : [],
    )

    // Everything the allowed modules import, which may be bundled too.
    const allowed = new Set<string>()

    const allow = (id: string) => {
      if (allowed.has(id) || effectName(id) === undefined) return

      allowed.add(id)
      this.getModuleInfo(id)?.importedIds.forEach(allow)
    }

    for (const id of this.getModuleIds()) {
      if (allowedEffectModules.includes(effectName(id) ?? '')) allow(id)
    }

    const forbidden = bundled.filter(
      (id) => effectName(id) !== undefined && !allowed.has(id),
    )

    if (forbidden.length === 0) return

    const relative = (id: string) =>
      path.relative(this.environment.config.root, id).replaceAll('\\', '/')

    // The bundled app modules whose code, with types already stripped,
    // imports other Effect modules, and the app modules importing them.
    const offenders = bundled.flatMap((id) => {
      const info = this.getModuleInfo(id)

      if (!isFirstParty(id) || info?.code == null) return []

      const names = disallowedEffectImports(info.code)

      if (names.length === 0) return []

      const importedBy = info.importers.filter(isFirstParty).map(relative)

      return [
        `  ${relative(id)} imports ${names.join(', ')}${importedBy.length > 0 ? `; imported by ${importedBy.join(', ')}` : ''}`,
      ]
    })

    // Effect's own internal modules would only lengthen the list.
    const modules = forbidden
      .map((id) => effectName(id) ?? id)
      .filter((name) => !name.includes('internal/'))

    this.error(
      `The browser bundle holds Effect modules beyond Predicate, Data and Match: ${modules.join(', ')}.
${offenders.length > 0 ? `\n${offenders.join('\n')}\n` : ''}
Browser code may value-import only Predicate, Data and Match from 'effect'. Use \`import type\` for types, such as those of @/trip/domain/domain, and keep Schema and the Effect runtime in server modules.`,
    )
  },
})
