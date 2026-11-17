// El informe de huecos: qué documentos faltan en cada instalación.
//
// Sale de la vista `huecos` de la base de datos. Cada fila es un documento que la plantilla
// pide para un tipo de instalación y que esa instalación no tiene. Un documento en la papelera
// no cuenta: su hueco vuelve a aparecer.
//
// La vista respeta los permisos de quien la consulta. Una empresa solo ve los huecos de su instalación.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface Hueco {
  instalacion: string
  falta: string
}

export interface Grupo {
  instalacion: string
  faltan: string[]
}

/** Lee los huecos del edificio de la persona conectada. */
export async function leerHuecos(supabase: SupabaseClient): Promise<Hueco[]> {
  const { data, error } = await supabase.from('huecos').select('instalacion, falta')
  if (error) throw new Error(`No se pudo leer qué documentos faltan: ${error.message}`)
  return data
}

// Orden alfabético en español: la «Ñ» después de la «N» y sin distinguir tildes ni mayúsculas.
const orden = new Intl.Collator('es', { sensitivity: 'base' })

/** Junta los huecos de cada instalación. Las instalaciones y los documentos, por orden alfabético. */
export function agrupar(huecos: Hueco[]): Grupo[] {
  const grupos = new Map<string, string[]>()
  for (const h of huecos) {
    const faltan = grupos.get(h.instalacion) ?? []
    faltan.push(h.falta)
    grupos.set(h.instalacion, faltan)
  }
  return [...grupos]
    .map(([instalacion, faltan]) => ({ instalacion, faltan: faltan.sort(orden.compare) }))
    .sort((a, b) => orden.compare(a.instalacion, b.instalacion))
}

/**
 * Un campo del CSV, como en la exportación diaria del índice.
 * - Si empieza por = + - @ o un tabulador, lleva delante un apóstrofo. Si no, Excel lo tomaría por una fórmula.
 * - Va entre comillas si lleva punto y coma, comillas o saltos de línea. Las comillas se doblan.
 */
export function campoCsv(valor: string): string {
  const protegido = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor
  return /[;"\r\n]/.test(protegido) ? `"${protegido.replaceAll('"', '""')}"` : protegido
}

/**
 * El informe en CSV, con el formato del índice para que Excel lo abra bien:
 * la marca BOM para las tildes, punto y coma y saltos de línea de Windows.
 */
export function huecosCsv(grupos: Grupo[]): string {
  const filas = [['instalacion', 'falta']]
  for (const g of grupos) for (const falta of g.faltan) filas.push([g.instalacion, falta])
  return '﻿' + filas.map(f => f.map(campoCsv).join(';') + '\r\n').join('')
}

/** El nombre del archivo, con la fecha del día: `huecos-2026-11-16.csv`. */
export function nombreCsv(hoy: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0')
  return `huecos-${hoy.getFullYear()}-${dos(hoy.getMonth() + 1)}-${dos(hoy.getDate())}.csv`
}
