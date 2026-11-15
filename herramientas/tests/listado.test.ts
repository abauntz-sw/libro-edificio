import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { leerCsv } from '../src/csv.ts'
import { COLUMNAS, LIMITE_GITHUB_BYTES, avisos, carpetaBase, combinar, escanear } from '../src/listado.ts'

const ejemplo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'edificio-ejemplo-entrada')

let carpeta: string
beforeEach(async () => { carpeta = await mkdtemp(join(tmpdir(), 'escanear-')) })
afterEach(async () => { await rm(carpeta, { recursive: true, force: true }) })

async function crear(ruta: string, contenido: string): Promise<string> {
  const completa = join(carpeta, ruta)
  await mkdir(dirname(completa), { recursive: true })
  await writeFile(completa, contenido)
  return completa
}

test('la carpeta de ejemplo da las mismas rutas, huellas, duplicados y avisos que su listado', async () => {
  const esperado = leerCsv(await readFile(join(ejemplo, 'listado.csv'), 'utf8')).filas
  const { filas } = combinar([], await escanear([join(ejemplo, 'entrada')]))

  const resumen = (f: Record<string, string>) =>
    [f.ruta_original, f.nombre, f.extension, f.sha256, f.duplicado_de, f.aviso]
  expect(filas.map(resumen)).toEqual(esperado.map(resumen))
  expect(filas).toHaveLength(15)
})

test('cada fila lleva todas las columnas y las que se rellenan a mano van vacías', async () => {
  await crear('a.pdf', 'uno')
  const [fila] = await escanear([carpeta])
  expect(Object.keys(fila)).toEqual(COLUMNAS)
  expect(fila.incluir).toBe('')
  expect(fila.tamano_mb).toBe('0.000')
  expect(fila.fecha_modificacion).toMatch(/^\d{4}-\d{2}-\d{2}$/)
})

test('acepta carpetas y archivos sueltos, y las rutas salen desde la carpeta común', async () => {
  await crear('Planos/planta.pdf', 'plano')
  const suelto = await crear('Seguros/poliza.pdf', 'poliza')
  const filas = await escanear([join(carpeta, 'Planos'), suelto])
  expect(filas.map(f => f.ruta_original)).toEqual(['Planos/planta.pdf', 'Seguros/poliza.pdf'])
  expect(await carpetaBase([join(carpeta, 'Planos')])).toBe(join(carpeta, 'Planos'))
})

test('no lista dos veces un archivo, ni los archivos del sistema, ni el propio listado', async () => {
  const a = await crear('a.pdf', 'uno')
  await crear('.DS_Store', 'x')
  await crear('Thumbs.db', 'x')
  const salida = await crear('listado.csv', 'x')
  const filas = await escanear([carpeta, a], [salida])
  expect(filas.map(f => f.ruta_original)).toEqual(['a.pdf'])
})

test('marca los duplicados por su huella, apuntando al primero', async () => {
  await crear('a/original.pdf', 'mismo contenido')
  await crear('b/copia.pdf', 'mismo contenido')
  await crear('b/otro.pdf', 'contenido distinto')
  const { filas } = combinar([], await escanear([carpeta]))
  expect(filas.map(f => f.duplicado_de)).toEqual(['', 'a/original.pdf', ''])
})

test('avisa de lo que no es PDF y de lo que pasa de 100 MB', () => {
  expect(avisos('pdf', 1000)).toBe('')
  expect(avisos('txt', 1000)).toBe('no es PDF')
  expect(avisos('pdf', LIMITE_GITHUB_BYTES)).toBe('')
  expect(avisos('pdf', LIMITE_GITHUB_BYTES + 1)).toBe('más de 100 MB: GitHub no lo admite')
  expect(avisos('zip', LIMITE_GITHUB_BYTES + 1)).toBe('no es PDF; más de 100 MB: GitHub no lo admite')
})

test('al repetir, conserva lo rellenado a mano y añade solo los archivos nuevos', async () => {
  await crear('a.pdf', 'uno')
  const primera = combinar([], await escanear([carpeta])).filas
  primera[0] = { ...primera[0], incluir: 'si', titulo: 'Rellenado a mano' }

  await crear('b.pdf', 'dos')
  await crear('c.pdf', 'uno')   // mismo contenido que a.pdf
  const segunda = combinar(primera, await escanear([carpeta]))

  expect(segunda.nuevas).toBe(2)
  expect(segunda.filas).toHaveLength(3)
  expect(segunda.filas[0]).toEqual(primera[0])
  expect(segunda.filas.map(f => f.duplicado_de)).toEqual(['', '', 'a.pdf'])

  const tercera = combinar(segunda.filas, await escanear([carpeta]))
  expect(tercera.nuevas).toBe(0)
  expect(tercera.filas).toEqual(segunda.filas)
})

test('avisa de los archivos que siguen en el listado y ya no están en disco', async () => {
  const a = await crear('a.pdf', 'uno')
  const primera = combinar([], await escanear([carpeta])).filas
  await rm(a)
  const segunda = combinar(primera, await escanear([carpeta]))
  expect(segunda.desaparecidas).toEqual(['a.pdf'])
  expect(segunda.filas).toEqual(primera)
})
