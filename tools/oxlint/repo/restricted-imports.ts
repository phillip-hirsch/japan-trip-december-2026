// Options for Oxlint's no-restricted-imports. An override replaces a rule's
// options instead of merging them, so the browser override repeats the
// imports restricted everywhere.

const everywhere = {
  paths: [
    {
      name: 'sonner',
      message:
        'Use the toast component, src/components/ui/toast.tsx, for notifications.',
    },
    {
      name: 'radix-ui',
      message:
        'src/components/ui/ is shadcn/ui on Base UI. Build components on @base-ui/react, like the ones there, not Radix.',
    },
    {
      name: '@tanstack/react-router',
      importNames: ['useMatchRoute'],
      message:
        "Mark the current page with Link's own activeOptions and activeProps, as src/components/app-nav.tsx does.",
    },
  ],
  patterns: [
    {
      group: ['@radix-ui/*'],
      message:
        'src/components/ui/ is shadcn/ui on Base UI. Build components on @base-ui/react, like the ones there, not Radix.',
    },
  ],
}

const browserEffectMessage =
  "Browser code may value-import only Predicate, Data and Match from 'effect'; Schema and the Effect runtime cost about 75 KB gzip (docs/research/effect-v4.md). Use `import type`, or move the code to a server module."

/** Files bundled only for the browser. */
export const browserFiles = [
  'src/components/**',
  'src/routes/**',
  'src/trip/client/**',
  'src/hooks/**',
  'src/lib/**',
  'src/map/**',
  'src/offline/**',
  'src/router.tsx',
  'src/start.ts',
  'src/access/connection-status.ts',
  'src/access/server-fn-fetch.ts',
]

/** Tests and their helpers run in Node, so they may import anything. */
export const browserFileExceptions = ['**/*.test.ts', '**/*testing.ts']

export const restrictedImports = everywhere

export const browserRestrictedImports = {
  paths: [
    ...everywhere.paths,
    {
      name: 'effect',
      allowImportNames: ['Predicate', 'Data', 'Match'],
      allowTypeImports: true,
      message: browserEffectMessage,
    },
    {
      name: '@/trip/domain/domain',
      allowTypeImports: true,
      message:
        'Use `import type` for @/trip/domain/domain in browser code: its values are Effect Schemas, which stay on the server. Browser-safe helpers live beside it, such as @/trip/domain/checklist-items.',
    },
  ],
  patterns: [
    ...everywhere.patterns,
    {
      regex: '^effect/',
      allowTypeImports: true,
      message: browserEffectMessage,
    },
    {
      regex: '^@/trip/domain/domain\\.',
      allowTypeImports: true,
      message:
        'Use `import type` for the domain modules in browser code: their values are Effect Schemas, which stay on the server.',
    },
  ],
}
