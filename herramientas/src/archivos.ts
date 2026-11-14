// Busca archivos en disco y calcula su huella. No cambia ni mueve nada.

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

// Archivos que crea el sistema operativo y no son documentos.
const IGNORADOS = new Set(['thumbs.db', 'desktop.ini'])

const esIgnorado = (nombre: string) => nombre.startsWith('.') || IGNORADOS.has(nombre.toLowerCase())

/** Devuelve la huella SHA-256 de un archivo. Lo lee por trozos, así vale también para archivos grandes. */
export function huella(ruta: string): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const hash = createHash('sha256')
    createReadStream(ruta)
      .on('data', trozo => hash.update(trozo))
      .on('end', () => resolver(hash.digest('hex')))
      .on('error', rechazar)
  })
}

/** Lista todos los archivos de una carpeta y sus subcarpetas. Si la ruta es un archivo, lo devuelve tal cual. */
export async function listarArchivos(ruta: string): Promise<string[]> {
  if ((await stat(ruta)).isFile()) return [ruta]
  const archivos: string[] = []
  for (const entrada of await readdir(ruta, { withFileTypes: true })) {
    if (esIgnorado(entrada.name)) continue
    const completa = join(ruta, entrada.name)
    if (entrada.isDirectory()) archivos.push(...await listarArchivos(completa))
    else if (entrada.isFile()) archivos.push(completa)
  }
  return archivos
}
