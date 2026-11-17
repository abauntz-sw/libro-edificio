import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { expect, test } from 'vitest'
import { agrupar, analizar, buscarSeparadoras, partir, yaEstaListo } from '../src/partir.ts'
import { crearSeparadora } from '../src/separadora.ts'
import { pdfFicticio } from './ayuda.ts'

/** Texto de cada página de un PDF. */
async function textos(pdf: Uint8Array): Promise<string[]> {
  const tarea = getDocument({ data: new Uint8Array(pdf), verbosity: 0 })
  const documento = await tarea.promise
  const paginas: string[] = []
  for (let n = 1; n <= documento.numPages; n++) {
    const contenido = await (await documento.getPage(n)).getTextContent()
    paginas.push(contenido.items.map(i => ('str' in i ? i.str : '')).join(''))
  }
  await tarea.destroy()
  return paginas
}

test('la hoja separadora se reconoce a sí misma', async () => {
  expect(await buscarSeparadoras(await crearSeparadora())).toEqual([0])
})

test('un PDF con 3 documentos y 2 separadoras queda en 3 PDF, sin las separadoras', async () => {
  const escaneo = await pdfFicticio([
    'Certificado ficticio de extintores', '---',
    'Contrato ficticio, hoja 1', 'Contrato ficticio, hoja 2', '---',
    'Informe ficticio de agua',
  ])
  expect(await buscarSeparadoras(escaneo)).toEqual([1, 4])

  const partes = await partir(escaneo)
  expect(partes).toHaveLength(3)
  expect(await textos(partes[0])).toEqual(['Certificado ficticio de extintores'])
  expect(await textos(partes[1])).toEqual(['Contrato ficticio, hoja 1', 'Contrato ficticio, hoja 2'])
  expect(await textos(partes[2])).toEqual(['Informe ficticio de agua'])
})

test('un PDF sin separadoras queda en un solo documento', async () => {
  const partes = await partir(await pdfFicticio(['Hoja 1', 'Hoja 2']))
  expect(partes).toHaveLength(1)
  expect(await textos(partes[0])).toEqual(['Hoja 1', 'Hoja 2'])
})

test('analizar cuenta las páginas con texto y las separadoras', async () => {
  const analisis = await analizar(await pdfFicticio(['Hoja 1', '---', 'Hoja 2']))
  expect(analisis).toEqual({ paginas: 3, separadoras: [1], paginasConTexto: 3 })
  expect(yaEstaListo(analisis)).toBe(false)
  expect(yaEstaListo({ paginas: 2, separadoras: [], paginasConTexto: 2 })).toBe(true)
  expect(yaEstaListo({ paginas: 2, separadoras: [], paginasConTexto: 1 })).toBe(false)
  expect(yaEstaListo({ paginas: 0, separadoras: [], paginasConTexto: 0 })).toBe(false)
})

test('agrupar no crea documentos vacíos', () => {
  expect(agrupar(6, [1, 4])).toEqual([[0], [2, 3], [5]])
  expect(agrupar(5, [0, 2, 3, 4])).toEqual([[1]])
  expect(agrupar(2, [])).toEqual([[0, 1]])
  expect(agrupar(1, [0])).toEqual([])
})
