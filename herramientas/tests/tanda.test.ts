import { createCanvas } from '@napi-rs/canvas'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { huella } from '../src/archivos.ts'
import { hayOcr, libreOffice } from '../src/externos.ts'
import { carpetaDeSalida, carpetaDeTanda, nombresDeSalida, prepararTanda, REPOSITORIO_APP } from '../src/tanda.ts'
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

test('un PDF con texto y sin hojas separadoras ya está listo y no se toca', async () => {
  const original = join(carpeta, 'contrato.pdf')
  await writeFile(original, await pdfFicticio(['Contrato ficticio, hoja 1', 'Contrato ficticio, hoja 2']))
  const salida = join(carpeta, 'salida')

  const { creados, sinTocar } = await prepararTanda([original], salida, false)

  expect(creados).toEqual([])
  expect(sinTocar).toEqual([original])
  expect(await readdir(salida)).toEqual([])
})

test('un escaneo de un solo documento, sin hojas separadoras, sí se prepara', async () => {
  const original = join(carpeta, 'acta.pdf')
  await writeFile(original, await comoEscaneo(await pdfFicticio(['Acta ficticia'])))
  const salida = join(carpeta, 'salida')

  const { creados, sinTocar } = await prepararTanda([original], salida, false)

  expect(sinTocar).toEqual([])
  expect(await readdir(salida)).toEqual(['acta.pdf'])
  expect(creados).toHaveLength(1)
})

test('un PDF con hojas separadoras se parte aunque ya tenga texto', async () => {
  const original = join(carpeta, 'lote.pdf')
  await writeFile(original, await pdfFicticio(['Documento ficticio uno', '---', 'Documento ficticio dos']))

  const { creados } = await prepararTanda([original], join(carpeta, 'salida'), false)

  expect(creados.map(c => c.split(/[\\/]/).pop())).toEqual(['lote-01.pdf', 'lote-02.pdf'])
})

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
  await writeFile(original, await comoEscaneo(await pdfFicticio(['Hoja ficticia'])))
  const salida = join(carpeta, 'salida')
  await prepararTanda([original], salida, false)
  await expect(prepararTanda([original], salida, false)).rejects.toThrow('ya existe y no se sobrescribe')
})

test('dos escaneos con el mismo nombre en carpetas distintas no chocan', async () => {
  // Los escáneres repiten nombres como «scan0001.pdf» en cada tanda.
  for (const caja of ['Caja 1', 'Caja 2']) {
    await mkdir(join(carpeta, 'entrada', caja), { recursive: true })
    await writeFile(join(carpeta, 'entrada', caja, 'scan0001.pdf'), await comoEscaneo(await pdfFicticio([`Documento ficticio de la ${caja}`])))
  }
  const salida = join(carpeta, 'salida')

  const { creados } = await prepararTanda([join(carpeta, 'entrada')], salida, false)

  expect((await readdir(salida)).sort()).toEqual(['Caja 1 - scan0001.pdf', 'Caja 2 - scan0001.pdf'])
  expect(creados).toHaveLength(2)
})

test('si la carpeta de salida ya tiene uno de los nombres, se para antes de crear nada', async () => {
  for (const letra of ['a', 'b']) {
    await writeFile(join(carpeta, `${letra}.pdf`), await comoEscaneo(await pdfFicticio([`Hoja ficticia ${letra}`])))
  }
  const salida = join(carpeta, 'salida')
  await mkdir(salida)
  await writeFile(join(salida, 'b.pdf'), 'de una tanda anterior')

  await expect(prepararTanda([join(carpeta, 'a.pdf'), join(carpeta, 'b.pdf')], salida, false)).rejects.toThrow('No se ha creado nada')
  // Antes se creaba a.pdf y se paraba en b.pdf: la carpeta quedaba a medias.
  expect(await readdir(salida)).toEqual(['b.pdf'])
})

test('nombresDeSalida no repite nombres, tampoco cambiando mayúsculas', () => {
  const nombre = (archivo: string) => basename(archivo, '.pdf')
  const nombres = nombresDeSalida([join('A', 'Caja', 'scan.pdf'), join('B', 'Caja', 'SCAN.pdf'), join('C', 'otro.pdf')], nombre)
  expect([...nombres.values()]).toEqual(['Caja - scan', 'Caja - SCAN (2)', 'otro'])
})

test('la carpeta de la tanda se llama «Escaneos AAAA-MM»', () => {
  expect(carpetaDeTanda(new Date(2026, 10, 14))).toBe('Escaneos 2026-11')
  expect(carpetaDeTanda(new Date(2027, 0, 3))).toBe('Escaneos 2027-01')
})

test('sin --salida, la tanda va junto a la primera entrada', () => {
  const repositorio = join(carpeta, 'libro-edificio')
  const noviembre = new Date(2026, 10, 14)
  expect(carpetaDeSalida([join(carpeta, 'papel', 'Caja 1'), join(carpeta, 'otra')], undefined, repositorio, noviembre))
    .toBe(join(carpeta, 'papel', 'Escaneos 2026-11'))
  expect(carpetaDeSalida([join(carpeta, 'papel', 'tanda.pdf')], undefined, repositorio, noviembre))
    .toBe(join(carpeta, 'papel', 'Escaneos 2026-11'))
})

test('la salida nunca queda dentro del repositorio de la aplicación', () => {
  const repositorio = join(carpeta, 'libro-edificio')
  const fuera = join(carpeta, 'papel', 'tanda.pdf')
  // Con --salida, como «--salida Escaneos» ejecutado desde herramientas/.
  expect(() => carpetaDeSalida([fuera], join(repositorio, 'herramientas', 'Escaneos'), repositorio)).toThrow('No se ha creado nada')
  expect(() => carpetaDeSalida([fuera], repositorio, repositorio)).toThrow('No se ha creado nada')
  // Sin --salida, si la entrada está dentro del repositorio, como los datos de ejemplo.
  expect(() => carpetaDeSalida([join(repositorio, 'edificio-ejemplo-entrada', 'entrada')], undefined, repositorio)).toThrow('Sin --salida')
  // Una carpeta de al lado cuyo nombre empieza igual no está dentro.
  expect(carpetaDeSalida([fuera], join(carpeta, 'libro-edificio-escaneos'), repositorio)).toBe(join(carpeta, 'libro-edificio-escaneos'))
})

test('el repositorio de la aplicación es la carpeta que tiene herramientas/', () => {
  expect(existsSync(join(REPOSITORIO_APP, 'herramientas', 'package.json'))).toBe(true)
  expect(existsSync(join(REPOSITORIO_APP, 'supabase', 'migrations'))).toBe(true)
})
