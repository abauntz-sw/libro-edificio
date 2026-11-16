// La exportación diaria: deja el índice de cada edificio en su repositorio.
//
// La lanza Supabase cada noche (ver el README de las funciones). Para cada edificio:
//   1. Pide a la base de datos los cuatro CSV de indice/, con exportar_indice.
//   2. Los deja en el repositorio del edificio en un solo commit, y solo si algo ha cambiado.
// Si un edificio falla, sigue con los demás y al final responde con error, para que se vea en el registro.

import type { Repositorio } from '../archivos/github.ts'

export interface Edificio {
  id: string
  nombre: string
  repositorio: string
}

/** Lo que se pide a la base de datos. Los tests usan una de mentira. */
export interface Libro {
  edificios(): Promise<Edificio[]>
  indice(edificio: string): Promise<{ archivo: string; contenido: string }[]>
}

export interface Piezas {
  /** La clave secreta de Supabase. Quien llama tiene que traerla en la cabecera `apikey`. */
  claveSecreta: string
  libro: Libro
  repositorio: Repositorio
  /** La fecha de hoy en España, para el mensaje del commit. */
  hoy?: () => string
}

export interface Resultado {
  edificio: string
  commit?: string | null
  cambiados?: string[]
  error?: string
}

const hoyEnEspana = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())

/**
 * Compara la clave sin dar pistas por el tiempo que tarda.
 * Una comparación normal se para en la primera letra distinta: midiendo, se podría adivinar letra a letra.
 * Aquí se comparan las huellas de las dos, siempre enteras.
 */
async function mismaClave(traida: string, buena: string): Promise<boolean> {
  const huella = async (texto: string) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)))
  const [a, b] = await Promise.all([huella(traida), huella(buena)])
  let diferencia = 0
  for (let i = 0; i < a.length; i++) diferencia |= a[i] ^ b[i]
  return diferencia === 0 && buena !== ''
}

export async function atender(peticion: Request, piezas: Piezas): Promise<Response> {
  if (peticion.method !== 'POST') return Response.json({ error: 'Usa POST.' }, { status: 405 })
  if (!await mismaClave(peticion.headers.get('apikey') ?? '', piezas.claveSecreta)) {
    return Response.json({ error: 'Esta función solo la lanza la tarea programada.' }, { status: 401 })
  }

  const fecha = (piezas.hoy ?? hoyEnEspana)()
  const resultados: Resultado[] = []
  for (const edificio of await piezas.libro.edificios()) {
    try {
      const archivos = new Map(
        (await piezas.libro.indice(edificio.id)).map(f => [f.archivo, new TextEncoder().encode(f.contenido)]),
      )
      const cambio = await piezas.repositorio.actualizar(edificio.repositorio, archivos, `Actualiza el índice (${fecha})`)
      resultados.push({ edificio: edificio.nombre, ...cambio })
    } catch (error) {
      console.error(`Exportación de «${edificio.nombre}»:`, error)
      resultados.push({ edificio: edificio.nombre, error: error instanceof Error ? error.message : String(error) })
    }
  }

  const fallos = resultados.filter(r => r.error).length
  return Response.json({ fecha, resultados }, { status: fallos ? 500 : 200 })
}
