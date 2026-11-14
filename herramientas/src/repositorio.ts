// Copia los documentos al clon del repositorio del edificio y los sube en un único commit.
// Los originales solo se leen.

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { huella } from './archivos.ts'
import type { Documento, ErrorFila } from './comprobar.ts'
import { LIMITE_GITHUB_BYTES } from './listado.ts'

const ejecutar = promisify(execFile)

/** Ejecuta una orden de Git dentro del clon y devuelve lo que escribe. */
async function git(repo: string, ...argumentos: string[]): Promise<string> {
  const { stdout } = await ejecutar('git', argumentos, { cwd: repo, maxBuffer: 64 * 1024 * 1024 })
  return stdout.trim()
}

/**
 * Comprueba que cada original sigue en su sitio, que no ha cambiado desde que se escaneó y que GitHub lo admite.
 * Devuelve los errores y el tamaño de cada archivo, por fila.
 */
export async function comprobarArchivos(documentos: Documento[], origen: string): Promise<{ errores: ErrorFila[]; bytes: Map<number, number> }> {
  const errores: ErrorFila[] = []
  const bytes = new Map<number, number>()
  for (const doc of documentos) {
    const original = join(origen, doc.rutaOriginal)
    if (!existsSync(original)) {
      errores.push({ fila: doc.fila, mensaje: `no encuentro el archivo ${original}` })
      continue
    }
    const tamano = (await stat(original)).size
    bytes.set(doc.fila, tamano)
    if (tamano > LIMITE_GITHUB_BYTES) errores.push({ fila: doc.fila, mensaje: 'pesa más de 100 MB y GitHub no lo admite' })
    else if (await huella(original) !== doc.sha256) {
      errores.push({ fila: doc.fila, mensaje: 'el archivo ha cambiado desde que se escaneó. Vuelve a ejecutar escanear' })
    }
  }
  return { errores, bytes }
}

/** Comprueba que la carpeta es un clon de Git con un remoto y sin cambios ajenos a la carga. Devuelve los problemas. */
export async function comprobarClon(repo: string): Promise<string[]> {
  if (!existsSync(join(repo, '.git'))) return [`${repo} no es un clon de Git`]
  const remotos = (await git(repo, 'remote')).split('\n')
  if (!remotos.includes('origin')) return [`${repo} no tiene el remoto «origin», así que no se puede subir`]

  // Se admiten cambios dentro de documentos/: son los de una carga anterior que se cortó.
  const ajenos = (await git(repo, 'status', '--porcelain'))
    .split('\n')
    .filter(linea => linea !== '' && !linea.slice(3).replaceAll('"', '').startsWith('documentos/'))
  return ajenos.length > 0 ? [`${repo} tiene cambios sin guardar que no son de la carga. Guárdalos o descártalos antes`] : []
}

/** Dirección del remoto «origin» del clon. */
export const remoto = (repo: string) => git(repo, 'remote', 'get-url', 'origin')

/**
 * Copia cada original a su ruta del repositorio. Si el archivo ya está con el mismo contenido, no lo toca.
 * Devuelve cuántos ha copiado.
 */
export async function copiarDocumentos(repo: string, origen: string, documentos: Documento[]): Promise<number> {
  let copiados = 0
  for (const doc of documentos) {
    const destino = join(repo, doc.ruta)
    if (existsSync(destino)) {
      if (await huella(destino) === doc.sha256) continue
      throw new Error(`${doc.ruta} ya existe en el repositorio con otro contenido. No se ha sobrescrito`)
    }
    await mkdir(dirname(destino), { recursive: true })
    await copyFile(join(origen, doc.rutaOriginal), destino)
    copiados++
  }
  return copiados
}

/**
 * Hace un único commit con lo copiado y lo sube. Si no hay nada nuevo que guardar, solo sube:
 * así se completa una carga que se cortó entre el commit y el push.
 * Devuelve si ha hecho commit.
 */
export async function guardarYSubir(repo: string, mensaje: string): Promise<boolean> {
  await git(repo, 'add', '--', 'documentos')
  const pendientes = await git(repo, 'diff', '--cached', '--name-only')
  if (pendientes !== '') await git(repo, 'commit', '-m', mensaje)
  await git(repo, 'push', 'origin', 'HEAD')
  return pendientes !== ''
}

/** Identificador del commit que guardó un archivo. */
export const commitDe = (repo: string, ruta: string) => git(repo, 'log', '-1', '--format=%H', '--', ruta)
