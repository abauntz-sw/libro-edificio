// El Archivo y la Papelera (tarea 1.9, issue #78).
//
// La base de datos ya decide quién ve qué (veo_documento): la administración, la consulta y la guarda
// ven todo el Libro; una empresa, solo lo de sus instalaciones; y la papelera, solo la administración.
// Aquí no se filtra por perfil: se pide y se muestra lo que llega.
//
// Lo que no depende de la pantalla está aquí: leer, buscar, agrupar, la caducidad y la papelera.
// Así se puede probar sin navegador.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface Documento {
  id: string
  tipo: string
  titulo: string
  /** Como 2026-03-10. */
  fecha: string
  emisor: string
  caduca: string | null
  nombreOriginal: string
  /** Identificadores de sus instalaciones. Vacío: es de todo el edificio. */
  instalaciones: string[]
  /** Desde cuándo está en la papelera. null: está en el Archivo. */
  eliminadoEn: string | null
}

/** Los nombres de los tipos y de las instalaciones que ve esta persona, por identificador. */
export interface Catalogo {
  tipos: Map<string, string>
  instalaciones: Map<string, string>
}

/** De cuántos en cuántos se piden. Con la documentación real puede haber muchos cientos. */
export const POR_TANDA = 500

const CAMPOS = 'id, tipo_id, titulo, fecha, emisor, caduca, nombre_original, eliminado_en, documento_instalaciones(instalacion_id)'

interface FilaDocumento {
  id: string
  tipo_id: string
  titulo: string
  fecha: string
  emisor: string
  caduca: string | null
  nombre_original: string
  eliminado_en: string | null
  documento_instalaciones: { instalacion_id: string }[] | null
}

const aDocumento = (f: FilaDocumento): Documento => ({
  id: f.id, tipo: f.tipo_id, titulo: f.titulo, fecha: f.fecha, emisor: f.emisor, caduca: f.caduca,
  nombreOriginal: f.nombre_original, eliminadoEn: f.eliminado_en,
  instalaciones: (f.documento_instalaciones ?? []).map(d => d.instalacion_id),
})

/**
 * Lee los documentos del Archivo, o los de la Papelera, por tandas de POR_TANDA.
 * Cada vez que llega una tanda avisa con todo lo que lleva leído: así la lista sale enseguida
 * aunque haya muchos. El Archivo, del más nuevo al más antiguo; la Papelera, por fecha de borrado.
 */
export async function leerDocumentos(
  supabase: SupabaseClient, papelera: boolean, alLlegar: (hasta: Documento[]) => void = () => {},
): Promise<Documento[]> {
  const todos: Documento[] = []
  for (let desde = 0; ; desde += POR_TANDA) {
    const consulta = supabase.from('documentos').select(CAMPOS)
    const filtrada = papelera
      ? consulta.not('eliminado_en', 'is', null).order('eliminado_en', { ascending: false })
      : consulta.is('eliminado_en', null).order('fecha', { ascending: false })
    // El identificador desempata: sin él, dos tandas podrían repetir o saltarse un documento de la misma fecha.
    const { data, error } = await filtrada.order('id').range(desde, desde + POR_TANDA - 1)
    if (error) throw new Error(`No se pudieron leer los documentos: ${error.message}`)
    todos.push(...(data as FilaDocumento[]).map(aDocumento))
    alLlegar([...todos])
    if (data.length < POR_TANDA) return todos
  }
}

/** Lee los nombres de los tipos de documento y de las instalaciones que ve esta persona. */
export async function leerCatalogo(supabase: SupabaseClient): Promise<Catalogo> {
  const [tipos, instalaciones] = await Promise.all([
    supabase.from('tipos_documento').select('id, nombre'),
    supabase.from('instalaciones').select('id, nombre'),
  ])
  if (tipos.error) throw new Error(`No se pudieron leer los tipos de documento: ${tipos.error.message}`)
  if (instalaciones.error) throw new Error(`No se pudieron leer las instalaciones: ${instalaciones.error.message}`)
  const mapa = (filas: { id: string; nombre: string }[]) => new Map(filas.map(f => [f.id, f.nombre]))
  return { tipos: mapa(tipos.data), instalaciones: mapa(instalaciones.data) }
}

/** Los días antes de caducar en que un documento se señala. Los mismos que la vista `avisos`. */
export const DIAS_AVISO = 90

export type Caducidad =
  | { estado: 'sin' }
  | { estado: 'caducado' }
  | { estado: 'pronto'; dias: number }
  | { estado: 'vigente' }

/** La fecha de hoy en este aparato, como 2026-11-23. */
export function hoy(ahora = new Date()): string {
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`
}

/** Días de una fecha a otra, las dos como 2026-11-23. */
const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000)

/** Si un documento está caducado, caduca pronto (en DIAS_AVISO días o menos) o sigue vigente. */
export function caducidad(caduca: string | null, dia = hoy()): Caducidad {
  if (!caduca) return { estado: 'sin' }
  const dias = diasEntre(dia, caduca)
  if (dias < 0) return { estado: 'caducado' }
  if (dias <= DIAS_AVISO) return { estado: 'pronto', dias }
  return { estado: 'vigente' }
}

/** Lo que dice la marca de caducidad: «Caducado», «Caduca hoy», «Caduca mañana», «Caduca en 12 días». */
export function textoCaducidad(c: Caducidad): string {
  if (c.estado === 'caducado') return 'Caducado'
  if (c.estado === 'vigente') return 'Vigente'
  if (c.estado === 'sin') return 'Sin caducidad'
  return c.dias === 0 ? 'Caduca hoy' : c.dias === 1 ? 'Caduca mañana' : `Caduca en ${c.dias} días`
}

/** Una fecha como «10 mar 2026». Vale también una fecha con hora, como la de `eliminado_en`. */
export const fechaCorta = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })

/** El mensaje de un fallo al leer o cambiar algo. Sin red, lo dice así, que se entiende mejor. */
export const mensajeError = (error: Error) => navigator.onLine ? error.message : 'No hay conexión. Cuando vuelva, pulsa Reintentar.'

/** Minúsculas y sin acentos: «Calefacción» y «calefaccion» se encuentran igual. La ñ queda como n. */
export const sinAcentos = (texto: string) => texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Los nombres de las instalaciones de un documento. Las que esta persona no ve no salen. */
export const nombresInstalaciones = (d: Documento, catalogo: Catalogo) =>
  d.instalaciones.flatMap(id => catalogo.instalaciones.get(id) ?? [])

/**
 * Los documentos que tienen todas las palabras buscadas, en el título, el emisor, el nombre del archivo
 * recibido, el tipo o la instalación. Sin distinguir acentos ni mayúsculas, y en cualquier orden:
 * «caldera revision» encuentra «Revisión de la caldera».
 */
export function buscar(documentos: Documento[], texto: string, catalogo: Catalogo): Documento[] {
  const palabras = sinAcentos(texto).split(/\s+/).filter(p => p !== '')
  if (palabras.length === 0) return documentos
  return documentos.filter(d => {
    const donde = sinAcentos([
      d.titulo, d.emisor, d.nombreOriginal, catalogo.tipos.get(d.tipo) ?? d.tipo, ...nombresInstalaciones(d, catalogo),
    ].join(' '))
    return palabras.every(p => donde.includes(p))
  })
}

export type Agrupar = 'instalacion' | 'tipo' | 'ano'

/** El grupo de los documentos que no son de ninguna instalación. */
export const EDIFICIO = '_edificio'

export interface Grupo {
  clave: string
  nombre: string
  cuenta: number
}

// Orden alfabético en español: la «Ñ» después de la «N» y sin distinguir tildes ni mayúsculas.
const orden = new Intl.Collator('es', { sensitivity: 'base' })

/** Si un documento está en un grupo. Sin grupo, están todos. */
export function enGrupo(d: Documento, agrupar: Agrupar, clave: string | null): boolean {
  if (clave === null) return true
  if (agrupar === 'tipo') return d.tipo === clave
  if (agrupar === 'ano') return d.fecha.startsWith(clave)
  return clave === EDIFICIO ? d.instalaciones.length === 0 : d.instalaciones.includes(clave)
}

/**
 * Los grupos para organizar el Archivo, cada uno con cuántos documentos tiene.
 * - Por instalación: todas las que ve esta persona, aunque no tengan documentos (así se ve lo que falta),
 *   y al final «Edificio en general», con los que no son de ninguna. Una empresa no lo tiene: no los ve.
 * - Por tipo: los tipos que hay, por orden alfabético.
 * - Por año: los años que hay, del más nuevo al más antiguo.
 */
export function grupos(documentos: Documento[], agrupar: Agrupar, catalogo: Catalogo, esEmpresa: boolean): Grupo[] {
  let lista: { clave: string; nombre: string }[]
  if (agrupar === 'instalacion') {
    lista = [...catalogo.instalaciones].map(([clave, nombre]) => ({ clave, nombre })).sort((a, b) => orden.compare(a.nombre, b.nombre))
    if (!esEmpresa) lista.push({ clave: EDIFICIO, nombre: 'Edificio en general' })
  } else if (agrupar === 'tipo') {
    lista = [...new Set(documentos.map(d => d.tipo))]
      .map(clave => ({ clave, nombre: catalogo.tipos.get(clave) ?? clave }))
      .sort((a, b) => orden.compare(a.nombre, b.nombre))
  } else {
    lista = [...new Set(documentos.map(d => d.fecha.slice(0, 4)))].sort().reverse().map(clave => ({ clave, nombre: clave }))
  }
  return lista.map(g => ({ ...g, cuenta: documentos.filter(d => enGrupo(d, agrupar, g.clave)).length }))
}

/** Si hay que mirar un documento: está caducado o caduca pronto. */
export const pideAtencion = (d: Documento, dia = hoy()) => ['caducado', 'pronto'].includes(caducidad(d.caduca, dia).estado)

/**
 * Pide el PDF a la función «archivos», que comprueba que esta persona puede verlo.
 * Devuelve el archivo, o lanza un error que se le puede contar a la persona.
 */
export async function bajarDocumento(supabase: SupabaseClient, id: string): Promise<Blob> {
  let respuesta: { data: unknown; error: unknown }
  try {
    // Con un PDF, la librería devuelve un Blob. Con poca cobertura, un PDF grande tarda: 2 minutos.
    respuesta = await supabase.functions.invoke(`archivos?id=${encodeURIComponent(id)}`, { method: 'GET', timeout: 120_000 })
  } catch {
    throw new Error(SIN_RED)
  }
  if (respuesta.error) throw new Error(await motivoFuncion(respuesta.error))
  if (!(respuesta.data instanceof Blob)) throw new Error('La función no ha devuelto el documento. Vuelve a intentarlo.')
  return respuesta.data
}

const SIN_RED = 'No hay conexión. Prueba otra vez cuando haya cobertura.'

/** Lo que dice la función cuando no entrega el documento: «No se encuentra ese documento», por ejemplo. */
async function motivoFuncion(error: unknown): Promise<string> {
  const respuesta: unknown = (error as { context?: unknown } | null)?.context
  // Sin respuesta, es la red.
  if (!(respuesta instanceof Response)) return SIN_RED
  if (respuesta.status === 401) return 'La sesión ha caducado. Vuelve a entrar.'
  const cuerpo = await respuesta.json().catch(() => null) as { error?: string } | null
  return cuerpo?.error ?? `No se ha podido bajar el documento (la función respondió ${respuesta.status}).`
}

/** Manda un documento a la papelera. Solo puede la administración: la base de datos lo comprueba. */
export async function aPapelera(supabase: SupabaseClient, id: string, usuarioId: string | null): Promise<void> {
  await cambiar(supabase, id, { eliminado_en: new Date().toISOString(), eliminado_por: usuarioId }, 'enviar a la papelera')
}

/** Saca un documento de la papelera y lo devuelve al Archivo. */
export async function recuperar(supabase: SupabaseClient, id: string): Promise<void> {
  await cambiar(supabase, id, { eliminado_en: null, eliminado_por: null }, 'recuperar')
}

async function cambiar(supabase: SupabaseClient, id: string, campos: Record<string, string | null>, que: string) {
  // count: si la base de datos no deja cambiarlo, no da error: simplemente no cambia ninguna fila.
  const { error, count } = await supabase.from('documentos').update(campos, { count: 'exact' }).eq('id', id)
  if (error) throw new Error(`No se ha podido ${que} el documento: ${error.message}`)
  if (count === 0) throw new Error(`No se ha podido ${que} el documento: no tienes permiso, o ya no está.`)
}
