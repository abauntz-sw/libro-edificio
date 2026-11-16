// Tests de extremo a extremo: la web de verdad, en un navegador de verdad.
// No usan ningún proyecto de Supabase: cada test responde por él con datos ficticios (ver e2e/).
//   npx playwright install chromium   (una vez)
//   npm run e2e
// En Windows, sin descargar Chromium, sirve Edge: PLAYWRIGHT_CANAL=msedge npm run e2e
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: process.env.PLAYWRIGHT_CANAL || undefined,
    // El service worker atiende peticiones por su cuenta, y entonces el test no las vería.
    serviceWorkers: 'block',
    locale: 'es-ES',
    trace: 'retain-on-failure',
  },
  webServer: {
    // Se construye aparte, en dist-e2e, para no pisar la web de verdad.
    command: 'npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    // Una dirección que no existe: todas sus peticiones las contesta el test.
    // Las variables del entorno mandan sobre las de .env, así que no importa lo que tengas en el tuyo.
    env: { VITE_SUPABASE_URL: 'http://supabase.prueba', VITE_SUPABASE_CLAVE_PUBLICA: 'sb_publishable_prueba' },
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
