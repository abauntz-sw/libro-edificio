import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { huella } from '../src/archivos.ts'
import { comprobarListado, type Documento } from '../src/comprobar.ts'
import { comprobarArchivos, comprobarClon, commitDe, copiarDocumentos, guardarYSubir } from '../src/repositorio.ts'

const git = (carpeta: string, ...argumentos: string[]) =>
  execFileSync('git', argumentos, { cwd: carpeta, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

let carpeta: string
let origen: string   // los documentos originales
let servidor: string // hace de GitHub
let clon: string     // el clon del repositorio del edificio

beforeEach(async () => {
  carpeta = await mkdtemp(join(tmpdir(), 'importar-'))
  origen = join(carpeta, 'origen')
  servidor = join(carpeta, 'servidor.git')
  clon = join(carpeta, 'clon')
  await mkdir(origen)
  git(carpeta, 'init', '--quiet', '--bare', '--initial-branch=main', servidor)
  git(carpeta, 'clone', '--quiet', servidor, clon)
  git(clon, 'config', 'user.name', 'Pruebas')
  git(clon, 'config', 'user.email', 'pruebas@example.com')
  git(clon, 'config', 'commit.gpgsign', 'false')
})
afterEach(async () => { await rm(carpeta, { recursive: true, force: true }) })

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

const commitsEnServidor = () => Number(git(servidor, 'rev-list', '--count', 'main'))

test('copia los archivos a documentos/AAAA, hace un único commit y lo sube, sin tocar los originales', async () => {
  const documentos = await preparar({ 'a/uno.pdf': 'uno', 'b/dos.pdf': 'dos' })

  expect(await copiarDocumentos(clon, origen, documentos)).toBe(2)
  expect(await guardarYSubir(clon, 'Carga de 2 documentos')).toBe(true)

  for (const doc of documentos) {
    expect(doc.ruta).toMatch(/^documentos\/2025\/[0-9a-f-]{36}\.pdf$/)
    expect(await huella(join(clon, doc.ruta))).toBe(doc.sha256)
    expect(await commitDe(clon, doc.ruta)).toBe(git(servidor, 'rev-parse', 'main'))
  }
  expect(commitsEnServidor()).toBe(1)
  expect(await readFile(join(origen, 'a/uno.pdf'), 'utf8')).toBe('uno')
})

test('repetir la carga no copia ni hace otro commit', async () => {
  const documentos = await preparar({ 'a/uno.pdf': 'uno' })
  await copiarDocumentos(clon, origen, documentos)
  await guardarYSubir(clon, 'Carga')

  expect(await copiarDocumentos(clon, origen, documentos)).toBe(0)
  expect(await guardarYSubir(clon, 'Carga')).toBe(false)
  expect(commitsEnServidor()).toBe(1)
})

test('si se cortó después de copiar, al repetir se guarda y se sube lo que faltaba', async () => {
  const documentos = await preparar({ 'a/uno.pdf': 'uno' })
  await copiarDocumentos(clon, origen, documentos)   // aquí se corta: copiado, sin commit

  expect(await comprobarClon(clon)).toEqual([])
  expect(await copiarDocumentos(clon, origen, documentos)).toBe(0)
  expect(await guardarYSubir(clon, 'Carga')).toBe(true)
  expect(commitsEnServidor()).toBe(1)
})

test('si se cortó entre el commit y el push, al repetir se sube', async () => {
  const documentos = await preparar({ 'a/uno.pdf': 'uno' })
  await copiarDocumentos(clon, origen, documentos)
  git(clon, 'add', 'documentos')
  git(clon, 'commit', '--quiet', '-m', 'Carga')   // aquí se corta: con commit, sin push

  expect(await guardarYSubir(clon, 'Carga')).toBe(false)
  expect(commitsEnServidor()).toBe(1)
})

test('no sobrescribe un archivo del repositorio que tiene otro contenido', async () => {
  const [doc] = await preparar({ 'a/uno.pdf': 'uno' })
  await mkdir(dirname(join(clon, doc.ruta)), { recursive: true })
  await writeFile(join(clon, doc.ruta), 'otra cosa')

  await expect(copiarDocumentos(clon, origen, [doc])).rejects.toThrow('ya existe en el repositorio con otro contenido')
  expect(await readFile(join(clon, doc.ruta), 'utf8')).toBe('otra cosa')
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

test('comprobarClon rechaza una carpeta que no es un clon y un clon con cambios ajenos', async () => {
  expect(await comprobarClon(origen)).toEqual([`${origen} no es un clon de Git`])

  expect(await comprobarClon(clon)).toEqual([])
  await writeFile(join(clon, 'notas.txt'), 'algo a medias')
  expect((await comprobarClon(clon))[0]).toMatch(/tiene cambios sin guardar que no son de la carga/)
  expect(existsSync(join(clon, 'documentos'))).toBe(false)
})
