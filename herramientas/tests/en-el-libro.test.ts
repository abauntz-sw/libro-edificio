import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { huella, listarArchivos } from '../src/archivos.ts'
import { escribirCsv, leerCsv } from '../src/csv.ts'
import { apartar, apartarCargadas, destinoEnElLibro, estaEnElLibro } from '../src/en-el-libro.ts'
import { COLUMNAS, combinar, escanear } from '../src/listado.ts'

const herramientas = join(dirname(fileURLToPath(import.meta.url)), '..')

let carpeta: string
beforeEach(async () => { carpeta = await mkdtemp(join(tmpdir(), 'en-el-libro-')) })
afterEach(async () => {
  // En Windows, un archivo de solo lectura no se deja borrar: se le quita antes.
  const todos = async (c: string): Promise<string[]> => (await readdir(c, { withFileTypes: true, recursive: true }))
    .filter(e => e.isFile()).map(e => join(e.parentPath, e.name))
  for (const archivo of await todos(carpeta)) await chmod(archivo, 0o666)
  await rm(carpeta, { recursive: true, force: true })
})

async function crear(ruta: string, contenido: string): Promise<string> {
  const completa = join(carpeta, ruta)
  await mkdir(dirname(completa), { recursive: true })
  await writeFile(completa, contenido)
  return completa
}

test('aparta el archivo a [en-el-libro], sin cambiarlo, y lo deja en solo lectura', async () => {
  const original = await crear('Mantenimiento/caldera.pdf', 'certificado')
  const antes = await huella(original)
  const resultado = await apartar(original)

  const destino = join(carpeta, 'Mantenimiento', '[en-el-libro]', 'caldera.pdf')
  expect(resultado).toEqual({ movido: true, destino })
  expect(existsSync(original)).toBe(false)
  expect(await huella(destino)).toBe(antes)
  expect((await stat(destino)).mode & 0o200).toBe(0)
})

test('no mueve si ya hay otro archivo con ese nombre, y lo dice', async () => {
  const original = await crear('a/caldera.pdf', 'uno')
  await crear('a/[en-el-libro]/caldera.pdf', 'otro')
  const resultado = await apartar(original)
  expect(resultado.movido).toBe(false)
  expect(resultado.movido === false && resultado.motivo).toContain('ya hay un archivo con ese nombre')
  expect(await readFile(original, 'utf8')).toBe('uno')
})

test('no mueve lo que ya está apartado ni lo que no encuentra', async () => {
  const apartado = await crear('a/[en-el-libro]/x.pdf', 'x')
  expect(await apartar(apartado)).toEqual({ movido: false, motivo: 'ya está en una carpeta [en-el-libro]' })
  expect(await apartar(join(carpeta, 'no-existe.pdf'))).toEqual({ movido: false, motivo: 'no está en su sitio' })
})

test('reconoce las rutas dentro de [en-el-libro], con barras de Windows o no', () => {
  expect(estaEnElLibro('C:\\Papel\\[en-el-libro]\\a.pdf')).toBe(true)
  expect(estaEnElLibro('/papel/[en-el-libro]/a.pdf')).toBe(true)
  expect(estaEnElLibro('/papel/en-el-libro/a.pdf')).toBe(false)
  expect(destinoEnElLibro(join('papel', 'a.pdf'))).toBe(join('papel', '[en-el-libro]', 'a.pdf'))
})

test('escanear no entra en [en-el-libro]', async () => {
  const nuevo = await crear('a/nuevo.pdf', 'nuevo')
  await crear('a/[en-el-libro]/cargado.pdf', 'ya en el Libro')
  expect(await listarArchivos(carpeta)).toEqual([nuevo])
})

test('una fila apartada a [en-el-libro] no se da por desaparecida ni cambiada', async () => {
  const original = await crear('a/caldera.pdf', 'certificado')
  const primera = combinar([], await escanear([carpeta])).filas
  const { destino } = await apartar(original) as { destino: string }
  primera[0] = { ...primera[0], ruta_original: destino, incluir: 'si' }

  const segunda = combinar(primera, await escanear([carpeta]), process.platform, new Set([destino]))
  expect(segunda.desaparecidas).toEqual([])
  expect(segunda.cambiadas).toEqual([])
  expect(segunda.filas).toEqual(primera)
})

test('si importar no pudo poner al día el listado, escanear encuentra el archivo en [en-el-libro] y corrige su ruta', async () => {
  const original = await crear('Papel/caldera.pdf', 'certificado')
  const listado = join(carpeta, 'listado.csv')
  const ejecutar = () => execFileSync(process.execPath, ['src/escanear.ts', '--salida', listado, join(carpeta, 'Papel')],
    { cwd: herramientas, encoding: 'utf8' })
  ejecutar()
  // Como si importar lo hubiera apartado con el listado abierto en Excel.
  await apartar(original)
  const salida = ejecutar()

  expect(salida).toContain('1 filas apuntan ahora a su archivo en [en-el-libro]')
  expect(salida).toContain('1 ya en el Libro')
  expect(salida).not.toContain('ya no está en las carpetas')
  const filas = leerCsv(await readFile(listado, 'utf8')).filas
  expect(filas.map(f => f.ruta_original)).toEqual([destinoEnElLibro(original)])
})

test('importar aparta solo las filas que se le dicen, avisa de las que no puede y pone al día el listado', async () => {
  const cargado = await crear('Papel/cargado.pdf', 'en el Libro')
  const pendiente = await crear('Papel/pendiente.pdf', 'con error al cargar')
  await crear('Papel/choca.pdf', 'en el Libro también')
  await crear('Papel/[en-el-libro]/choca.pdf', 'otro con el mismo nombre')
  const listado = join(carpeta, 'listado.csv')
  const filas: Record<string, string>[] = [cargado, pendiente, 'Papel/choca.pdf'].map(ruta => ({ ...Object.fromEntries(COLUMNAS.map(c => [c, ''])), ruta_original: ruta }))
  filas[1].duplicado_de = cargado
  await writeFile(listado, escribirCsv(COLUMNAS, filas), 'utf8')

  // Filas 2 y 4 de la hoja: la primera y la tercera. La tercera es relativa y cuenta desde la carpeta del listado.
  const r = await apartarCargadas(listado, COLUMNAS, filas, [2, 4], carpeta)

  expect(r.apartados).toBe(1)
  expect(r.listadoAlDia).toBe(true)
  expect(r.avisos).toEqual([expect.stringMatching(/^Fila 4: no se ha apartado a \[en-el-libro\] porque ya hay un archivo con ese nombre/)])
  expect(existsSync(destinoEnElLibro(cargado))).toBe(true)
  expect(existsSync(pendiente)).toBe(true)
  const guardado = leerCsv(await readFile(listado, 'utf8')).filas.map(f => f.ruta_original)
  expect(guardado).toEqual([destinoEnElLibro(cargado), pendiente, 'Papel/choca.pdf'])
  // La fila que era copia de la apartada la sigue.
  expect(leerCsv(await readFile(listado, 'utf8')).filas[1].duplicado_de).toBe(destinoEnElLibro(cargado))
})

test('si no se mueve nada, no toca el listado', async () => {
  const listado = join(carpeta, 'listado.csv')
  await writeFile(listado, 'no tocar')
  const filas = [{ ruta_original: join(carpeta, 'no-existe.pdf') }]
  const r = await apartarCargadas(listado, COLUMNAS, filas, [2], carpeta)
  expect(r.apartados).toBe(0)
  expect(await readFile(listado, 'utf8')).toBe('no tocar')
})

