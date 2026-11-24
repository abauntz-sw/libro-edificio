import { describe, expect, it } from 'vitest'
import { leerCabeceraJpeg, medidasGiradas } from '../src/cabecera-jpeg.ts'

// JPEG de mentira, armados byte a byte: solo las cabeceras, sin imagen. Bastan para leer medidas y giro.

const bloque = (marca: number, cuerpo: number[]) => [0xff, marca, (cuerpo.length + 2) >> 8, (cuerpo.length + 2) & 0xff, ...cuerpo]
const dos = (n: number) => [n >> 8, n & 0xff]
const sof = (ancho: number, alto: number, marca = 0xc0) => bloque(marca, [8, ...dos(alto), ...dos(ancho), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])
const jfif = bloque(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0])
const sos = [0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0]

/** Un EXIF con la orientación, con los números de izquierda a derecha (MM) o al revés (II). */
function exif(orientacion: number, orden: 'MM' | 'II' = 'MM', otrasAntes = 0) {
  const u16 = (n: number) => (orden === 'MM' ? dos(n) : [n & 0xff, n >> 8])
  const u32 = (n: number) => (orden === 'MM' ? [0, 0, ...dos(n)] : [...dos(n).reverse(), 0, 0])
  // Otras etiquetas antes de la orientación, como hacen las cámaras (ancho, alto…): 0x0100, 0x0101…
  const otras = Array.from({ length: otrasAntes }, (_, k) => [...u16(0x0100 + k),...u16(2), ...u32(4), 0, 0, 0, 0]).flat()
  const ifd = [...u16(otrasAntes + 1), ...otras, ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientacion), 0, 0, ...u32(0)]
  const tiff = [...(orden === 'MM' ? [0x4d, 0x4d] : [0x49, 0x49]), ...u16(42), ...u32(8), ...ifd]
  return bloque(0xe1, [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff])
}

const jpeg = (...partes: number[][]) => new Uint8Array([0xff, 0xd8, ...partes.flat()])

describe('cabecera de un JPEG', () => {
  it('lee el ancho y el alto del SOF', () => {
    expect(leerCabeceraJpeg(jpeg(jfif, sof(4000, 3000), sos))).toEqual({ ancho: 4000, alto: 3000, orientacion: 1 })
  })

  it('lee la orientación del EXIF, en los dos órdenes de los números', () => {
    expect(leerCabeceraJpeg(jpeg(exif(6), sof(4000, 3000), sos))?.orientacion).toBe(6)
    expect(leerCabeceraJpeg(jpeg(exif(8, 'II'), sof(4000, 3000), sos))?.orientacion).toBe(8)
    expect(leerCabeceraJpeg(jpeg(exif(3, 'II', 4), sof(4000, 3000), sos))?.orientacion).toBe(3)
  })

  it('también lee un JPEG progresivo (SOF2) y salta los FF de relleno', () => {
    expect(leerCabeceraJpeg(jpeg(jfif, [0xff, 0xff], sof(1200, 900, 0xc2), sos))).toEqual({ ancho: 1200, alto: 900, orientacion: 1 })
  })

  it('no confunde con el SOF las tablas de Huffman (C4) ni otro APP1 que no es EXIF', () => {
    const huffman = bloque(0xc4, [0, 1, 2, 3])
    const xmp = bloque(0xe1, [...new TextEncoder().encode('http://ns.adobe.com/xap/1.0/'), 0, 1, 2])
    expect(leerCabeceraJpeg(jpeg(xmp, huffman, sof(800, 600), sos))).toEqual({ ancho: 800, alto: 600, orientacion: 1 })
  })

  it('una orientación que no existe cuenta como «tal cual»', () => {
    expect(leerCabeceraJpeg(jpeg(exif(9), sof(800, 600), sos))?.orientacion).toBe(1)
  })

  it('si no es un JPEG, o la cabecera está cortada o no tiene medidas, no se sabe', () => {
    expect(leerCabeceraJpeg(new TextEncoder().encode('esto no es una foto'))).toBeNull()
    expect(leerCabeceraJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull()
    expect(leerCabeceraJpeg(jpeg(jfif, sos))).toBeNull()
    expect(leerCabeceraJpeg(jpeg(jfif))).toBeNull()
    expect(leerCabeceraJpeg(jpeg(jfif, sof(800, 600)).slice(0, 25))).toBeNull()
    expect(leerCabeceraJpeg(jpeg(sof(0, 600), sos))).toBeNull()
    expect(leerCabeceraJpeg(new Uint8Array([0xff, 0xd8, 0x00, 0x00, 0x00, 0x00]))).toBeNull()
  })

  it('con las orientaciones 5 a 8 la foto va de lado: ancho y alto se cambian', () => {
    expect([1, 2, 3, 4].map(o => medidasGiradas({ ancho: 4000, alto: 3000, orientacion: o })))
      .toEqual(Array(4).fill({ ancho: 4000, alto: 3000 }))
    expect([5, 6, 7, 8].map(o => medidasGiradas({ ancho: 4000, alto: 3000, orientacion: o })))
      .toEqual(Array(4).fill({ ancho: 3000, alto: 4000 }))
  })
})
