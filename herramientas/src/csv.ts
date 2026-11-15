// Lee y escribe CSV de forma que Excel en español lo abra bien:
// UTF-8 con BOM, separador «;» y saltos de línea de Windows.

const BOM = '﻿'
const SEPARADOR = ';'

export type Fila = Record<string, string>

/** Convierte el texto de un CSV en una lista de filas, cada una con sus columnas por nombre. */
export function leerCsv(texto: string): { columnas: string[]; filas: Fila[] } {
  const tabla = separarCeldas(texto.startsWith(BOM) ? texto.slice(1) : texto)
  const [columnas = [], ...resto] = tabla
  const filas = resto
    .filter(celdas => celdas.some(c => c !== ''))
    .map(celdas => Object.fromEntries(columnas.map((col, i) => [col, celdas[i] ?? ''])))
  return { columnas, filas }
}

/** Convierte las filas en el texto de un CSV, con las columnas en el orden indicado. */
export function escribirCsv(columnas: string[], filas: Fila[]): string {
  const lineas = [columnas, ...filas.map(f => columnas.map(col => f[col] ?? ''))]
  return BOM + lineas.map(celdas => celdas.map(entrecomillar).join(SEPARADOR)).join('\r\n') + '\r\n'
}

// Una celda con «;», comillas o saltos de línea va entre comillas, y sus comillas se duplican.
function entrecomillar(celda: string): string {
  return /[;"\r\n]/.test(celda) ? `"${celda.replaceAll('"', '""')}"` : celda
}

// Recorre el texto letra a letra, porque una celda entre comillas puede contener «;» y saltos de línea.
function separarCeldas(texto: string): string[][] {
  const tabla: string[][] = []
  let fila: string[] = []
  let celda = ''
  let entreComillas = false

  const cerrarCelda = () => { fila.push(celda); celda = '' }
  const cerrarFila = () => { cerrarCelda(); tabla.push(fila); fila = [] }

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') { celda += '"'; i++ }
      else if (c === '"') entreComillas = false
      else celda += c
    } else if (c === '"' && celda === '') entreComillas = true
    else if (c === SEPARADOR) cerrarCelda()
    else if (c === '\n') cerrarFila()
    else if (c !== '\r') celda += c
  }
  if (celda !== '' || fila.length > 0) cerrarFila()
  return tabla
}
