// preparar: deja el papel escaneado y los textos editables listos para `escanear`.
// Uso: npm run preparar -- [--salida <carpeta>] [--sin-ocr] <carpeta o archivo> [más carpetas o archivos]
//      npm run preparar -- --separadora hoja-separadora.pdf
// No cambia ni mueve ningún archivo original, y no envía nada fuera de este ordenador.

import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { crearSeparadora } from './separadora.ts'
import { carpetaDeSalida, prepararTanda } from './tanda.ts'

const USO = [
  'Uso: npm run preparar -- [--salida <carpeta>] [--sin-ocr] <carpeta o archivo> [más carpetas o archivos]',
  '     npm run preparar -- --separadora hoja-separadora.pdf',
].join('\n')

async function principal(): Promise<void> {
  const { values, positionals: rutas } = parseArgs({
    options: {
      salida: { type: 'string' },
      separadora: { type: 'string' },
      'sin-ocr': { type: 'boolean', default: false },
    },
    allowPositionals: true,
  })

  if (values.separadora) {
    if (existsSync(values.separadora)) throw new Error(`${values.separadora} ya existe y no se sobrescribe`)
    await writeFile(values.separadora, await crearSeparadora())
    console.log(`${values.separadora}: imprime unas cuantas copias y pon una entre documento y documento.`)
    return
  }

  if (rutas.length === 0) throw new Error(USO)
  for (const ruta of rutas) {
    if (!existsSync(ruta)) throw new Error(`No existe la ruta: ${ruta}`)
  }

  const salida = carpetaDeSalida(rutas, values.salida)
  const { creados, sinTocar } = await prepararTanda(rutas, salida, !values['sin-ocr'])
  console.log(`${salida}: ${creados.length} PDF creados${values['sin-ocr'] ? ', sin OCR' : ''}.`)
  if (sinTocar.length > 0) console.log(`${sinTocar.length} archivos no necesitan preparación y siguen en su sitio.`)
  console.log(`Siguiente paso: npm run escanear -- --salida listado.csv "${salida}"`)
}

principal().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
