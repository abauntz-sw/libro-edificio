import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { huella } from '../src/archivos.ts'
import { comprobarListado, type Documento } from '../src/comprobar.ts'
import { comprobarArchivos, conCopiaTemporal, copiarDocumentos, guardarYSubir, limpiarCopiasAbandonadas, rutaDelOriginal, ultimoCommit } from '../src/repositorio.ts'

const git = (carpeta: string, ...argumentos: string[]) =>
  execFileSync('git', argumentos, { cwd: carpeta, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

// Quién firma los commits de las pruebas. Va por variables de entorno porque la copia temporal la crea el propio programa.
Object.assign(process.env, {
  GIT_AUTHOR_NAME: 'Pruebas', GIT_AUTHOR_EMAIL: 'pruebas@example.com',
  GIT_COMMITTER_NAME: 'Pruebas', GIT_COMMITTER_EMAIL: 'pruebas@example.com',
  GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'commit.gpgsign', GIT_CONFIG_VALUE_0: 'false',
})

let carpeta: string
let origen: string    // los documentos originales
let servidor: string  // hace de GitHub
let direccion: string // la dirección del repositorio del edificio

beforeEach(async () => {
  carpeta = await mkdtemp(join(tmpdir(), 'importar-'))
  origen = join(carpeta, 'origen')
  servidor = join(carpeta, 'servidor.git')
  direccion = pathToFileURL(servidor).href
  await mkdir(origen)
  git(carpeta, 'init', '--quiet', '--bare', '--initial-branch=main', servidor)
  // Como GitHub: deja pedir una copia sin el contenido de los archivos.
  git(servidor, 'config', 'uploadpack.allowFilter', 'true')
})
afterEach(async () => { await rm(carpeta, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) })

/** Crea originales ficticios y devuelve sus documentos ya comprobados. */
async function preparar(archivos: Record<string, string>): Promise<Documento[]> {
  const filas = []
  for (const [ruta, contenido] of Object.entries(archivos)) {
    await mkdir(dirname(join(origen, ruta)), { recursive: true })
    await writeFile(join(origen, ruta), contenido)
    filas.push({
      ruta_original: ruta, nombre: ruta.split('/').pop()!, extension: 'pdf', sha256: await huella(join(origen, ruta)),
      incluir: 'si', tipo: 'informe', titulo: `Informe ${ruta}`, fecha: '2025-06-01', emisor: '', instalaciones: '', caduca: '',
    })
  }
  const catalogo = { edificioId: 'bf8db03c-259a-54f2-8933-e6850777d963', tipos: ['informe'], instalaciones: [], huellas: new Set<string>() }
  return comprobarListado(filas, catalogo).documentos
}

/** Hace la carga como `importar`: copia temporal, copiar, commit y push. */
const cargar = (documentos: Documento[]) =>
  conCopiaTemporal(direccion, documentos.map(doc => doc.ruta), async copia => ({
    copia,
    copiados: await copiarDocumentos(copia, origen, documentos),
    conCommit: await guardarYSubir(copia, `Carga de ${documentos.length} documentos`),
    commit: await ultimoCommit(copia),
  }))

const commitsEnServidor = () => Number(git(servidor, 'rev-list', '--count', 'main'))

/** Identificador que Git da al contenido de un archivo. Sirve para comparar contenidos sin leerlos. */
const contenidoEnServidor = (ruta: string) => git(servidor, 'rev-parse', `main:${ruta}`)
const contenidoDe = (archivo: string) => git(carpeta, 'hash-object', '--no-filters', archivo)

test('sube los archivos a documentos/AAAA en un único commit, sin tocar los originales', async () => {
  const documentos = await preparar({ 'a/uno.pdf': 'uno', 'b/dos.pdf': 'dos' })

  const carga = await cargar(documentos)

  expect(carga).toMatchObject({ copiados: 2, conCommit: true, commit: git(servidor, 'rev-parse', 'main') })
  for (const doc of documentos) {
    // El nombre legible (#77): fecha, tipo, descripción e identificador.
    expect(doc.ruta).toMatch(/^documentos\/2025\/2025-06-01_informe_[a-z0-9-]+_[0-9a-f-]{36}\.pdf$/)
    expect(contenidoEnServidor(doc.ruta)).toBe(contenidoDe(join(origen, doc.rutaOriginal)))
  }
  expect(commitsEnServidor()).toBe(1)
  expect(await readFile(join(origen, 'a/uno.pdf'), 'utf8')).toBe('uno')
})

test('la copia temporal se borra al terminar', async () => {
  const carga = await cargar(await preparar({ 'a/uno.pdf': 'uno' }))

  expect(carga.copia).not.toBe('')
  expect(existsSync(carga.copia)).toBe(false)
})

test('la copia temporal se borra también si la carga falla a medias', async () => {
  const documentos = await preparar({ 'a/uno.pdf': 'uno' })
  let copia = ''

  await expect(conCopiaTemporal(direccion, documentos.map(doc => doc.ruta), async carpetaTemporal => {
    copia = carpetaTemporal
    await copiarDocumentos(copia, origen, documentos)
    expect(existsSync(join(copia, documentos[0].ruta))).toBe(true)
    throw new Error('se ha cortado')
  })).rejects.toThrow('se ha cortado')

  expect(existsSync(copia)).toBe(false)
  expect(() => git(servidor, 'rev-parse', '--verify', 'main')).toThrow()   // no se ha subido nada
})

test('repetir la carga no copia ni hace otro commit', async () => {
  const documentos = await preparar({ 'a/uno.pdf': 'uno' })
  const primera = await cargar(documentos)

  const segunda = await cargar(documentos)

  expect(segunda).toMatchObject({ copiados: 0, conCommit: false, commit: primera.commit })
  expect(commitsEnServidor()).toBe(1)
})

test('no trae al equipo los documentos que ya había en el repositorio', async () => {
  const [anterior] = await preparar({ 'a/uno.pdf': 'uno' })
  await cargar([anterior])
  const [nuevo] = await preparar({ 'b/dos.pdf': 'dos' })

  await conCopiaTemporal(direccion, [nuevo.ruta], async copia => {
    await copiarDocumentos(copia, origen, [nuevo])
    await guardarYSubir(copia, 'Carga')

    // Ni en la carpeta ni en lo que Git guarda por dentro: el contenido del anterior figura como «no bajado».
    expect(existsSync(join(copia, anterior.ruta))).toBe(false)
    expect(git(copia, 'rev-list', '--objects', '--missing=print', 'HEAD')).toContain(`?${contenidoEnServidor(anterior.ruta)}`)
  })

  // Y el anterior sigue en el repositorio: el commit nuevo no lo ha borrado.
  expect(contenidoEnServidor(anterior.ruta)).toBe(contenidoDe(join(origen, 'a/uno.pdf')))
  expect(contenidoEnServidor(nuevo.ruta)).toBe(contenidoDe(join(origen, 'b/dos.pdf')))
  expect(commitsEnServidor()).toBe(2)
})

test('no sobrescribe un archivo del repositorio que tiene otro contenido', async () => {
  const [doc] = await preparar({ 'a/uno.pdf': 'uno' })
  // Alguien ha subido antes otra cosa a esa misma ruta.
  const otro = join(carpeta, 'otro')
  git(carpeta, 'clone', '--quiet', servidor, otro)
  await mkdir(dirname(join(otro, doc.ruta)), { recursive: true })
  await writeFile(join(otro, doc.ruta), 'otra cosa')
  git(otro, 'add', '.')
  git(otro, 'commit', '--quiet', '-m', 'Otra cosa')
  git(otro, 'push', '--quiet', 'origin', 'HEAD:main')

  await expect(cargar([doc])).rejects.toThrow('ya existe en el repositorio con otro contenido')

  expect(contenidoEnServidor(doc.ruta)).toBe(contenidoDe(join(otro, doc.ruta)))
  expect(commitsEnServidor()).toBe(1)
})

test('guarda los archivos tal cual, sin cambiar los saltos de línea', async () => {
  const documentos = await preparar({ 'a/windows.pdf': 'uno\r\ndos\r\n', 'a/linux.pdf': 'uno\ndos\n' })

  await cargar(documentos)
  // Al repetir, baja los dos y compara su huella: si Git los hubiera cambiado, daría «otro contenido».
  const segunda = await cargar(documentos)

  for (const doc of documentos) expect(contenidoEnServidor(doc.ruta)).toBe(contenidoDe(join(origen, doc.rutaOriginal)))
  expect(segunda).toMatchObject({ copiados: 0, conCommit: false })
})

test('dice claro que no puede abrir un repositorio que no existe', async () => {
  const [doc] = await preparar({ 'a/uno.pdf': 'uno' })
  const mala = pathToFileURL(join(carpeta, 'no-existe.git')).href

  await expect(conCopiaTemporal(mala, [doc.ruta], async () => 'no llega aquí')).rejects.toThrow(`No he podido abrir el repositorio ${mala}`)
})

test('avisa si un original falta o ha cambiado desde que se escaneó', async () => {
  const documentos = await preparar({ 'a/uno.pdf': 'uno', 'b/dos.pdf': 'dos', 'c/tres.pdf': 'tres' })
  await writeFile(join(origen, 'a/uno.pdf'), 'uno cambiado')
  await rm(join(origen, 'b/dos.pdf'))

  const { errores, bytes } = await comprobarArchivos(documentos, origen)
  expect(errores.map(e => e.fila)).toEqual([2, 3])
  expect(errores[0].mensaje).toMatch(/ha cambiado desde que se escaneó/)
  expect(errores[1].mensaje).toMatch(/no encuentro el archivo/)
  expect(bytes.get(4)).toBe(4)
})

test('borra las copias abandonadas de más de una hora y deja las recientes y lo demás', async () => {
  const temporal = join(carpeta, 'temporal')
  const vieja = join(temporal, 'libro-carga-vieja')
  const reciente = join(temporal, 'libro-carga-reciente')
  const otra = join(temporal, 'otra-cosa')
  for (const c of [vieja, reciente, otra]) await mkdir(join(c, 'documentos'), { recursive: true })
  await writeFile(join(vieja, 'documentos', 'real.pdf'), '%PDF-')
  const ahora = Date.now()
  const haceDosHoras = new Date(ahora - 2 * 60 * 60 * 1000)
  await utimes(vieja, haceDosHoras, haceDosHoras)
  await utimes(otra, haceDosHoras, haceDosHoras)

  expect(await limpiarCopiasAbandonadas(temporal, ahora)).toBe(1)
  expect(existsSync(vieja)).toBe(false)
  expect(existsSync(reciente)).toBe(true)
  expect(existsSync(otra)).toBe(true)
})

test('si la carpeta temporal no existe, no falla', async () => {
  expect(await limpiarCopiasAbandonadas(join(carpeta, 'no-existe'))).toBe(0)
})

test('la ruta completa del listado se usa tal cual; una relativa cuenta desde la carpeta del listado', () => {
  const listado = join(tmpdir(), 'carga')
  const completa = join(tmpdir(), 'otra', 'Caja 1', 'a.pdf')
  expect(rutaDelOriginal(listado, completa)).toBe(completa)
  expect(rutaDelOriginal(listado, 'entrada/Contratos/a.pdf')).toBe(join(listado, 'entrada', 'Contratos', 'a.pdf'))
})
