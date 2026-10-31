import { eslintCompatPlugin } from 'vite-plus/lint/plugins'

import { noSplitModuleEntryImportRule } from './no-split-module-entry-import.ts'

// Rules for this repository's own conventions (AGENTS.md).
const repoPlugin = eslintCompatPlugin({
  meta: { name: 'repo' },
  rules: {
    'no-split-module-entry-import': noSplitModuleEntryImportRule,
  },
})

export default repoPlugin
