// importar: carga en el Libro los documentos marcados con «si» en el listado.
// Uso: npm run importar -- --listado listado.csv --repo <dirección-del-repositorio> [--simular]
// Primero comprueba toda la hoja. Si hay un solo error, no escribe nada.
// No deja copias en el equipo: sube los archivos desde una carpeta temporal que se borra al terminar.

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { comprobarListado, type ErrorFila } from './comprobar.ts'
import { leerCsv } from './csv.ts'
import { comprobarRepositorio } from './direccion.ts'
import { COLUMNAS } from './listado.ts'
import { comprobarArchivos, conCopiaTemporal, copiarDocumentos, guardarYSubir, ultimoCommit } from './repositorio.ts'
import { cargarCatalogo, conectar, iniciarSesion, registrar } from './supabase.ts'

const USO = 'Uso: npm run importar -- --listado listado.csv --repo <dirección-del-repositorio> [--simular]'

/** Lee un dato de la configuración (archivo .env) y avisa si falta. */
function configuracion(nombre: string): string {
  const valor = process.env[nombre]
  if (!valor) throw new Error(`Falta ${nombre} en el archivo .env. Mira .env.ejemplo`)
  return valor
}

async function pedirCodigo(): Promise<string> {
  const consola = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return await consola.question('Código que te ha llegado por correo: ')
  } finally {
    consola.close()
  }
}

async function principal(): Promise<void> {
  const { values } = parseArgs({
    options: {
      listado: { type: 'string' },
      repo: { type: 'string' },
      simular: { type: 'boolean', default: false },
    },
  })
  const { listado, repo, simular } = values
  if (!listado || (!repo && !simular)) throw new Error(USO)
  if (!existsSync(listado)) throw new Error(`No existe el listado: ${listado}`)
  // `escanear` guarda rutas completas. Una relativa, como en el listado de ejemplo, cuenta desde la carpeta del listado.
  const origen = resolve(dirname(listado))

  const { columnas, filas } = leerCsv(await readFile(listado, 'utf8'))
  const faltan = COLUMNAS.filter(col => !columnas.includes(col))
  if (faltan.length > 0) throw new Error(`${listado} no parece un listado: le faltan las columnas ${faltan.join(', ')}`)

  const cliente = conectar(configuracion('SUPABASE_URL'), configuracion('SUPABASE_CLAVE_PUBLICA'))
  await iniciarSesion(cliente, configuracion('LIBRO_CORREO'), pedirCodigo, process.env.LIBRO_CONTRASENA)
  const catalogo = await cargarCatalogo(cliente)
  // Lo primero: que se va a subir al repositorio del edificio. Si no, se para antes de mirar nada más.
  if (repo) comprobarRepositorio(repo, catalogo.repositorio)

  // 1. Comprobar toda la hoja, sin escribir nada.
  const { documentos, yaCargadas, noIncluidas, errores } = comprobarListado(filas, catalogo)
  const archivos = await comprobarArchivos(documentos, origen)
  const todos: ErrorFila[] = [...errores, ...archivos.errores].sort((a, b) => a.fila - b.fila)

  if (todos.length > 0) {
    for (const e of todos) console.error(`Fila ${e.fila}: ${e.mensaje}`)
    throw new Error(`Hay ${todos.length} errores. No se ha escrito nada.`)
  }

  console.log(`Listado correcto: ${documentos.length} para cargar, ${yaCargadas.length} ya estaban en el Libro, ${noIncluidas} sin incluir.`)
  if (simular || !repo) {
    console.log('Simulación: no se ha escrito nada.')
    return
  }
  if (documentos.length === 0) {
    console.log('No hay nada nuevo que cargar.')
    return
  }

  // 2. Subir los archivos en un único commit, desde una copia temporal del repositorio que se borra al acabar.
  const commit = await conCopiaTemporal(repo, documentos.map(doc => doc.ruta), async copia => {
    const copiados = await copiarDocumentos(copia, origen, documentos)
    const conCommit = await guardarYSubir(copia, `Carga de ${documentos.length} documentos`)
    console.log(`Repositorio: ${copiados} archivos nuevos, ${conCommit ? 'un commit nuevo' : 'sin commit nuevo'}, subido.`)
    return ultimoCommit(copia)
  })

  // 3. Crear las fichas. Va lo último: puede quedar un archivo sin ficha, pero nunca una ficha sin archivo.
  const fallos: ErrorFila[] = []
  for (const doc of documentos) {
    try {
      await registrar(cliente, doc, archivos.bytes.get(doc.fila) ?? null, commit)
    } catch (error) {
      fallos.push({ fila: doc.fila, mensaje: error instanceof Error ? error.message : String(error) })
    }
  }

  console.log(`Resumen: ${documentos.length - fallos.length} cargados, ${yaCargadas.length + noIncluidas} saltados, ${fallos.length} con error.`)
  for (const e of fallos) console.error(`Fila ${e.fila}: ${e.mensaje}`)
  if (fallos.length > 0) throw new Error('Corrige los errores y repite la orden: lo ya cargado no se duplica.')
}

principal().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
