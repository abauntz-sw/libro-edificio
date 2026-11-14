// importar: carga en el Libro los documentos marcados con «si» en el listado.
// Uso: npm run importar -- --listado listado.csv --repo <clon-del-edificio> [--origen <carpeta>] [--simular]
// Primero comprueba toda la hoja. Si hay un solo error, no escribe nada.

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { comprobarListado, type ErrorFila } from './comprobar.ts'
import { leerCsv } from './csv.ts'
import { COLUMNAS } from './listado.ts'
import { comprobarArchivos, comprobarClon, commitDe, copiarDocumentos, guardarYSubir, remoto } from './repositorio.ts'
import { cargarCatalogo, conectar, iniciarSesion, registrar } from './supabase.ts'

const USO = 'Uso: npm run importar -- --listado listado.csv --repo <clon-del-edificio> [--origen <carpeta>] [--simular]'

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
      origen: { type: 'string' },
      simular: { type: 'boolean', default: false },
    },
  })
  const { listado, repo, simular } = values
  if (!listado || (!repo && !simular)) throw new Error(USO)
  if (!existsSync(listado)) throw new Error(`No existe el listado: ${listado}`)
  // Las rutas del listado cuentan desde la carpeta que se escaneó. Si no se dice otra, la del propio listado.
  const origen = resolve(values.origen ?? dirname(listado))

  const { columnas, filas } = leerCsv(await readFile(listado, 'utf8'))
  const faltan = COLUMNAS.filter(col => !columnas.includes(col))
  if (faltan.length > 0) throw new Error(`${listado} no parece un listado: le faltan las columnas ${faltan.join(', ')}`)

  const cliente = conectar(configuracion('SUPABASE_URL'), configuracion('SUPABASE_CLAVE_PUBLICA'))
  await iniciarSesion(cliente, configuracion('LIBRO_CORREO'), pedirCodigo, process.env.LIBRO_CONTRASENA)
  const catalogo = await cargarCatalogo(cliente)

  // 1. Comprobar toda la hoja, sin escribir nada.
  const { documentos, yaCargadas, noIncluidas, errores } = comprobarListado(filas, catalogo)
  const archivos = await comprobarArchivos(documentos, origen)
  const todos: ErrorFila[] = [...errores, ...archivos.errores].sort((a, b) => a.fila - b.fila)
  const delClon = repo ? await comprobarClon(repo) : []

  if (todos.length > 0 || delClon.length > 0) {
    for (const e of todos) console.error(`Fila ${e.fila}: ${e.mensaje}`)
    for (const mensaje of delClon) console.error(mensaje)
    throw new Error(`Hay ${todos.length + delClon.length} errores. No se ha escrito nada.`)
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

  const direccion = await remoto(repo)
  if (!direccion.replace(/\.git$/, '').endsWith(catalogo.repositorio)) {
    console.log(`Aviso: el clon sube a ${direccion} y el edificio tiene apuntado el repositorio ${catalogo.repositorio}.`)
  }

  // 2. Copiar los archivos y subirlos en un único commit.
  const copiados = await copiarDocumentos(repo, origen, documentos)
  const conCommit = await guardarYSubir(repo, `Carga de ${documentos.length} documentos`)
  console.log(`Repositorio: ${copiados} archivos copiados, ${conCommit ? 'un commit nuevo' : 'sin commit nuevo'}, subido.`)

  // 3. Crear las fichas. Va lo último: puede quedar un archivo sin ficha, pero nunca una ficha sin archivo.
  const fallos: ErrorFila[] = []
  for (const doc of documentos) {
    try {
      await registrar(cliente, doc, archivos.bytes.get(doc.fila) ?? null, await commitDe(repo, doc.ruta) || null)
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
