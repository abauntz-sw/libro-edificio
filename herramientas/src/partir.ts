// Parte un PDF escaneado en un PDF por documento, usando las hojas separadoras como cortes.

import { createCanvas } from '@napi-rs/canvas'
import lectorQR from 'jsqr'
import { PDFDocument } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { CODIGO_SEPARADORA } from './separadora.ts'

// jsqr es un módulo antiguo: sus tipos lo describen envuelto en «default», pero Node entrega la función directamente.
const leerQR = lectorQR as unknown as typeof lectorQR.default

// Cada página se dibuja como imagen para buscar el QR. Con 150 ppp el QR se lee bien y va rápido.
const ESCALA = 150 / 72

/** Devuelve las posiciones de las páginas que son hojas separadoras. La primera página es la 0. */
export async function buscarSeparadoras(pdf: Uint8Array): Promise<number[]> {
  // pdf.js se queda con los datos que recibe y no admite un Buffer de Node, así que se le da una copia.
  const tarea = getDocument({ data: new Uint8Array(pdf), verbosity: 0 })
  const separadoras: number[] = []
  try {
    const documento = await tarea.promise
    for (let n = 1; n <= documento.numPages; n++) {
      const pagina = await documento.getPage(n)
      const vista = pagina.getViewport({ scale: ESCALA })
      const ancho = Math.ceil(vista.width)
      const alto = Math.ceil(vista.height)
      const lienzo = createCanvas(ancho, alto)
      // El lienzo de @napi-rs/canvas hace el papel del de un navegador, que es lo que espera pdf.js.
      await pagina.render({ canvas: lienzo as unknown as HTMLCanvasElement, viewport: vista }).promise
      const imagen = lienzo.getContext('2d').getImageData(0, 0, ancho, alto)
      if (leerQR(imagen.data, ancho, alto)?.data === CODIGO_SEPARADORA) separadoras.push(n - 1)
      pagina.cleanup()
    }
  } finally {
    await tarea.destroy()
  }
  return separadoras
}

/**
 * Agrupa las páginas en documentos: cada separadora cierra un documento y no entra en ninguno.
 * Dos separadoras seguidas, o una al principio o al final, no crean documentos vacíos.
 */
export function agrupar(totalPaginas: number, separadoras: number[]): number[][] {
  const cortes = new Set(separadoras)
  const grupos: number[][] = []
  let actual: number[] = []
  for (let pagina = 0; pagina < totalPaginas; pagina++) {
    if (!cortes.has(pagina)) { actual.push(pagina); continue }
    if (actual.length > 0) grupos.push(actual)
    actual = []
  }
  if (actual.length > 0) grupos.push(actual)
  return grupos
}

/** Parte el PDF y devuelve un PDF por documento, sin las hojas separadoras. Las páginas se copian tal cual. */
export async function partir(pdf: Uint8Array): Promise<Uint8Array[]> {
  const original = await PDFDocument.load(pdf)
  const grupos = agrupar(original.getPageCount(), await buscarSeparadoras(pdf))
  const partes: Uint8Array[] = []
  for (const grupo of grupos) {
    const parte = await PDFDocument.create()
    for (const pagina of await parte.copyPages(original, grupo)) parte.addPage(pagina)
    partes.push(await parte.save())
  }
  return partes
}
