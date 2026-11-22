// Registrar un parte de trabajo (tarea 1.6).
//
// El parte se inserta en la tabla `partes`. La base de datos pone sola el edificio, el autor y la empresa,
// y comprueba que cada perfil registre solo lo suyo. Si el parte cierra una revisión, la base de datos
// mueve su próxima fecha. Aquí solo se ofrece a cada uno lo que puede elegir, para no llevarle a un error.
//
// El certificado, si lo hay, es un PDF que se archiva como documento con la función «archivos»,
// antes que el parte: el parte lo apunta en `certificado_id`, y la base de datos no deja apuntar
// un documento que todavía no existe.
//
// Las fotos van al revés: después del parte, una a una, porque cada foto apunta a su parte.
// Se comprimen en el móvil al elegirlas (ver fotos.ts).

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
 * `que` dice qué no ha llegado, para empezar el motivo.
 */
export async function clasificarFuncion(error: unknown, que = 'El certificado no se ha podido archivar'): Promise<Resultado> {
  const respuesta: unknown = (error as { context?: unknown } | null)?.context
  if (!(respuesta instanceof Response)) return { tipo: 'sin-conexion' }
  const { status } = respuesta
  if (status === 401 || status === 408 || status === 429 || status >= 500) return { tipo: 'sin-conexion' }
  const cuerpo = await respuesta.json().catch(() => null) as { error?: string } | null
  return { tipo: 'rechazado', motivo: `${que}: ${cuerpo?.error ?? `la función respondió ${status}`}` }
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

/** Una foto de un parte, tal como se guarda en el móvil hasta que llega. */
export interface Foto {
  /** El identificador de la foto. Se crea al elegirla: si el envío se repite, no se duplica. */
  id: string
  /** La foto ya comprimida, en JPEG. */
  archivo: Blob
  /** El nombre del archivo elegido, para que la persona la reconozca. No se envía. */
  nombre: string
}

/** El formulario que espera la función «archivos» para una foto: la foto, su identificador y su parte. */
export function formularioFoto(f: Foto, parte: string): FormData {
  const datos = new FormData()
  datos.append('archivo', f.archivo, `${f.id}.jpg`)
  datos.append('id', f.id)
  datos.append('parte', parte)
  return datos
}

/** Sube una foto de un parte que ya ha llegado. Si ya estaba, la función no hace nada. */
export async function subirFoto(supabase: SupabaseClient, f: Foto, parte: string): Promise<Resultado> {
  try {
    const { error } = await supabase.functions.invoke('archivos', { body: formularioFoto(f, parte), timeout: 60_000 })
    return error ? await clasificarFuncion(error, 'Motivo') : { tipo: 'enviado' }
  } catch {
    return { tipo: 'sin-conexion' }
  }
}

/** Lo que acompaña al parte, para los mensajes: «su certificado y 2 fotos». Vacío si no lleva nada. */
export function loQueLleva(certificado: boolean, fotos: number): string {
  const cosas: string[] = []
  if (certificado) cosas.push('su certificado')
  if (fotos > 0) cosas.push(fotos === 1 ? 'una foto' : `${fotos} fotos`)
  return cosas.join(' y ')
}

/** Lo que ya ha llegado de un parte, para que la cola no lo vuelva a enviar. */
export type Llegada = { que: 'certificado' } | { que: 'parte' } | { que: 'foto'; id: string }

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
 * Envía el parte: antes su certificado, si lo lleva, y después sus fotos. Si el parte ya había llegado
 * (el mismo identificador), la base de datos no hace nada: `on conflict do nothing`. Con el certificado
 * y las fotos pasa lo mismo en la función «archivos».
 *
 * Dice si ha llegado, si hay que reintentarlo más tarde o si la base de datos lo rechaza.
 * Cada cosa que llega se avisa con `llega`, para que la cola no la vuelva a enviar.
 *
 * Si el parte llega pero una foto se rechaza, el parte cuenta como enviado, con un aviso:
 * el parte ya está en la base de datos y reintentar no arreglaría la foto.
 */
export async function enviarParte(
  supabase: SupabaseClient, fila: FilaParte, certificado?: Certificado, fotos: Foto[] = [],
  llega: (l: Llegada) => Promise<void> = async () => {},
): Promise<Resultado> {
  if (certificado) {
    const resultado = await subirCertificado(supabase, certificado)
    if (resultado.tipo !== 'enviado') return resultado
    await llega({ que: 'certificado' })
  }
  try {
    // Con una raya de cobertura, una petición puede quedarse colgada. A los 20 segundos se da por no llegada.
    // Si en realidad llegó, reenviarla no duplica nada.
    const { error } = await supabase.from('partes').upsert(fila, { onConflict: 'id', ignoreDuplicates: true })
      .abortSignal(AbortSignal.timeout(20_000))
    if (error) return clasificar(error)
  } catch {
    // Sin red, la librería a veces lanza en vez de devolver el error.
    return { tipo: 'sin-conexion' }
  }
  await llega({ que: 'parte' })

  const rechazos: string[] = []
  for (const foto of fotos) {
    const resultado = await subirFoto(supabase, foto, fila.id)
    // Sin red, se para: las que faltan se envían en el siguiente intento.
    if (resultado.tipo === 'sin-conexion') return resultado
    if (resultado.tipo === 'rechazado') rechazos.push(resultado.motivo)
    else await llega({ que: 'foto', id: foto.id })
  }
  if (rechazos.length === 0) return { tipo: 'enviado' }
  const cuantas = rechazos.length === 1 ? 'una foto no' : `${rechazos.length} fotos no`
  // Los motivos suelen ser el mismo (por ejemplo, el plazo): basta con decirlo una vez.
  return { tipo: 'enviado', aviso: `El parte ha llegado, pero ${cuantas}. ${[...new Set(rechazos)].join(' ')}` }
}
