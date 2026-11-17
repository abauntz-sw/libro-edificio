// Lo último que se leyó bien, para poder trabajar sin cobertura (tarea 1.7).
//
// Sin red no se puede preguntar quién es la persona, ni qué instalaciones y revisiones tiene.
// Sin eso, el formulario de parte no se podría ni abrir en el refugio. Por eso se guarda la última
// respuesta buena de cada persona y se usa cuando la lectura falla.
//
// No da ningún permiso: al enviar, la base de datos vuelve a comprobarlo todo. Si a alguien le han
// quitado el acceso, su parte llegará rechazado y lo verá.

export interface Recordado<T> {
  datos: T
  /** Verdadero si la lectura ha fallado y son los datos de la última vez. */
  deMemoria: boolean
}

type Guardar = Pick<Storage, 'getItem' | 'setItem'>

/** El almacén del navegador, si se deja usar. En modo privado o con las cookies bloqueadas puede fallar. */
function almacenDelNavegador(): Guardar | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

/**
 * Lee con `leer` y guarda el resultado bajo `clave`. Si la lectura falla y hay algo guardado, devuelve eso.
 * Si no hay nada guardado, deja pasar el error.
 */
export async function conRecuerdo<T>(
  clave: string, leer: () => Promise<T>, almacen = almacenDelNavegador(), hayRed = () => globalThis.navigator?.onLine !== false,
): Promise<Recordado<T>> {
  const recordado = (): Recordado<T> | undefined => {
    let guardado: string | null = null
    try { guardado = almacen?.getItem(clave) ?? null } catch { /* no se deja leer */ }
    return guardado === null ? undefined : { datos: JSON.parse(guardado) as T, deMemoria: true }
  }
  // Si el móvil sabe que no tiene red, no se espera: la librería reintenta varias veces antes de rendirse.
  if (!hayRed()) {
    const r = recordado()
    if (r) return r
  }
  try {
    const datos = await leer()
    try { almacen?.setItem(clave, JSON.stringify(datos)) } catch { /* sin espacio: se sigue sin guardar */ }
    return { datos, deMemoria: false }
  } catch (error) {
    const r = recordado()
    if (!r) throw error
    return r
  }
}

/** Las claves, en un solo sitio. Llevan el usuario, para que en un móvil compartido no se mezclen. */
export const CLAVE = {
  acceso: (authId: string) => `libro:${authId}:acceso`,
  parte: (authId: string) => `libro:${authId}:parte`,
}
