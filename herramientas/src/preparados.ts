// Lo que `preparar` ya ha procesado, para que `escanear` lo reconozca.
//
// Tras `preparar`, los originales siguen en su carpeta: el PDF de la tanda con las hojas separadoras y los
// .docx. Si después se escanea esa carpeta, salen en el listado junto a los PDF preparados, y alguien podría
// marcar con «si» la tanda entera o el .docx. Por eso `preparar` deja en la carpeta de la tanda una lista,
// `.preparados.csv`, con la huella de cada original. `escanear` la busca y avisa, e `importar` no los carga.
//
// Se reconoce por la huella, no por el nombre: así da igual si el original se ha movido o renombrado.

import { existsSync } from 'node:fs'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { escribirCsv, type Fila, leerCsv } from './csv.ts'
import { AVISO_PREPARADO, juntarAvisos } from './listado.ts'

/** Empieza por un punto: `escanear` no lo lista como documento. */
export const LISTA_PREPARADOS = '.preparados.csv'
const COLUMNAS = ['original', 'sha256', 'pdf']

export interface Preparado {
  original: string
  sha256: string
  /** Los PDF que salieron de él, separados por «, ». */
  pdf: string
}

/** Añade a la lista de la carpeta de la tanda lo que se acaba de preparar. Si la lista ya existe, se suma. */
export async function apuntarPreparados(carpetaTanda: string, nuevos: Preparado[]): Promise<void> {
  if (nuevos.length === 0) return
  const ruta = join(carpetaTanda, LISTA_PREPARADOS)
  const anteriores = existsSync(ruta) ? leerCsv(await readFile(ruta, 'utf8')).filas : []
  const filas: Fila[] = [...anteriores, ...nuevos.map(p => ({ ...p }))]
  await writeFile(ruta, escribirCsv(COLUMNAS, filas), 'utf8')
}

/** Busca listas de preparados dentro de una carpeta y sus subcarpetas. */
async function buscarDentro(carpeta: string, encontradas: string[]): Promise<void> {
  let entradas
  try {
    entradas = await readdir(carpeta, { withFileTypes: true })
  } catch {
    return
  }
  for (const entrada of entradas) {
    const completa = join(carpeta, entrada.name)
    if (entrada.isFile() && entrada.name === LISTA_PREPARADOS) encontradas.push(completa)
    else if (entrada.isDirectory() && !entrada.name.startsWith('.')) await buscarDentro(completa, encontradas)
  }
}

/**
 * Las huellas de los originales ya preparados, con la carpeta de su tanda.
 * Busca la lista dentro de lo escaneado y en las carpetas «Escaneos …» de al lado,
 * que es donde `preparar` deja la tanda si no se le dice otra cosa.
 */
export async function buscarPreparados(rutas: string[]): Promise<Map<string, string>> {
  const listas: string[] = []
  const vecinas = new Set<string>()
  for (const ruta of rutas.map(r => resolve(r))) {
    const carpeta = (await stat(ruta)).isDirectory() ? ruta : dirname(ruta)
    await buscarDentro(carpeta, listas)
    vecinas.add(dirname(carpeta))
  }
  for (const padre of vecinas) {
    let hermanas: string[] = []
    try { hermanas = await readdir(padre) } catch { /* sin permiso: se sigue */ }
    for (const nombre of hermanas.filter(n => n.startsWith('Escaneos '))) {
      const lista = join(padre, nombre, LISTA_PREPARADOS)
      if (existsSync(lista)) listas.push(lista)
    }
  }

  const preparados = new Map<string, string>()
  for (const lista of new Set(listas)) {
    for (const fila of leerCsv(await readFile(lista, 'utf8')).filas) {
      if (fila.sha256) preparados.set(fila.sha256, dirname(lista))
    }
  }
  return preparados
}

/** Añade el aviso a las filas cuyo archivo ya se preparó. Devuelve cuántas son. */
export function marcarPreparados(filas: Fila[], preparados: Map<string, string>): number {
  let marcadas = 0
  for (const fila of filas) {
    const tanda = preparados.get(fila.sha256)
    if (!tanda) continue
    fila.aviso = juntarAvisos(fila.aviso, `${AVISO_PREPARADO}: usa los PDF de «${basename(tanda)}» (${tanda})`)
    marcadas++
  }
  return marcadas
}
