import { describe, expect, it } from 'vitest'
import {
  comprobarArchivo, esPdf, faltaEnFicha, type Fila, formulario, huellaSha256, LIMITE_BYTES, marcarDuplicados,
  prepararFila, tituloDesdeNombre,
} from '../src/subida.ts'

const pdf = (texto = 'contenido', nombre = 'prueba.pdf') => new File([`%PDF-1.7\n${texto}`], nombre, { type: 'application/pdf' })
const id = '0b6f3a52-6c8e-4d1a-9a57-3f2c1e0d9b11'

/** Una fila completa, a la que cada test le cambia lo que necesita. */
function fila(cambios: Partial<Fila> = {}): Fila {
  return {
    id, archivo: pdf(), titulo: 'Certificado de prueba', tipo: 'certificado', fecha: '2026-03-10', caduca: '',
    instalaciones: [], estado: 'lista', ...cambios,
  }
}

describe('tituloDesdeNombre', () => {
  it('quita la extensión y cambia guiones y barras bajas por espacios', () => {
    expect(tituloDesdeNombre('Revision_caldera-2026.pdf')).toBe('Revision caldera 2026')
  })
})

describe('esPdf', () => {
  it('reconoce la firma de un PDF', () => {
    expect(esPdf(new TextEncoder().encode('%PDF-'))).toBe(true)
  })
  it('rechaza otra cosa con el nombre cambiado', () => {
    expect(esPdf(new TextEncoder().encode('PK\u0003\u0004'))).toBe(false)
  })
})

describe('huellaSha256', () => {
  it('da la huella conocida de un texto', async () => {
    expect(await huellaSha256(new TextEncoder().encode('abc').buffer))
      .toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('comprobarArchivo', () => {
  it('acepta un PDF', async () => {
    expect(await comprobarArchivo(pdf())).toBeUndefined()
  })
  it('rechaza un archivo vacío', async () => {
    expect(await comprobarArchivo(new File([], 'vacio.pdf'))).toBe('El archivo está vacío.')
  })
  it('rechaza lo que no es un PDF aunque se llame .pdf', async () => {
    expect(await comprobarArchivo(new File(['hola'], 'falso.pdf'))).toMatch(/No es un PDF/)
  })
  it('rechaza lo que pasa del límite y dice cuánto pesa', async () => {
    const grande = new File([new Uint8Array(LIMITE_BYTES + 1)], 'grande.pdf')
    expect(await comprobarArchivo(grande)).toBe(
      'Pesa 25,0 MB y el límite es 25 MB. Redúcelo o cárgalo con la herramienta de carga local.',
    )
  })
})

describe('prepararFila', () => {
  it('propone el título y calcula la huella', async () => {
    const f = await prepararFila(pdf('x', 'Boletin_electrico.pdf'), id)
    expect(f.titulo).toBe('Boletin electrico')
    expect(f.huella).toMatch(/^[0-9a-f]{64}$/)
    expect(f.rechazo).toBeUndefined()
  })
  it('no calcula la huella de un archivo rechazado', async () => {
    const f = await prepararFila(new File(['hola'], 'falso.pdf'), id)
    expect(f.rechazo).toMatch(/No es un PDF/)
    expect(f.huella).toBeUndefined()
  })
})

describe('marcarDuplicados', () => {
  it('avisa del que ya está en el Libro', () => {
    const [f] = marcarDuplicados([fila({ huella: 'aaa' })], new Map([['aaa', '«Boletín eléctrico»']]))
    expect(f.duplicado).toBe('Ya está en el Libro como «Boletín eléctrico».')
  })
  it('avisa del que se repite en la misma tanda, no del primero', () => {
    const filas = marcarDuplicados(
      [fila({ huella: 'aaa', archivo: pdf('x', 'uno.pdf') }), fila({ huella: 'aaa', archivo: pdf('x', 'dos.pdf') })],
      new Map(),
    )
    expect(filas.map(f => f.duplicado)).toEqual([undefined, 'Es el mismo archivo que «uno.pdf».'])
  })
  it('quita el aviso si el repetido ya no está', () => {
    const [f] = marcarDuplicados([fila({ huella: 'aaa', duplicado: 'antes' })], new Map())
    expect(f.duplicado).toBeUndefined()
  })
})

describe('faltaEnFicha', () => {
  it('una ficha completa no necesita nada', () => {
    expect(faltaEnFicha(fila(), false)).toEqual([])
  })
  it('dice qué falta', () => {
    expect(faltaEnFicha(fila({ titulo: ' ', tipo: '', fecha: '' }), false)).toEqual(['el título', 'el tipo', 'la fecha'])
  })
  it('no deja que caduque antes de su fecha', () => {
    expect(faltaEnFicha(fila({ caduca: '2026-01-01' }), false)).toEqual(['una caducidad posterior a la fecha'])
  })
  it('una empresa tiene que marcar la instalación; la administración no', () => {
    expect(faltaEnFicha(fila(), true)).toEqual(['la instalación'])
    expect(faltaEnFicha(fila({ instalaciones: ['x'] }), true)).toEqual([])
  })
})

describe('formulario', () => {
  it('lleva los campos que espera la función, sin caducidad si no hay', () => {
    const datos = formulario(fila({ titulo: '  Certificado  ', instalaciones: ['i1', 'i2'] }))
    expect(datos.get('id')).toBe(id)
    expect(datos.get('titulo')).toBe('Certificado')
    expect(datos.get('tipo')).toBe('certificado')
    expect(datos.get('fecha')).toBe('2026-03-10')
    expect(datos.has('caduca')).toBe(false)
    expect(datos.getAll('instalaciones')).toEqual(['i1', 'i2'])
    expect((datos.get('archivo') as File).name).toBe('prueba.pdf')
  })
})
