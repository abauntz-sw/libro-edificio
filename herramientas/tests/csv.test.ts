import { expect, test } from 'vitest'
import { escribirCsv, leerCsv } from '../src/csv.ts'

test('escribe con BOM, separador «;» y saltos de línea de Windows', () => {
  const texto = escribirCsv(['a', 'b'], [{ a: '1', b: '2' }])
  expect(texto).toBe('﻿a;b\r\n1;2\r\n')
})

test('lo escrito se lee igual, también con «;», comillas, saltos de línea y acentos', () => {
  const filas = [
    { titulo: 'Póliza; anexo', emisor: 'Seguros "Ficticios" SA', nota: 'línea 1\nlínea 2' },
    { titulo: 'Boletín eléctrico', emisor: '', nota: '' },
  ]
  const leido = leerCsv(escribirCsv(['titulo', 'emisor', 'nota'], filas))
  expect(leido.columnas).toEqual(['titulo', 'emisor', 'nota'])
  expect(leido.filas).toEqual(filas)
})

test('una columna que falta en la fila se escribe vacía', () => {
  expect(escribirCsv(['a', 'b'], [{ a: '1' }])).toBe('﻿a;b\r\n1;\r\n')
})

test('ignora las líneas vacías y admite saltos de línea sin retorno de carro', () => {
  const leido = leerCsv('a;b\n1;2\n\n3;4\n')
  expect(leido.filas).toEqual([{ a: '1', b: '2' }, { a: '3', b: '4' }])
})
