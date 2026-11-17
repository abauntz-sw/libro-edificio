// Lo ya cargado se aparta a una subcarpeta `[en-el-libro]`, junto a donde estaba.
//
//   Mantenimiento\caldera.pdf  →  Mantenimiento\[en-el-libro]\caldera.pdf
//
// Así, en la carpeta de la FNDME se ve de un vistazo qué está en el Libro y qué falta. Desde la carga,
// la versión buena es la del Libro: una versión nueva se sube por la aplicación.
// El archivo nunca se modifica ni se borra: solo cambia de carpeta y queda en solo lectura.
// Está pendiente de confirmar con la FNDME (pregunta 14 de PLAN-BELAGUA.md). Se desactiva con --no-mover.

import { existsSync } from 'node:fs'
import { chmod, mkdir, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { CARPETA_EN_EL_LIBRO } from './archivos.ts'
import { escribirCsv, type Fila } from './csv.ts'
import { claveDeRuta } from './listado.ts'
import { rutaDelOriginal } from './repositorio.ts'

export { CARPETA_EN_EL_LIBRO }

/** Si la ruta está dentro de una carpeta `[en-el-libro]`. */
export const estaEnElLibro = (ruta: string) => ruta.split(/[\\/]/).includes(CARPETA_EN_EL_LIBRO)

/** Adónde va un archivo al apartarlo: a `[en-el-libro]`, en su misma carpeta. */
export const destinoEnElLibro = (ruta: string) => join(dirname(ruta), CARPETA_EN_EL_LIBRO, basename(ruta))

export type Movimiento = { movido: true; destino: string } | { movido: false; motivo: string }

/**
 * Aparta un archivo ya cargado a `[en-el-libro]` y lo deja en solo lectura.
 * El solo lectura no protege de verdad, pero hace saltar un aviso a quien intente guardar encima.
 * Si no se puede (permisos, archivo abierto, ya hay otro con ese nombre), no lo mueve y dice por qué.
 */
export async function apartar(ruta: string): Promise<Movimiento> {
  if (estaEnElLibro(ruta)) return { movido: false, motivo: 'ya está en una carpeta [en-el-libro]' }
  if (!existsSync(ruta)) return { movido: false, motivo: 'no está en su sitio' }
  const destino = destinoEnElLibro(ruta)
  if (existsSync(destino)) return { movido: false, motivo: `ya hay un archivo con ese nombre en ${dirname(destino)}` }
  try {
    await mkdir(dirname(destino), { recursive: true })
    // rename no copia: dentro de la misma carpeta es instantáneo y el archivo no cambia.
    await rename(ruta, destino)
  } catch (error) {
    const codigo = (error as NodeJS.ErrnoException).code
    const motivo = codigo === 'EBUSY' || codigo === 'EPERM' || codigo === 'EACCES'
      ? 'está abierto o no hay permiso para moverlo'
      : (error as Error).message
    return { movido: false, motivo }
  }
  // Si no se puede marcar como solo lectura, el archivo ya está apartado: no es motivo de error.
  await chmod(destino, 0o444).catch(() => {})
  return { movido: true, destino }
}

export interface Apartado {
  apartados: number
  /** Los que no se han podido mover, con su fila y el motivo. */
  avisos: string[]
  /** Falso si se movió algo pero no se pudo escribir el listado. `escanear` lo corrige la próxima vez. */
  listadoAlDia: boolean
}

/**
 * Aparta a `[en-el-libro]` los archivos de esas filas del listado, que ya están en el repositorio y tienen su ficha.
 * Si uno no se puede mover, lo dice y sigue: el documento ya está en el Libro.
 * Después pone al día en el listado la ruta de los que ha movido.
 * `numeros` son los números de fila de la hoja de cálculo: la fila 1 son los títulos.
 */
export async function apartarCargadas(listado: string, columnas: string[], filas: Fila[], numeros: number[], origen: string): Promise<Apartado> {
  const resultado: Apartado = { apartados: 0, avisos: [], listadoAlDia: true }
  const nuevaRuta = new Map<string, string>()
  for (const numero of numeros) {
    const fila = filas[numero - 2]
    const ruta = rutaDelOriginal(origen, fila.ruta_original)
    if (estaEnElLibro(ruta)) continue
    const movimiento = await apartar(ruta)
    if (movimiento.movido) {
      nuevaRuta.set(claveDeRuta(fila.ruta_original), movimiento.destino)
      fila.ruta_original = movimiento.destino
      resultado.apartados++
    } else {
      resultado.avisos.push(`Fila ${numero}: no se ha apartado a [en-el-libro] porque ${movimiento.motivo}. Ya está en el Libro: no hace falta repetir nada.`)
    }
  }
  // Un duplicado apunta al primero por su ruta: si ese se ha apartado, se le sigue.
  for (const fila of filas) {
    const destino = fila.duplicado_de ? nuevaRuta.get(claveDeRuta(fila.duplicado_de)) : undefined
    if (destino) fila.duplicado_de = destino
  }
  if (resultado.apartados > 0) {
    try {
      await writeFile(listado, escribirCsv(columnas, filas), 'utf8')
    } catch {
      resultado.listadoAlDia = false
    }
  }
  return resultado
}
