// El listado: una fila por archivo encontrado, con columnas que se rellenan a mano.

import { stat } from 'node:fs/promises'
import { basename, dirname, extname, relative, resolve, sep } from 'node:path'
import { huella, listarArchivos } from './archivos.ts'
import type { Fila } from './csv.ts'

/** Columnas que rellena `escanear`. */
export const COLUMNAS_AUTOMATICAS = [
  'ruta_original', 'nombre', 'extension', 'tamano_mb', 'fecha_modificacion', 'sha256', 'duplicado_de', 'aviso',
]
/** Columnas que rellena una persona. */
export const COLUMNAS_A_MANO = ['incluir', 'tipo', 'titulo', 'fecha', 'emisor', 'instalaciones', 'caduca']
export const COLUMNAS = [...COLUMNAS_AUTOMATICAS, ...COLUMNAS_A_MANO]

const MB = 1024 * 1024
/** GitHub no admite archivos de más de 100 MB. */
export const LIMITE_GITHUB_BYTES = 100 * MB

/** Avisos sobre un archivo, juntos en un texto. Vacío si no hay ninguno. */
export function avisos(extension: string, bytes: number): string {
  const lista: string[] = []
  if (extension !== 'pdf') lista.push('no es PDF')
  if (bytes > LIMITE_GITHUB_BYTES) lista.push('más de 100 MB: GitHub no lo admite')
  return lista.join('; ')
}

/**
 * Carpeta desde la que se escriben las rutas del listado: la carpeta común a todo lo escaneado.
 * Con una sola carpeta, es esa carpeta. Con un solo archivo, la carpeta que lo contiene.
 */
export async function carpetaBase(rutas: string[]): Promise<string> {
  const carpetas = await Promise.all(rutas.map(async r => {
    const completa = resolve(r)
    return (await stat(completa)).isDirectory() ? completa : dirname(completa)
  }))
  let comun = carpetas[0].split(sep)
  for (const carpeta of carpetas.slice(1)) {
    const partes = carpeta.split(sep)
    let iguales = 0
    while (iguales < comun.length && comun[iguales] === partes[iguales]) iguales++
    comun = comun.slice(0, iguales)
  }
  return comun.join(sep) || sep
}

/** Fecha local como año-mes-día. */
const dia = (f: Date) =>
  `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`

/**
 * Recorre las rutas y devuelve una fila por archivo, ordenadas por ruta.
 * Las columnas que se rellenan a mano quedan vacías y los duplicados, sin marcar.
 */
export async function escanear(rutas: string[], omitir: string[] = []): Promise<Fila[]> {
  const base = await carpetaBase(rutas)
  const fuera = new Set(omitir.map(r => resolve(r)))
  const encontrados = new Set<string>()
  for (const ruta of rutas) {
    for (const archivo of await listarArchivos(resolve(ruta))) {
      if (!fuera.has(archivo)) encontrados.add(archivo)
    }
  }

  const filas: Fila[] = []
  for (const archivo of encontrados) {
    const datos = await stat(archivo)
    const extension = extname(archivo).slice(1).toLowerCase()
    filas.push({
      ruta_original: relative(base, archivo).split(sep).join('/'),
      nombre: basename(archivo),
      extension,
      tamano_mb: (datos.size / MB).toFixed(3),
      fecha_modificacion: dia(datos.mtime),
      sha256: await huella(archivo),
      duplicado_de: '',
      aviso: avisos(extension, datos.size),
      ...Object.fromEntries(COLUMNAS_A_MANO.map(col => [col, ''])),
    })
  }
  return filas.sort((a, b) => (a.ruta_original < b.ruta_original ? -1 : 1))
}

/**
 * Une el listado que ya existía con lo recién escaneado.
 * Las filas que ya estaban se conservan tal cual, con lo rellenado a mano. Solo se añaden los archivos nuevos.
 * En cada archivo nuevo repetido, `duplicado_de` apunta al primero con la misma huella.
 */
export function combinar(anteriores: Fila[], escaneadas: Fila[]): { filas: Fila[]; nuevas: number; desaparecidas: string[] } {
  const yaListadas = new Set(anteriores.map(f => f.ruta_original))
  const primeroConHuella = new Map<string, string>()
  for (const fila of anteriores) {
    if (!primeroConHuella.has(fila.sha256)) primeroConHuella.set(fila.sha256, fila.ruta_original)
  }

  const filas = [...anteriores]
  let nuevas = 0
  for (const fila of escaneadas) {
    if (yaListadas.has(fila.ruta_original)) continue
    const original = primeroConHuella.get(fila.sha256)
    if (original === undefined) primeroConHuella.set(fila.sha256, fila.ruta_original)
    filas.push({ ...fila, duplicado_de: original ?? '' })
    nuevas++
  }

  const enDisco = new Set(escaneadas.map(f => f.ruta_original))
  const desaparecidas = anteriores.map(f => f.ruta_original).filter(r => !enDisco.has(r))
  return { filas, nuevas, desaparecidas }
}
