// Registrar un parte de trabajo (tarea 1.6, sin fotos ni certificado todavía).
//
// El parte se inserta en la tabla `partes`. La base de datos pone sola el edificio, el autor y la empresa,
// y comprueba que cada perfil registre solo lo suyo. Si el parte cierra una revisión, la base de datos
// mueve su próxima fecha. Aquí solo se ofrece a cada uno lo que puede elegir, para no llevarle a un error.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Perfil } from './acceso.ts'

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
export function filaParte(id: string, b: Borrador, revision: Revision | undefined, hoy: string) {
  return {
    id,
    instalacion_id: b.instalacion,
    fecha: hoy,
    tipo: b.tipo,
    descripcion: b.descripcion.trim(),
    revision_id: revision?.id ?? null,
    // La próxima fecha solo se manda si la revisión no tiene periodicidad. Si la tiene, la calcula la base de datos.
    proxima_revision: revision && revision.periodicidad_meses === null ? b.proxima : null,
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

/**
 * Envía el parte. Si ya había llegado (el mismo identificador), no hace nada: `on conflict do nothing`.
 * Devuelve el mensaje de error, o `undefined` si ha ido bien.
 */
export async function enviarParte(supabase: SupabaseClient, fila: ReturnType<typeof filaParte>): Promise<string | undefined> {
  const { error } = await supabase.from('partes').upsert(fila, { onConflict: 'id', ignoreDuplicates: true })
  if (!error) return undefined
  if (!navigator.onLine) return 'No hay conexión. Cuando vuelva, pulsa Enviar otra vez: no se duplicará.'
  // 42501: la base de datos no le deja. Pasa si, por ejemplo, la revisión ha cambiado de responsable.
  if (error.code === '42501') return 'No puedes registrar este parte. Puede que la revisión ya no esté a tu cargo.'
  return `No se pudo enviar el parte: ${error.message}`
}
