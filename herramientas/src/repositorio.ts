// Sube los documentos al repositorio del edificio en un único commit.
// Trabaja en una copia parcial y temporal del repositorio, que se borra al terminar:
// en el equipo no queda ningún documento. Los originales solo se leen.

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { huella } from './archivos.ts'
import type { Documento, ErrorFila } from './comprobar.ts'
import { LIMITE_GITHUB_BYTES } from './listado.ts'

const ejecutar = promisify(execFile)

/** Ejecuta una orden de Git dentro de la copia y devuelve lo que escribe. */
async function git(repo: string, ...argumentos: string[]): Promise<string> {
  const { stdout } = await ejecutar('git', argumentos, { cwd: repo, maxBuffer: 64 * 1024 * 1024 })
  return stdout.trim()
}

/**
 * Dónde está el original de una fila. `escanear` guarda la ruta completa, que se usa tal cual.
 * Una ruta relativa, como las del listado de ejemplo, cuenta desde `origen`: la carpeta del listado.
 */
export const rutaDelOriginal = (origen: string, rutaOriginal: string) => resolve(origen, rutaOriginal)

/**
 * Comprueba que cada original sigue en su sitio, que no ha cambiado desde que se escaneó y que GitHub lo admite.
 * Devuelve los errores y el tamaño de cada archivo, por fila.
 */
export async function comprobarArchivos(documentos: Documento[], origen: string): Promise<{ errores: ErrorFila[]; bytes: Map<number, number> }> {
  const errores: ErrorFila[] = []
  const bytes = new Map<number, number>()
  for (const doc of documentos) {
    const original = rutaDelOriginal(origen, doc.rutaOriginal)
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

/**
 * Prepara una copia parcial del repositorio del edificio en una carpeta temporal, ejecuta la tarea y borra la copia.
 * La copia se borra siempre, también si la tarea falla.
 *
 * De lo que ya hay en el repositorio solo se bajan las rutas de esta carga, por si alguna se subió en un intento anterior.
 * El resto de los documentos no llega al equipo.
 */
export async function conCopiaTemporal<T>(direccion: string, rutas: string[], tarea: (copia: string) => Promise<T>): Promise<T> {
  const copia = await mkdtemp(join(tmpdir(), 'libro-carga-'))
  try {
    try {
      // --filter=blob:none: no baja el contenido de los archivos. --depth 1: solo el último commit. --no-checkout: no saca nada todavía.
      // core.autocrlf=false: los archivos se guardan tal cual, sin cambiar los saltos de línea. Si no, cambiaría su huella.
      await ejecutar('git', ['clone', '--quiet', '--filter=blob:none', '--depth', '1', '--no-checkout', '-c', 'core.autocrlf=false', direccion, copia])
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error)
      throw new Error(`No he podido abrir el repositorio ${direccion}. Comprueba la dirección y que tienes permiso. ${detalle}`)
    }
    // A la carpeta solo se sacan las rutas de esta carga. Se escriben en el archivo donde Git las lee:
    // pasarlas como argumentos tiene un límite de largo y una carga puede traer cientos.
    await git(copia, 'config', 'core.sparseCheckout', 'true')
    await mkdir(join(copia, '.git', 'info'), { recursive: true })
    await writeFile(join(copia, '.git', 'info', 'sparse-checkout'), rutas.map(ruta => `/${ruta}\n`).join(''))
    // Un repositorio recién creado no tiene ningún commit, así que no hay nada que sacar.
    const conCommits = await git(copia, 'rev-parse', '--verify', '--quiet', 'HEAD').then(() => true, () => false)
    if (conCommits) await git(copia, 'read-tree', '-mu', 'HEAD')
    return await tarea(copia)
  } finally {
    // Git deja archivos de solo lectura y en Windows a veces tarda en soltarlos: por eso los reintentos.
    await rm(copia, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
}

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
    await copyFile(rutaDelOriginal(origen, doc.rutaOriginal), destino)
    copiados++
  }
  return copiados
}

/**
 * Hace un único commit con lo copiado y lo sube. Si no hay nada nuevo, porque todo se subió en un intento anterior, no hace nada.
 * Devuelve si ha hecho commit.
 */
export async function guardarYSubir(repo: string, mensaje: string): Promise<boolean> {
  await git(repo, 'add', '--', 'documentos')
  const pendientes = await git(repo, 'diff', '--cached', '--name-only')
  if (pendientes === '') return false
  await git(repo, 'commit', '-m', mensaje)
  await git(repo, 'push', 'origin', 'HEAD')
  return true
}

/**
 * Identificador del último commit del repositorio, que es el que se apunta en cada ficha.
 * La copia parcial no trae la historia, así que no se sabe qué commit guardó cada archivo. El último los contiene todos.
 */
export const ultimoCommit = (repo: string) => git(repo, 'rev-parse', 'HEAD')
