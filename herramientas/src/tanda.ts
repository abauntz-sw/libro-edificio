// Prepara una tanda: deja en una carpeta nueva un PDF por documento, listo para `escanear`.
// Los originales solo se leen.

import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join, resolve } from 'node:path'
import { listarArchivos } from './archivos.ts'
import { aPdf, hayOcr, libreOffice, ocr } from './externos.ts'
import { analizar, partir, yaEstaListo } from './partir.ts'

/** Formatos de texto editable que se pasan a PDF. */
export const EDITABLES = ['docx', 'odt']

export interface Resumen {
  /** Archivos creados en la carpeta de salida. */
  creados: string[]
  /** Archivos que no necesitan preparación y se han dejado donde estaban. */
  sinTocar: string[]
}

/** Nombre de la carpeta de una tanda: «Escaneos AAAA-MM». */
export const carpetaDeTanda = (fecha = new Date()) =>
  `Escaneos ${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`

/**
 * Prepara los archivos de `rutas`, que pueden ser carpetas o archivos sueltos:
 * - cada PDF escaneado se parte por sus hojas separadoras y se le pasa el OCR;
 * - un PDF sin hojas separadoras y con texto en todas sus páginas ya está listo y no se toca;
 * - cada .docx u .odt se pasa a PDF;
 * - el resto no se toca: entra tal cual en `escanear`.
 * Con `conOcr` en false solo parte, sin OCR.
 */
export async function prepararTanda(rutas: string[], salida: string, conOcr = true): Promise<Resumen> {
  const archivos: string[] = []
  for (const ruta of rutas) archivos.push(...await listarArchivos(resolve(ruta)))
  const extension = (archivo: string) => extname(archivo).slice(1).toLowerCase()
  const escaneos = archivos.filter(a => extension(a) === 'pdf')
  const editables = archivos.filter(a => EDITABLES.includes(extension(a)))

  // Antes de empezar se comprueba que están los programas necesarios, para no dejar la tanda a medias.
  if (conOcr && escaneos.length > 0 && !await hayOcr()) {
    throw new Error('No encuentro ocrmypdf. Instálalo como explica el README, o añade --sin-ocr para partir sin OCR.')
  }
  const programa = editables.length > 0 ? await libreOffice() : null
  if (editables.length > 0 && programa === null) {
    throw new Error('No encuentro LibreOffice. Instálalo como explica el README.')
  }

  await mkdir(salida, { recursive: true })
  const resumen: Resumen = { creados: [], sinTocar: archivos.filter(a => !escaneos.includes(a) && !editables.includes(a)) }

  // Nunca se escribe encima de un archivo que ya está en la carpeta de salida.
  const destino = (nombre: string): string => {
    const completo = join(salida, nombre)
    if (existsSync(completo)) throw new Error(`${completo} ya existe y no se sobrescribe. Usa otra carpeta de salida.`)
    resumen.creados.push(completo)
    return completo
  }

  const temporal = await mkdtemp(join(tmpdir(), 'tanda-'))
  try {
    for (const escaneo of escaneos) {
      const contenido = await readFile(escaneo)
      const analisis = await analizar(contenido)
      // Copiarlo cambiaría su huella y `escanear` no lo reconocería como repetido.
      if (yaEstaListo(analisis)) { resumen.sinTocar.push(escaneo); continue }
      const nombre = basename(escaneo, extname(escaneo))
      const partes = await partir(contenido, analisis.separadoras)
      for (const [i, parte] of partes.entries()) {
        // Un escaneo con varios documentos da «nombre-01.pdf», «nombre-02.pdf»…
        const sufijo = partes.length > 1 ? `-${String(i + 1).padStart(2, '0')}` : ''
        const final = destino(`${nombre}${sufijo}.pdf`)
        if (!conOcr) { await writeFile(final, parte); continue }
        const sinOcr = join(temporal, `${resumen.creados.length}.pdf`)
        await writeFile(sinOcr, parte)
        await ocr(sinOcr, final)
      }
    }
    for (const editable of editables) {
      // El nombre conserva la extensión original para que «a.docx» y «a.odt» no choquen.
      await aPdf(programa!, editable, destino(`${basename(editable, extname(editable))}-${extension(editable)}.pdf`))
    }
  } finally {
    await rm(temporal, { recursive: true, force: true })
  }
  return resumen
}
