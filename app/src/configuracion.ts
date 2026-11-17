// Lee de las variables de entorno con qué proyecto de Supabase habla la aplicación.

export interface Configuracion {
  url: string
  clavePublica: string
}

/**
 * Dice si una clave es la de servicio, la que salta todos los permisos.
 * Las claves nuevas empiezan por `sb_secret_`. Las antiguas llevan dentro el rol `service_role`.
 */
export function esClaveDeServicio(clave: string): boolean {
  if (clave.startsWith('sb_secret_')) return true
  const partes = clave.split('.')
  if (partes.length !== 3) return false
  try {
    const datos = JSON.parse(atob(partes[1].replaceAll('-', '+').replaceAll('_', '/')))
    return datos.role === 'service_role'
  } catch {
    return false
  }
}

/** Devuelve la dirección y la clave pública, o lanza un error que explica qué falta. */
export function leerConfiguracion(env: Record<string, string | undefined>): Configuracion {
  const url = env.VITE_SUPABASE_URL?.trim()
  const clavePublica = env.VITE_SUPABASE_CLAVE_PUBLICA?.trim()

  if (!url || !clavePublica) {
    throw new Error('Falta la dirección o la clave pública de Supabase. Copia .env.ejemplo como .env y rellénalo.')
  }
  if (!URL.canParse(url)) {
    throw new Error('VITE_SUPABASE_URL no es una dirección válida.')
  }
  if (esClaveDeServicio(clavePublica)) {
    throw new Error('VITE_SUPABASE_CLAVE_PUBLICA lleva la clave de servicio. Pon la clave pública.')
  }
  return { url, clavePublica }
}
