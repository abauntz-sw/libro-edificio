import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { huella } from '../src/archivos.ts'
import { combinar, escanear } from '../src/listado.ts'
import { apuntarPreparados, buscarPreparados, marcarPreparados } from '../src/preparados.ts'

let carpeta: string
beforeEach(async () => { carpeta = await mkdtemp(join(tmpdir(), 'preparados-')) })
afterEach(async () => { await rm(carpeta, { recursive: true, force: true }) })

/** El papel de una caja y, al lado, la tanda que hizo `preparar` con él. */
async function cajaPreparada() {
  const caja = join(carpeta, 'Papel', 'Caja 1')
  const tanda = join(carpeta, 'Papel', 'Escaneos 2026-11')
  await mkdir(caja, { recursive: true })
  await mkdir(tanda, { recursive: true })
  const escaneo = join(caja, 'tanda.pdf')
  const docx = join(caja, 'informe.docx')
  const suelto = join(caja, 'suelto.pdf')
  await writeFile(escaneo, 'escaneo con hojas separadoras')
  await writeFile(docx, 'texto editable')
  await writeFile(suelto, 'no ha pasado por preparar')
  await writeFile(join(tanda, 'tanda-01.pdf'), 'primer documento')
  await apuntarPreparados(tanda, [
    { original: escaneo, sha256: await huella(escaneo), pdf: 'tanda-01.pdf' },
    { original: docx, sha256: await huella(docx), pdf: 'informe-docx.pdf' },
  ])
  return { caja, tanda, escaneo, docx, suelto }
}

test('escaneando solo la caja, encuentra la lista en la tanda de al lado y avisa de los originales', async () => {
  const { caja, tanda, escaneo, docx, suelto } = await cajaPreparada()
  const { filas } = combinar([], await escanear([caja]))
  expect(marcarPreparados(filas, await buscarPreparados([caja]))).toBe(2)

  const aviso = (ruta: string) => filas.find(f => f.ruta_original === ruta)!.aviso
  expect(aviso(escaneo)).toBe(`ya preparado: usa los PDF de «Escaneos 2026-11» (${tanda})`)
  expect(aviso(docx)).toContain('no es PDF; ya preparado')
  expect(aviso(suelto)).toBe('')
})

test('escaneando la carpeta de arriba, la lista no sale como documento y los PDF preparados no llevan aviso', async () => {
  const { tanda } = await cajaPreparada()
  const papel = join(carpeta, 'Papel')
  const { filas } = combinar([], await escanear([papel]))
  marcarPreparados(filas, await buscarPreparados([papel]))
  expect(filas.some(f => f.nombre === '.preparados.csv')).toBe(false)
  expect(filas.find(f => f.ruta_original === join(tanda, 'tanda-01.pdf'))!.aviso).toBe('')
  expect(filas.filter(f => f.aviso.includes('ya preparado'))).toHaveLength(2)
})

test('reconoce el original aunque se haya movido, porque va por la huella', async () => {
  const { escaneo } = await cajaPreparada()
  const otra = join(carpeta, 'Papel', 'Caja 2')
  await mkdir(otra)
  const movido = join(otra, 'renombrado.pdf')
  await writeFile(movido, 'escaneo con hojas separadoras')
  await rm(escaneo)
  const { filas } = combinar([], await escanear([otra]))
  expect(marcarPreparados(filas, await buscarPreparados([otra]))).toBe(1)
})

test('al repetir escanear no repite el aviso', async () => {
  const { caja } = await cajaPreparada()
  const preparados = await buscarPreparados([caja])
  const { filas } = combinar([], await escanear([caja]))
  marcarPreparados(filas, preparados)
  const antes = filas.map(f => f.aviso)
  marcarPreparados(filas, preparados)
  expect(filas.map(f => f.aviso)).toEqual(antes)
})

test('sin lista de preparados, no avisa de nada', async () => {
  await writeFile(join(carpeta, 'a.pdf'), 'uno')
  expect(await buscarPreparados([carpeta])).toEqual(new Map())
})
