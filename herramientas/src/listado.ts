// El listado: una fila por archivo encontrado, con columnas que se rellenan a mano.

import { stat } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
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

/** Fecha local como año-mes-día. */
const dia = (f: Date) =>
  `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`

/**
 * Cómo se comparan dos rutas: en Windows, sin distinguir mayúsculas, igual que el propio Windows.
 * `C:\Papel\Caja.pdf` y `c:\papel\caja.pdf` son el mismo archivo.
 */
export const claveDeRuta = (ruta: string, plataforma = process.platform) => (plataforma === 'win32' ? ruta.toLowerCase() : ruta)

/** Une avisos en un solo texto, sin repetir ninguno y sin dejar huecos. */
export const juntarAvisos = (...lista: string[]) =>
  [...new Set(lista.flatMap(a => a.split('; ')).map(a => a.trim()).filter(a => a !== ''))].join('; ')

export const AVISO_CAMBIADO = 'ha cambiado desde el escaneo anterior: revisa la ficha'

/** El comienzo del aviso de un original que ya pasó por `preparar`. Ver preparados.ts. */
export const AVISO_PREPARADO = 'ya preparado'

/**
 * Recorre las rutas y devuelve una fila por archivo, ordenadas por ruta.
 * `ruta_original` es la ruta completa, la absoluta. Así cada escaneo se suma a la hoja sin mover nada,
 * aunque las carpetas estén en sitios distintos o se escaneen en momentos distintos.
 * Las columnas que se rellenan a mano quedan vacías y los duplicados, sin marcar.
 */
export async function escanear(rutas: string[], omitir: string[] = []): Promise<Fila[]> {
  const fuera = new Set(omitir.map(r => claveDeRuta(resolve(r))))
  const encontrados = new Map<string, string>()
  for (const ruta of rutas) {
    for (const archivo of await listarArchivos(resolve(ruta))) {
      const clave = claveDeRuta(archivo)
      if (!fuera.has(clave)) encontrados.set(clave, archivo)
    }
  }

  const filas: Fila[] = []
  for (const archivo of encontrados.values()) {
    const datos = await stat(archivo)
    const extension = extname(archivo).slice(1).toLowerCase()
    filas.push({
      ruta_original: archivo,
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

export interface Combinacion {
  filas: Fila[]
  /** Archivos que no estaban en el listado. */
  nuevas: number
  /** Filas que siguen en el listado y cuyo archivo ya no está en ninguna carpeta escaneada. */
  desaparecidas: string[]
  /** Archivos movidos o renombrados: se reconocen por su huella y conservan lo rellenado. */
  movidas: { de: string; a: string }[]
  /** Archivos que siguen en su sitio pero cuyo contenido ha cambiado. */
  cambiadas: string[]
}

/**
 * Une el listado que ya existía con lo recién escaneado.
 *
 * - Las filas que ya estaban se conservan, con lo rellenado a mano.
 * - Si el contenido de un archivo ha cambiado, se apuntan su huella, tamaño y fecha nuevos, y se avisa.
 *   Si no, la versión nueva nunca llegaría al Libro y nadie se enteraría.
 * - Si un archivo ha desaparecido de su ruta y aparece otro con la misma huella, es el mismo archivo movido
 *   o renombrado: se cambia su ruta y se conserva lo rellenado, en vez de duplicarlo.
 * - Los archivos nuevos se añaden al final. En cada uno repetido, `duplicado_de` apunta al primero con la misma huella.
 */
export function combinar(anteriores: Fila[], escaneadas: Fila[], plataforma = process.platform): Combinacion {
  const clave = (ruta: string) => claveDeRuta(ruta, plataforma)
  const enDisco = new Map(escaneadas.map(f => [clave(f.ruta_original), f]))
  const filas = anteriores.map(f => ({ ...f }))
  const resultado: Combinacion = { filas, nuevas: 0, desaparecidas: [], movidas: [], cambiadas: [] }

  // Las que siguen en su sitio: se mira si han cambiado. Las que no están, se guardan por huella.
  const faltanPorHuella = new Map<string, Fila[]>()
  for (const fila of filas) {
    const actual = enDisco.get(clave(fila.ruta_original))
    if (!actual) {
      faltanPorHuella.set(fila.sha256, [...(faltanPorHuella.get(fila.sha256) ?? []), fila])
    } else if (actual.sha256 !== fila.sha256) {
      Object.assign(fila, {
        sha256: actual.sha256, tamano_mb: actual.tamano_mb, fecha_modificacion: actual.fecha_modificacion,
        aviso: juntarAvisos(fila.aviso, actual.aviso, AVISO_CAMBIADO),
      })
      resultado.cambiadas.push(fila.ruta_original)
    }
  }

  const yaListadas = new Set(filas.map(f => clave(f.ruta_original)))
  const primeroConHuella = new Map<string, string>()
  for (const fila of filas) {
    if (!primeroConHuella.has(fila.sha256)) primeroConHuella.set(fila.sha256, fila.ruta_original)
  }

  for (const fila of escaneadas) {
    if (yaListadas.has(clave(fila.ruta_original))) continue
    const movida = faltanPorHuella.get(fila.sha256)?.shift()
    if (movida) {
      resultado.movidas.push({ de: movida.ruta_original, a: fila.ruta_original })
      Object.assign(movida, { ruta_original: fila.ruta_original, nombre: fila.nombre, extension: fila.extension, fecha_modificacion: fila.fecha_modificacion })
      if (primeroConHuella.get(fila.sha256) === resultado.movidas.at(-1)!.de) primeroConHuella.set(fila.sha256, fila.ruta_original)
      continue
    }
    const original = primeroConHuella.get(fila.sha256)
    if (original === undefined) primeroConHuella.set(fila.sha256, fila.ruta_original)
    filas.push({ ...fila, duplicado_de: original ?? '' })
    resultado.nuevas++
  }

  resultado.desaparecidas = [...faltanPorHuella.values()].flat().map(f => f.ruta_original)
  // Un duplicado apunta al primero por su ruta: si ese ha cambiado de sitio, se le sigue.
  const nuevaRuta = new Map(resultado.movidas.map(m => [clave(m.de), m.a]))
  for (const fila of filas) {
    const a = fila.duplicado_de ? nuevaRuta.get(clave(fila.duplicado_de)) : undefined
    if (a) fila.duplicado_de = a
  }
  return resultado
}
