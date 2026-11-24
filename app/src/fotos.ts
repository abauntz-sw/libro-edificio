// Comprimir las fotos de un parte en el móvil, antes de guardarlas y enviarlas (tarea 1.6).
//
// Una foto de móvil pesa 3, 5 o más MB. Con poca cobertura tardaría mucho en llegar, y el repositorio
// del edificio crecería sin necesidad. Aquí se reduce a 1600 píxeles por el lado largo y se guarda
// en JPEG: así pesa unos cientos de KB y se sigue viendo bien lo que importa.
//
// De paso se pierden los datos que lleva dentro la foto original (EXIF), como el lugar donde se hizo.

import { leerCabeceraJpeg, medidasGiradas } from './cabecera-jpeg.ts'

/** El lado largo de la foto comprimida, en píxeles. */
export const LADO_MAXIMO = 1600

/** Lo que se intenta que pese una foto. Si con la primera calidad pesa más, se prueba con menos. */
export const OBJETIVO_BYTES = 1024 * 1024

/** Lo máximo que acepta la función «archivos» para una foto. */
export const LIMITE_FOTO_BYTES = 5 * 1024 * 1024

/** Las calidades de JPEG que se prueban, de mejor a peor. */
const CALIDADES = [0.8, 0.65, 0.5]

/** Cuántas fotos puede llevar un parte. Bastan para enseñar lo que se ha hecho, y el envío no se eterniza. */
export const MAX_FOTOS = 5

/**
 * El tamaño de la foto comprimida: el lado largo, como mucho `maximo`, sin deformarla.
 * Una foto más pequeña no se agranda.
 */
export function medidas(ancho: number, alto: number, maximo = LADO_MAXIMO): { ancho: number; alto: number } {
  const escala = Math.min(1, maximo / Math.max(ancho, alto))
  return { ancho: Math.max(1, Math.round(ancho * escala)), alto: Math.max(1, Math.round(alto * escala)) }
}

/** Lo que se lee del principio de la foto para buscar su cabecera. Las medidas y el EXIF van antes. */
const BYTES_CABECERA = 256 * 1024

/**
 * Abre un JPEG ya reducido, sin cargar la foto entera en memoria.
 * Una de 48 megapíxeles abierta entera ocupa unos 200 MB: en un móvil barato puede no caber.
 *
 * El navegador gira la foto según el EXIF y después la reduce, así que se le piden las medidas ya giradas.
 * Si un navegador lo hiciera al revés, la foto saldría deformada: por eso se comprueba que conserva
 * la proporción. Si no la conserva, o la foto no es un JPEG, o no hace falta reducirla, devuelve null
 * y la foto se abre entera, como antes.
 */
export async function abrirReducida(archivo: Blob): Promise<ImageBitmap | null> {
  const cabecera = leerCabeceraJpeg(new Uint8Array(await archivo.slice(0, BYTES_CABECERA).arrayBuffer()))
  if (!cabecera) return null
  const girada = medidasGiradas(cabecera)
  const reducida = medidas(girada.ancho, girada.alto)
  if (reducida.ancho >= girada.ancho) return null
  const mapa = await createImageBitmap(archivo, {
    resizeWidth: reducida.ancho, resizeHeight: reducida.alto, resizeQuality: 'high',
  }).catch(() => null)
  if (!mapa) return null
  // Un navegador que no sabe reducir la devuelve entera: también vale, porque se reduce al dibujarla.
  if (mismaProporcion(mapa, girada)) return mapa
  mapa.close()
  return null
}

/** Si dos medidas tienen la misma forma, con un margen de un píxel por el redondeo. */
function mismaProporcion(a: { width: number; height: number }, b: { ancho: number; alto: number }): boolean {
  return Math.abs(a.width * b.alto - a.height * b.ancho) <= Math.max(b.ancho, b.alto)
}

/**
 * Dibuja la foto en un lienzo del tamaño ya reducido.
 * `createImageBitmap` gira la foto como la hizo el móvil (lo dice el EXIF). Si el navegador no puede, se usa una imagen.
 */
async function dibujar(archivo: Blob): Promise<HTMLCanvasElement> {
  const lienzo = document.createElement('canvas')
  const pintar = (fuente: CanvasImageSource, ancho: number, alto: number) => {
    const m = medidas(ancho, alto)
    lienzo.width = m.ancho
    lienzo.height = m.alto
    const contexto = lienzo.getContext('2d')
    if (!contexto) throw new Error('Sin lienzo')
    // Fondo blanco: una imagen con partes transparentes (un PNG) no se queda negra en JPEG.
    contexto.fillStyle = '#fff'
    contexto.fillRect(0, 0, m.ancho, m.alto)
    contexto.drawImage(fuente, 0, 0, m.ancho, m.alto)
  }
  try {
    const mapa = await abrirReducida(archivo) ?? await createImageBitmap(archivo)
    pintar(mapa, mapa.width, mapa.height)
    mapa.close()
    return lienzo
  } catch {
    const url = URL.createObjectURL(archivo)
    try {
      const imagen = new Image()
      imagen.src = url
      await imagen.decode()
      pintar(imagen, imagen.naturalWidth, imagen.naturalHeight)
      return lienzo
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

const aJpeg = (lienzo: HTMLCanvasElement, calidad: number) =>
  new Promise<Blob | null>(resolver => lienzo.toBlob(resolver, 'image/jpeg', calidad))

/**
 * Prepara la foto elegida: la reduce y la pasa a JPEG.
 * Devuelve la foto comprimida o por qué no vale (no es una foto, o el navegador no sabe leerla).
 */
export async function comprimirFoto(archivo: File): Promise<{ error: string } | { copia: Blob }> {
  if (archivo.size === 0) return { error: 'La foto está vacía.' }
  let lienzo: HTMLCanvasElement
  try {
    lienzo = await dibujar(archivo)
  } catch {
    return { error: 'No se ha podido leer esa foto. Prueba con otra, o hazla con la cámara del móvil.' }
  }
  let copia: Blob | null = null
  for (const calidad of CALIDADES) {
    copia = await aJpeg(lienzo, calidad)
    if (copia && copia.size <= OBJETIVO_BYTES) break
  }
  if (!copia) return { error: 'No se ha podido preparar esa foto. Prueba con otra.' }
  if (copia.size > LIMITE_FOTO_BYTES) return { error: 'La foto pesa demasiado incluso comprimida. Prueba con otra.' }
  return { copia }
}
