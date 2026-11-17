// Crea los iconos de la PWA a partir de public/icono.svg, con `npm run iconos`.
// Los PNG que salen se guardan en Git: solo hay que repetirlo si cambia el icono.
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

const verde = '#1d5c4d'

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    // El móvil recorta estos dos iconos, así que el fondo llega hasta el borde.
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: verde } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: verde } },
  },
  images: ['public/icono.svg'],
})
