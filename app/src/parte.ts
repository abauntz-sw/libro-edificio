// Registrar un parte de trabajo (tarea 1.6, sin fotos todavía).
//
// El parte se inserta en la tabla `partes`. La base de datos pone sola el edificio, el autor y la empresa,
// y comprueba que cada perfil registre solo lo suyo. Si el parte cierra una revisión, la base de datos
// mueve su próxima fecha. Aquí solo se ofrece a cada uno lo que puede elegir, para no llevarle a un error.
//
// El certificado, si lo hay, es un PDF que se archiva como documento con la función «archivos»,
// antes que el parte: el parte lo apunta en `certificado_id`, y la base de datos no deja apuntar
// un documento que todavía no existe.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Perfil } from './acceso.ts'
import { clasificar, type Resultado } from './cola.ts'
import { comprobarArchivo } from './subida.ts'

export type TipoParte = 'preventivo' | 'correctivo' | 'inspeccion' | 'urgencia' | 'comprobacion' | 'incidencia'

/** Los nombres que ve la persona, los mismos que en el prototipo. */
export const NOMBRE_TIPO: Record<TipoParte, string> = {
  preventivo: 'Preventivo',
  correctivo: 'Reparación',
  inspeccion: 'Inspección',
  urgencia: 'Urgencia',
  comprobacion: 'Comprobación',
  incidencia: 'Incidencia',
}

/** Qué tipos puede registrar cada perfil. Es la misma regla que `puedo_registrar_parte` en la base de datos. */
export function tiposDe(perfil: Perfil): TipoParte[] {
  switch (perfil) {
    case 'admin': return ['preventivo', 'correctivo', 'inspeccion', 'urgencia', 'comprobacion', 'incidencia']
    case 'guarda': return ['comprobacion', 'incidencia']
    case 'empresa': return ['preventivo', 'correctivo', 'inspeccion', 'urgencia']
    case 'consulta': return []
  }
}

export interface Instalacion {
  id: string
  nombre: string
}

export interface Revision {
  id: string
  instalacion_id: string
  descripcion: string
  periodicidad_meses: number | null
  responsable_id: string | null
  proxima: string | null
}

/**
 * Las revisiones que la persona puede cerrar en esa instalación.
 * La administración, todas. La guarda y las empresas, solo las que tienen a su cargo.
 */
export function revisionesDe(revisiones: Revision[], instalacion: string, perfil: Perfil, contactoId: string | null): Revision[] {
  return revisiones.filter(r =>
    r.instalacion_id === instalacion && (perfil === 'admin' || (contactoId !== null && r.responsable_id === contactoId)))
}

/** La fecha de hoy en el aparato, como 2026-11-16. No en hora universal: a las 00:30 en España aún sería ayer. */
export function hoyLocal(ahora = new Date()): string {
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`
}

/**
 * Suma meses a una fecha, igual que PostgreSQL: el 31 de enero más un mes es el 28 o 29 de febrero.
 * JavaScript, en cambio, pasaría al 3 de marzo. Sirve para avisar de la próxima fecha antes de enviar.
 */
export function sumarMeses(fecha: string, meses: number): string {
  const [ano, mes, dia] = fecha.split('-').map(Number)
  const total = mes - 1 + meses
  const anoNuevo = ano + Math.floor(total / 12)
  const mesNuevo = ((total % 12) + 12) % 12
  const ultimoDia = new Date(Date.UTC(anoNuevo, mesNuevo + 1, 0)).getUTCDate()
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${anoNuevo}-${dos(mesNuevo + 1)}-${dos(Math.min(dia, ultimoDia))}`
}

/** Lo que la persona ha rellenado. */
export interface Borrador {
  instalacion: string
  revision: string
  tipo: TipoParte | ''
  descripcion: string
  /** Solo para una revisión sin periodicidad: la persona dice cuándo toca la siguiente. */
  proxima: string
}

export const BORRADOR_VACIO: Borrador = { instalacion: '', revision: '', tipo: '', descripcion: '', proxima: '' }

/** Dice qué falta para poder enviar, o `undefined` si el parte está listo. */
export function faltaEnParte(b: Borrador, revision: Revision | undefined, hoy: string): string | undefined {
  if (!b.instalacion || !b.tipo || !b.descripcion.trim()) return 'Elige dónde y qué has hecho, y cuéntalo en una frase.'
  if (revision && revision.periodicidad_meses === null && !(b.proxima > hoy)) {
    return 'Indica una próxima fecha posterior a hoy para esta revisión.'
  }
  return undefined
}

/** La fila que se inserta. El identificador lo crea el móvil, así reenviar el parte no lo duplica. */
export function filaParte(id: string, b: Borrador, revision: Revision | undefined, hoy: string, certificadoId: string | null = null) {
  return {
    id,
    instalacion_id: b.instalacion,
    fecha: hoy,
    tipo: b.tipo,
    descripcion: b.descripcion.trim(),
    revision_id: revision?.id ?? null,
    // La próxima fecha solo se manda si la revisión no tiene periodicidad. Si la tiene, la calcula la base de datos.
    proxima_revision: revision && revision.periodicidad_meses === null ? b.proxima : null,
    certificado_id: certificadoId,
  }
}

/** El certificado de un parte, tal como se guarda en el móvil hasta que llega. */
export interface Certificado {
  /** El identificador del documento. Se crea al elegir el archivo: si el envío se repite, no se duplica. */
  id: string
  /** Una copia del PDF. Así sigue ahí aunque el archivo original se mueva o se borre del móvil. */
  archivo: Blob
  nombre: string
  titulo: string
  fecha: string
  instalacion: string
}

/**
 * Quién puede adjuntar un certificado: la administración y las empresas, como en el prototipo.
 * La guarda no archiva documentos (`puedo_archivar`), y la consulta no registra partes.
 */
export const puedeAdjuntarCertificado = (perfil: Perfil) => perfil === 'admin' || perfil === 'empresa'

/** El título del certificado en el Archivo. Corto y con lo que lo distingue: qué se hizo y dónde. */
export function tituloCertificado(tipo: TipoParte, instalacion: string): string {
  return `Certificado: ${NOMBRE_TIPO[tipo].toLowerCase()} en ${instalacion}`.slice(0, 200)
}

/**
 * Prepara el certificado elegido. Devuelve por qué no vale (vacío, demasiado grande o no es un PDF)
 * o una copia del archivo.
 */
export async function leerCertificado(archivo: File): Promise<{ error: string } | { copia: Blob }> {
  const error = await comprobarArchivo(archivo)
  if (error) return { error }
  return { copia: new Blob([await archivo.arrayBuffer()], { type: 'application/pdf' }) }
}

/** El formulario que espera la función «archivos»: un documento de tipo certificado, de la instalación del parte. */
export function formularioCertificado(c: Certificado): FormData {
  const datos = new FormData()
  datos.append('archivo', c.archivo, c.nombre)
  datos.append('id', c.id)
  datos.append('tipo', 'certificado')
  datos.append('titulo', c.titulo)
  datos.append('fecha', c.fecha)
  datos.append('instalaciones', c.instalacion)
  return datos
}

/**
 * Decide si un fallo de la función «archivos» es pasajero o definitivo, como `clasificar` con la base de datos.
 * Sin respuesta, es la red. 401 es la sesión, que se renueva sola; 408, 429 y los 5xx, el servidor.
 * El resto (sin permiso, no es un PDF, demasiado grande) no se arregla reintentando.
 */
export async function clasificarFuncion(error: unknown): Promise<Resultado> {
  const respuesta: unknown = (error as { context?: unknown } | null)?.context
  if (!(respuesta instanceof Response)) return { tipo: 'sin-conexion' }
  const { status } = respuesta
  if (status === 401 || status === 408 || status === 429 || status >= 500) return { tipo: 'sin-conexion' }
  const cuerpo = await respuesta.json().catch(() => null) as { error?: string } | null
  return { tipo: 'rechazado', motivo: `El certificado no se ha podido archivar: ${cuerpo?.error ?? `la función respondió ${status}`}` }
}

/** Archiva el certificado. Si ya estaba (el mismo identificador y el mismo archivo), la función no hace nada. */
export async function subirCertificado(supabase: SupabaseClient, c: Certificado): Promise<Resultado> {
  try {
    // Un PDF tarda más que un parte. Con poca cobertura se le dan 2 minutos.
    const { error } = await supabase.functions.invoke('archivos', { body: formularioCertificado(c), timeout: 120_000 })
    return error ? await clasificarFuncion(error) : { tipo: 'enviado' }
  } catch {
    return { tipo: 'sin-conexion' }
  }
}

/** Las instalaciones que la persona ve, menos las que no aplican, y las revisiones previstas. */
export async function leerDatosParte(supabase: SupabaseClient): Promise<{ instalaciones: Instalacion[]; revisiones: Revision[] }> {
  const [instalaciones, revisiones] = await Promise.all([
    supabase.from('instalaciones').select('id, nombre').neq('estado', 'no-aplica').order('nombre'),
    supabase.from('revisiones').select('id, instalacion_id, descripcion, periodicidad_meses, responsable_id, proxima').order('proxima'),
  ])
  if (instalaciones.error) throw new Error(`No se pudieron leer las instalaciones: ${instalaciones.error.message}`)
  if (revisiones.error) throw new Error(`No se pudieron leer las revisiones: ${revisiones.error.message}`)
  return { instalaciones: instalaciones.data, revisiones: revisiones.data }
}

/** La fila que se inserta en `partes`. */
export type FilaParte = ReturnType<typeof filaParte>

/**
 * Envía el parte, y antes su certificado si lo lleva. Si ya había llegado (el mismo identificador),
 * no hace nada: `on conflict do nothing`.
 * Dice si ha llegado, si hay que reintentarlo más tarde o si la base de datos lo rechaza.
 */
export async function enviarParte(supabase: SupabaseClient, fila: FilaParte, certificado?: Certificado): Promise<Resultado> {
  if (certificado) {
    const resultado = await subirCertificado(supabase, certificado)
    if (resultado.tipo !== 'enviado') return resultado
  }
  try {
    // Con una raya de cobertura, una petición puede quedarse colgada. A los 20 segundos se da por no llegada.
    // Si en realidad llegó, reenviarla no duplica nada.
    const { error } = await supabase.from('partes').upsert(fila, { onConflict: 'id', ignoreDuplicates: true })
      .abortSignal(AbortSignal.timeout(20_000))
    return error ? clasificar(error) : { tipo: 'enviado' }
  } catch {
    // Sin red, la librería a veces lanza en vez de devolver el error.
    return { tipo: 'sin-conexion' }
  }
}
