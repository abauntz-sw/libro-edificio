import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { esClaveDeServicio } from './src/configuracion.ts'

export default defineConfig(({ mode }) => {
  // Todo lo que empieza por VITE_ acaba dentro de la web. Si alguien pone ahí la clave
  // de servicio, se para antes de construir nada.
  const env = loadEnv(mode, import.meta.dirname, 'VITE_')
  if (esClaveDeServicio(env.VITE_SUPABASE_CLAVE_PUBLICA ?? '')) {
    throw new Error('VITE_SUPABASE_CLAVE_PUBLICA lleva la clave de servicio. Pon la clave pública.')
  }

  return {
    plugins: [
      react(),
      // Convierte la web en una PWA: se puede instalar en el móvil y se abre sin conexión.
      VitePWA({
        // Cuando se publica una versión nueva, se actualiza sola al volver a abrir la app.
        registerType: 'autoUpdate',
        manifest: {
          name: 'Libro del Edificio',
          short_name: 'Libro',
          description: 'Documentos, instalaciones, revisiones y partes de trabajo de un edificio.',
          lang: 'es',
          display: 'standalone',
          theme_color: '#ffffff',
          background_color: '#eef1f2',
          icons: [
            { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        // Lo que se guarda en el móvil para abrir la app sin conexión.
        workbox: { globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'] },
      }),
    ],
  }
})
