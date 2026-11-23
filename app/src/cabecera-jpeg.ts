// Lee de la cabecera de un JPEG cuánto mide la foto y cómo hay que girarla, sin abrirla.
//
// Para reducir una foto, el navegador la abre entera: una de 48 megapíxeles ocupa unos 200 MB
// en memoria, y en un móvil barato puede no caber. Si antes se sabe cuánto mide, se le puede pedir
// ya reducida (createImageBitmap con resizeWidth y resizeHeight), y no hace falta tanta memoria.
//
// Un JPEG es una lista de bloques, cada uno con su marca (FF y una letra) y su largo.
// Las medidas van en el bloque SOF. El giro, en el EXIF (bloque APP1), con la etiqueta «Orientation».
// Los dos van antes de la imagen en sí, en los primeros KB del archivo.

export interface CabeceraJpeg {
  /** Ancho y alto tal como están guardados, antes de girar. */
  ancho: number
  alto: number
  /** La orientación del EXIF, de 1 a 8. 1 es «tal cual». Si no hay EXIF, 1. */
  orientacion: number
}

/** Los bloques SOF: C0 a CF, menos C4 (tablas de Huffman), C8 (reservado) y CC (codificación aritmética). */
const esSof = (marca: number) => marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc

/** Marcas que van solas, sin largo detrás: los reinicios (D0 a D7) y la 01. */
const vaSola = (marca: number) => marca === 0x01 || (marca >= 0xd0 && marca <= 0xd7)

/**
 * Lee las medidas y la orientación. Devuelve null si no es un JPEG o si la cabecera no se entiende:
 * en ese caso la foto se abre entera, como antes.
 */
export function leerCabeceraJpeg(bytes: Uint8Array): CabeceraJpeg | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  const datos = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let orientacion = 1
  let i = 2
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return null
    const marca = bytes[i + 1]
    // Entre bloques puede haber FF de relleno.
    if (marca === 0xff) { i++; continue }
    if (vaSola(marca)) { i += 2; continue }
    // SOS: empieza la imagen. Si no ha salido el SOF, no se sabe.
    if (marca === 0xda || marca === 0xd9) return null
    const largo = datos.getUint16(i + 2)
    if (largo < 2) return null
    const inicio = i + 4
    if (marca === 0xe1) orientacion = leerOrientacion(bytes, inicio, largo - 2) ?? orientacion
    if (esSof(marca)) {
      if (inicio + 5 > bytes.length) return null
      const alto = datos.getUint16(inicio + 1)
      const ancho = datos.getUint16(inicio + 3)
      if (ancho === 0 || alto === 0) return null
      return { ancho, alto, orientacion }
    }
    i = inicio + largo - 2
  }
  return null
}

/** Busca la orientación en un bloque APP1 con EXIF. Si no la hay, o el bloque no se entiende, null. */
function leerOrientacion(bytes: Uint8Array, inicio: number, largo: number): number | null {
  const fin = Math.min(inicio + largo, bytes.length)
  // «Exif» y dos ceros. Otro APP1 (XMP, por ejemplo) no sirve.
  const firma = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]
  if (fin - inicio < 14 || !firma.every((byte, k) => bytes[inicio + k] === byte)) return null
  const tiff = inicio + 6
  const datos = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // El TIFF dice si los números van de izquierda a derecha («MM») o al revés («II»).
  const orden = datos.getUint16(tiff)
  if (orden !== 0x4d4d && orden !== 0x4949) return null
  const alReves = orden === 0x4949
  const u16 = (k: number) => datos.getUint16(k, alReves)
  const u32 = (k: number) => datos.getUint32(k, alReves)
  if (u16(tiff + 2) !== 42) return null
  const ifd = tiff + u32(tiff + 4)
  if (ifd + 2 > fin) return null
  const entradas = u16(ifd)
  for (let n = 0; n < entradas; n++) {
    const entrada = ifd + 2 + n * 12
    if (entrada + 12 > fin) return null
    // 0x0112 es «Orientation». Es un número corto (tipo 3), guardado en los primeros 2 bytes del valor.
    if (u16(entrada) === 0x0112) {
      const valor = u16(entrada + 8)
      return valor >= 1 && valor <= 8 ? valor : null
    }
  }
  return null
}

/** Las medidas de la foto ya girada. Con las orientaciones 5 a 8 la foto va de lado: ancho y alto se cambian. */
export function medidasGiradas(cabecera: CabeceraJpeg): { ancho: number; alto: number } {
  return cabecera.orientacion >= 5
    ? { ancho: cabecera.alto, alto: cabecera.ancho }
    : { ancho: cabecera.ancho, alto: cabecera.alto }
}
