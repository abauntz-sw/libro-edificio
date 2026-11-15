// escanear: lista carpetas y archivos en una hoja de cálculo para clasificarlos a mano.
// Uso: npm run escanear -- --salida listado.csv <ruta1> <ruta2>
// No cambia ni mueve ningún archivo original.

import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { escribirCsv, leerCsv } from './csv.ts'
import { COLUMNAS, combinar, escanear } from './listado.ts'

const USO = 'Uso: npm run escanear -- --salida listado.csv <carpeta o archivo> [más carpetas o archivos]'

async function principal(): Promise<void> {
  const { values, positionals: rutas } = parseArgs({
    options: { salida: { type: 'string' } },
    allowPositionals: true,
  })
  const salida = values.salida
  if (!salida || rutas.length === 0) throw new Error(USO)

  for (const ruta of rutas) {
    if (!existsSync(ruta)) throw new Error(`No existe la ruta: ${ruta}`)
  }

  // Si el listado ya existe, se conserva lo que haya rellenado la persona.
  let anteriores: Record<string, string>[] = []
  let columnas = COLUMNAS
  if (existsSync(salida)) {
    const leido = leerCsv(await readFile(salida, 'utf8'))
    const faltan = COLUMNAS.filter(col => !leido.columnas.includes(col))
    if (faltan.length > 0) {
      throw new Error(`${salida} ya existe y no parece un listado: le faltan las columnas ${faltan.join(', ')}`)
    }
    anteriores = leido.filas
    columnas = leido.columnas   // respeta columnas añadidas a mano
  }

  const escaneadas = await escanear(rutas, [salida])
  const { filas, nuevas, desaparecidas } = combinar(anteriores, escaneadas)
  await writeFile(salida, escribirCsv(columnas, filas), 'utf8')

  const duplicados = filas.filter(f => f.duplicado_de !== '').length
  const conAviso = filas.filter(f => f.aviso !== '').length
  console.log(`${salida}: ${filas.length} archivos (${nuevas} nuevos, ${duplicados} duplicados, ${conAviso} con aviso)`)
  for (const ruta of desaparecidas) {
    console.log(`Aviso: sigue en el listado pero ya no está en las carpetas: ${ruta}`)
  }
}

principal().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
