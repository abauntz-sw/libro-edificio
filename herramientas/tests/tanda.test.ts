import { createCanvas } from '@napi-rs/canvas'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { huella } from '../src/archivos.ts'
import { hayOcr, libreOffice } from '../src/externos.ts'
import { carpetaDeTanda, prepararTanda } from '../src/tanda.ts'
import { pdfFicticio } from './ayuda.ts'

// En el CI los programas de fuera están instalados y sus pruebas son obligatorias.
// En un ordenador sin ellos, esas pruebas se saltan.
const exigir = process.env.EXIGIR_PROGRAMAS === '1'
const conOcr = exigir || await hayOcr()
const conLibreOffice = exigir || await libreOffice() !== null

let carpeta: string
beforeEach(async () => { carpeta = await mkdtemp(join(tmpdir(), 'tanda-prueba-')) })
afterEach(async () => { await rm(carpeta, { recursive: true, force: true }) })

async function abrir(pdf: Uint8Array) {
  const tarea = getDocument({ data: new Uint8Array(pdf), verbosity: 0 })
  return { tarea, documento: await tarea.promise }
}

/** Convierte cada página en una imagen, como sale de un escáner: el PDF resultante no tiene texto. */
async function comoEscaneo(pdf: Uint8Array): Promise<Uint8Array> {
  const { tarea, documento } = await abrir(pdf)
  const escaneo = await PDFDocument.create()
  for (let n = 1; n <= documento.numPages; n++) {
    const pagina = await documento.getPage(n)
    const vista = pagina.getViewport({ scale: 200 / 72 })   // 200 ppp
    const lienzo = createCanvas(Math.ceil(vista.width), Math.ceil(vista.height))
    await pagina.render({ canvas: lienzo as unknown as HTMLCanvasElement, viewport: vista, background: 'white' }).promise
    const imagen = await escaneo.embedJpg(lienzo.toBuffer('image/jpeg'))
    escaneo.addPage([595.28, 841.89]).drawImage(imagen, { x: 0, y: 0, width: 595.28, height: 841.89 })
  }
  await tarea.destroy()
  return escaneo.save()
}

async function texto(ruta: string): Promise<string> {
  const { tarea, documento } = await abrir(await readFile(ruta))
  let todo = ''
  for (let n = 1; n <= documento.numPages; n++) {
    const contenido = await (await documento.getPage(n)).getTextContent()
    todo += contenido.items.map(i => ('str' in i ? i.str : '')).join(' ') + '\n'
  }
  await tarea.destroy()
  return todo
}

const TRES_DOCUMENTOS = [
  'Certificado ficticio de extintores', '---',
  'Contrato ficticio de mantenimiento', 'Segunda hoja del contrato', '---',
  'Informe ficticio de legionela',
]

test('un escaneo con 3 documentos y 2 separadoras queda en 3 PDF, y el original sigue igual', async () => {
  const original = join(carpeta, 'tanda.pdf')
  await writeFile(original, await comoEscaneo(await pdfFicticio(TRES_DOCUMENTOS)))
  const antes = await huella(original)
  const salida = join(carpeta, 'Escaneos 2026-11')

  const { creados } = await prepararTanda([original], salida, false)

  expect(await readdir(salida)).toEqual(['tanda-01.pdf', 'tanda-02.pdf', 'tanda-03.pdf'])
  expect(creados).toHaveLength(3)
  const paginas = await Promise.all(creados.map(async c => (await PDFDocument.load(await readFile(c))).getPageCount()))
  expect(paginas).toEqual([1, 2, 1])
  expect(await huella(original)).toBe(antes)
})

test.skipIf(!conOcr)('con OCR, los 3 PDF tienen texto que se puede buscar', async () => {
  const original = join(carpeta, 'tanda.pdf')
  await writeFile(original, await comoEscaneo(await pdfFicticio(TRES_DOCUMENTOS)))
  expect(await texto(original)).not.toMatch(/\w/)   // el escaneo no tiene texto

  const { creados } = await prepararTanda([original], join(carpeta, 'salida'))

  expect(creados).toHaveLength(3)
  expect((await texto(creados[0])).toLowerCase()).toContain('extintores')
  expect((await texto(creados[1])).toLowerCase()).toContain('contrato')
  expect((await texto(creados[2])).toLowerCase()).toContain('legionela')
}, 180_000)

test.skipIf(!conLibreOffice)('un .docx ficticio pasa a PDF y el original sigue igual', async () => {
  // El .docx ficticio se crea con el propio LibreOffice, a partir de un texto.
  const programa = (await libreOffice())!
  const { execFileSync } = await import('node:child_process')
  await writeFile(join(carpeta, 'acta.txt'), 'Acta ficticia de la visita al albergue de ejemplo')
  execFileSync(programa, ['--headless', '--convert-to', 'docx:MS Word 2007 XML', '--outdir', carpeta, join(carpeta, 'acta.txt')], { stdio: 'ignore' })
  const original = join(carpeta, 'acta.docx')
  expect(existsSync(original)).toBe(true)
  await rm(join(carpeta, 'acta.txt'))
  const antes = await huella(original)

  const { creados } = await prepararTanda([original], join(carpeta, 'salida'))

  expect(creados.map(c => c.split(/[\\/]/).pop())).toEqual(['acta-docx.pdf'])
  expect(await texto(creados[0])).toContain('Acta ficticia')
  expect(await huella(original)).toBe(antes)
}, 180_000)

test('lo que no es PDF, .docx ni .odt no se toca', async () => {
  await writeFile(join(carpeta, 'foto.jpg'), 'no es una foto de verdad')
  const salida = join(carpeta, 'salida')
  const { creados, sinTocar } = await prepararTanda([join(carpeta, 'foto.jpg')], salida, false)
  expect(creados).toEqual([])
  expect(sinTocar).toEqual([join(carpeta, 'foto.jpg')])
  expect(await readdir(salida)).toEqual([])
})

test('no sobrescribe lo que ya hay en la carpeta de salida', async () => {
  const original = join(carpeta, 'tanda.pdf')
  await writeFile(original, await pdfFicticio(['Hoja ficticia']))
  const salida = join(carpeta, 'salida')
  await prepararTanda([original], salida, false)
  await expect(prepararTanda([original], salida, false)).rejects.toThrow('ya existe y no se sobrescribe')
})

test('la carpeta de la tanda se llama «Escaneos AAAA-MM»', () => {
  expect(carpetaDeTanda(new Date(2026, 10, 14))).toBe('Escaneos 2026-11')
  expect(carpetaDeTanda(new Date(2027, 0, 3))).toBe('Escaneos 2027-01')
})
