import '@fontsource/barlow-condensed/latin-600.css'
import '@fontsource/barlow-condensed/latin-700.css'
import '@fontsource/source-sans-3/latin-400.css'
import '@fontsource/source-sans-3/latin-600.css'
import './estilos.css'

import { createClient } from '@supabase/supabase-js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { leerConfiguracion } from './configuracion.ts'
import { Mensaje } from './Mensaje.tsx'

function arrancar() {
  try {
    const { url, clavePublica } = leerConfiguracion(import.meta.env)
    // La sesión se guarda en el navegador, así no hay que entrar cada vez.
    return <App supabase={createClient(url, clavePublica)} />
  } catch (error) {
    return <Mensaje titulo="La aplicación no está configurada">{(error as Error).message}</Mensaje>
  }
}

createRoot(document.getElementById('raiz')!).render(<StrictMode>{arrancar()}</StrictMode>)
