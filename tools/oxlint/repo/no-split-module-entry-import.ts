import { existsSync } from 'node:fs'
import path from 'node:path'

import { Predicate } from 'effect'
import { defineRule } from 'vite-plus/lint/plugins'
import type { ESTree } from 'vite-plus/lint/plugins'

// A split module's entry, such as src/trip/trip/Trip.ts, re-exports its
// siblings, such as Trip.stays.ts. A sibling that imports the entry closes a
// cycle, which fails when the modules load. Tests and *.testing.ts helpers
// are not re-exported, so they may import the entry.
const notReExported = new Set(['test', 'testing'])

const moduleExtensions = ['.ts', '.tsx']

/** The entry's path without extension when `file` is a split sibling. */
const entryOf = (file: string) => {
  const extension = path.extname(file)
  const parts = path.basename(file, extension).split('.')

  if (parts.length < 2 || notReExported.has(parts.at(-1) ?? '')) {
    return undefined
  }

  const entry = path.join(path.dirname(file), parts[0])

  return moduleExtensions.some((ext) => existsSync(entry + ext))
    ? entry
    : undefined
}

/** Where an import of `source` from `file` lands, without extension. */
const importedPath = (file: string, source: string) => {
  const srcRoot = file.slice(0, file.lastIndexOf(`${path.sep}src${path.sep}`))

  const target = source.startsWith('@/')
    ? path.join(srcRoot, 'src', source.slice(2))
    : source.startsWith('.')
      ? path.resolve(path.dirname(file), source)
      : undefined

  return target?.replace(/\.tsx?$/, '')
}

export const noSplitModuleEntryImportRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow a split module sibling (<Module>.<area>.ts) from importing its entry (<Module>.ts).',
    },
    messages: {
      entryImport:
        '{{sibling}} is a sibling of the split module {{entry}}, which re-exports it, so importing {{entry}} here closes a cycle that fails when the modules load. Import from the sibling that defines what you need, or move the shared piece into the area-shared sibling (such as Trip.shared.ts).',
    },
  },
  create(context) {
    const file = path.resolve(context.filename)
    const entry = entryOf(file)

    if (entry === undefined) return {}

    const check = (
      node: ESTree.Node,
      source: ESTree.Node | null | undefined,
    ) => {
      if (source?.type !== 'Literal' || !Predicate.isString(source.value))
        return

      if (importedPath(file, source.value) !== entry) return

      context.report({
        node,
        messageId: 'entryImport',
        data: {
          sibling: path.basename(file),
          entry: path.basename(entry) + path.extname(file),
        },
      })
    }

    return {
      ImportDeclaration(node) {
        if (node.importKind !== 'type') check(node, node.source)
      },
      ExportNamedDeclaration(node) {
        if (node.exportKind !== 'type') check(node, node.source)
      },
      ExportAllDeclaration(node) {
        if (node.exportKind !== 'type') check(node, node.source)
      },
      ImportExpression(node) {
        check(node, node.source)
      },
    }
  },
})
