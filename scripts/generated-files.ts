// Files a tool writes, not a person or agent. The formatter and the
// pre-commit token limit both skip them.
export const generatedFiles = [
  'pnpm-lock.yaml',
  'public/map/**',
  'src/routeTree.gen.ts',
  'src/trip/rail-geometry.json',
  'worker-configuration.d.ts',
]
