import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { leerCsv } from '../src/csv.ts'
import { AVISO_CAMBIADO, COLUMNAS, LIMITE_GITHUB_BYTES, avisos, claveDeRuta, combinar, escanear, juntarAvisos } from '../src/listado.ts'

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

  // El listado de ejemplo va en el repositorio, así que sus rutas cuentan desde su carpeta y no son absolutas.
  const desdeEjemplo = (ruta: string) => (ruta === '' ? '' : relative(ejemplo, ruta).split(sep).join('/'))
  const resumen = (f: Record<string, string>) =>
    [desdeEjemplo(f.ruta_original), f.nombre, f.extension, f.sha256, desdeEjemplo(f.duplicado_de), f.aviso]
  expect(filas.map(resumen)).toEqual(esperado.map(f => [f.ruta_original, f.nombre, f.extension, f.sha256, f.duplicado_de, f.aviso]))
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

test('acepta carpetas y archivos sueltos, y guarda la ruta completa', async () => {
  const plano = await crear('Planos/planta.pdf', 'plano')
  const suelto = await crear('Seguros/poliza.pdf', 'poliza')
  const filas = await escanear([join(carpeta, 'Planos'), suelto])
  expect(filas.map(f => f.ruta_original)).toEqual([plano, suelto])
})

test('no lista dos veces un archivo, ni los archivos del sistema, ni el propio listado', async () => {
  const a = await crear('a.pdf', 'uno')
  await crear('.DS_Store', 'x')
  await crear('Thumbs.db', 'x')
  const salida = await crear('listado.csv', 'x')
  const filas = await escanear([carpeta, a], [salida])
  expect(filas.map(f => f.ruta_original)).toEqual([a])
})

test('marca los duplicados por su huella, apuntando al primero', async () => {
  const original = await crear('a/original.pdf', 'mismo contenido')
  await crear('b/copia.pdf', 'mismo contenido')
  await crear('b/otro.pdf', 'contenido distinto')
  const { filas } = combinar([], await escanear([carpeta]))
  expect(filas.map(f => f.duplicado_de)).toEqual(['', original, ''])
})

test('avisa de lo que no es PDF y de lo que pasa de 100 MB', () => {
  expect(avisos('pdf', 1000)).toBe('')
  expect(avisos('txt', 1000)).toBe('no es PDF')
  expect(avisos('pdf', LIMITE_GITHUB_BYTES)).toBe('')
  expect(avisos('pdf', LIMITE_GITHUB_BYTES + 1)).toBe('más de 100 MB: GitHub no lo admite')
  expect(avisos('zip', LIMITE_GITHUB_BYTES + 1)).toBe('no es PDF; más de 100 MB: GitHub no lo admite')
})

test('al repetir, conserva lo rellenado a mano y añade solo los archivos nuevos', async () => {
  const a = await crear('a.pdf', 'uno')
  const primera = combinar([], await escanear([carpeta])).filas
  primera[0] = { ...primera[0], incluir: 'si', titulo: 'Rellenado a mano' }

  await crear('b.pdf', 'dos')
  await crear('c.pdf', 'uno')   // mismo contenido que a.pdf
  const segunda = combinar(primera, await escanear([carpeta]))

  expect(segunda.nuevas).toBe(2)
  expect(segunda.filas).toHaveLength(3)
  expect(segunda.filas[0]).toEqual(primera[0])
  expect(segunda.filas.map(f => f.duplicado_de)).toEqual(['', '', a])

  const tercera = combinar(segunda.filas, await escanear([carpeta]))
  expect(tercera.nuevas).toBe(0)
  expect(tercera.filas).toEqual(segunda.filas)
})

test('cada escaneo se suma a la hoja, aunque las carpetas estén en sitios distintos', async () => {
  const caja = await crear('oficina/Caja 1/a.pdf', 'uno')
  const red = await crear('servidor/Mantenimiento/b.pdf', 'dos')
  const primera = combinar([], await escanear([join(carpeta, 'oficina')])).filas
  primera[0] = { ...primera[0], incluir: 'si' }
  const segunda = combinar(primera, await escanear([join(carpeta, 'servidor')]))
  // Lo de la oficina no se ha vuelto a escanear: avisa de que no lo ve, pero conserva su fila intacta.
  expect(segunda.filas.map(f => f.ruta_original)).toEqual([caja, red])
  expect(segunda.filas[0]).toEqual(primera[0])
  expect(segunda.nuevas).toBe(1)
})

test('avisa de los archivos que siguen en el listado y ya no están en disco', async () => {
  const a = await crear('a.pdf', 'uno')
  const primera = combinar([], await escanear([carpeta])).filas
  await rm(a)
  const segunda = combinar(primera, await escanear([carpeta]))
  expect(segunda.desaparecidas).toEqual([a])
  expect(segunda.filas).toEqual(primera)
})

test('reconoce por la huella un archivo movido o renombrado, y conserva lo rellenado', async () => {
  const antes = await crear('Mantenimiento/scan0001.pdf', 'certificado de la caldera')
  const primera = combinar([], await escanear([carpeta])).filas
  primera[0] = { ...primera[0], incluir: 'si', titulo: 'Certificado de la caldera' }

  await rm(antes)
  const despues = await crear('Calefacción/certificado caldera.pdf', 'certificado de la caldera')
  const segunda = combinar(primera, await escanear([carpeta]))

  expect(segunda.movidas).toEqual([{ de: antes, a: despues }])
  expect(segunda.nuevas).toBe(0)
  expect(segunda.desaparecidas).toEqual([])
  expect(segunda.filas).toHaveLength(1)
  expect(segunda.filas[0]).toMatchObject({
    ruta_original: despues, nombre: 'certificado caldera.pdf', incluir: 'si', titulo: 'Certificado de la caldera',
  })
})

test('dos copias que desaparecen y una que aparece: se mueve una fila y la otra se da por desaparecida', async () => {
  const a = await crear('a.pdf', 'igual')
  const b = await crear('b.pdf', 'igual')
  const primera = combinar([], await escanear([carpeta])).filas
  await rm(a)
  await rm(b)
  const c = await crear('nuevo/c.pdf', 'igual')
  const segunda = combinar(primera, await escanear([carpeta]))
  expect(segunda.movidas).toEqual([{ de: a, a: c }])
  expect(segunda.desaparecidas).toEqual([b])
})

test('un listado antiguo, con rutas relativas, pasa a rutas completas sin perder lo rellenado', async () => {
  const completa = await crear('Contratos/contrato.pdf', 'contrato')
  const [nueva] = await escanear([carpeta])
  const antigua = { ...nueva, ruta_original: 'Contratos/contrato.pdf', incluir: 'si', titulo: 'Contrato' }
  const { filas, movidas, nuevas } = combinar([antigua], [nueva])
  expect(nuevas).toBe(0)
  expect(movidas).toHaveLength(1)
  expect(filas).toEqual([{ ...antigua, ruta_original: completa }])
})

test('avisa si un archivo ya listado ha cambiado, y apunta su huella nueva', async () => {
  const a = await crear('a.pdf', 'versión 1')
  const primera = combinar([], await escanear([carpeta])).filas
  primera[0] = { ...primera[0], incluir: 'si', titulo: 'Contrato' }
  await writeFile(a, 'versión 2, más larga')
  const [actual] = await escanear([carpeta])
  const segunda = combinar(primera, [actual])

  expect(segunda.cambiadas).toEqual([a])
  expect(segunda.filas[0]).toMatchObject({ sha256: actual.sha256, incluir: 'si', titulo: 'Contrato', aviso: AVISO_CAMBIADO })
  // Al volver a escanear sin más cambios, ya no sale como cambiado.
  expect(combinar(segunda.filas, [actual]).cambiadas).toEqual([])
})

test('en Windows, una ruta con otras mayúsculas es el mismo archivo', () => {
  const fila = (ruta: string) => ({ ruta_original: ruta, sha256: 'x', aviso: '' })
  const r = combinar([fila('C:\\Papel\\Caja.pdf')], [fila('c:\\papel\\caja.pdf')], 'win32')
  expect(r.nuevas).toBe(0)
  expect(r.desaparecidas).toEqual([])
  expect(claveDeRuta('C:\\A.pdf', 'linux')).toBe('C:\\A.pdf')
})

test('junta avisos sin repetirlos', () => {
  expect(juntarAvisos('no es PDF', '', 'no es PDF; otro')).toBe('no es PDF; otro')
})
