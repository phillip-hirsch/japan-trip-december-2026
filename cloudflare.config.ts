import { bindings, defineConfig, exports } from 'cf/config'

export default defineConfig({
  worker: {
    name: 'japan-trip-december-2026',
    compatibilityDate: '2025-09-02',
    compatibilityFlags: ['nodejs_compat'],
    entrypoint: 'src/server.ts',
    workersDev: true,
    previewUrls: false,
    access: {
      dev: {
        aud: '4a42be9cb2b73a1d0fec42fcf0e6523227a9e4a988fffd69b689b012cfebdf16',
        identity: {
          email: 'phillip@350home.com',
        },
      },
    },
    env: {
      ACCESS_TEAM_DOMAIN: bindings.text(
        'https://phillip-hirsch.cloudflareaccess.com',
      ),
      ACCESS_AUD: bindings.text(
        '4a42be9cb2b73a1d0fec42fcf0e6523227a9e4a988fffd69b689b012cfebdf16',
      ),
      ACCESS_ALLOWED_EMAIL: bindings.text('phillip@350home.com'),
      // Plugin 2 loads .dev.vars only for declared secrets. Never set this
      // on the deployed Worker.
      ACCESS_DEV_SIMULATION: bindings.secret(),
      TRIP_STORE: bindings.durableObject({
        worker: 'japan-trip-december-2026',
        exportName: 'TripStore',
      }),
    },
    exports: {
      TripStore: exports.durableObject({
        storage: 'sqlite',
      }),
    },
  },
})
