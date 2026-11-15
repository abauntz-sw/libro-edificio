// Prepara una tanda: deja en una carpeta nueva un PDF por documento, listo para `escanear`.
// Los originales solo se leen.

import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listarArchivos } from './archivos.ts'
import { aPdf, hayOcr, libreOffice, ocr } from './externos.ts'
import { analizar, partir, yaEstaListo } from './partir.ts'

/** Formatos de texto editable que se pasan a PDF. */
export const EDITABLES = ['docx', 'odt']

export interface Resumen {
  /** Archivos creados en la carpeta de salida. */
  creados: string[]
  /** Archivos que no necesitan preparación y se han dejado donde estaban. */
  sinTocar: string[]
}

/** Nombre de la carpeta de una tanda: «Escaneos AAAA-MM». */
export const carpetaDeTanda = (fecha = new Date()) =>
  `Escaneos ${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`

/** Carpeta del repositorio de la aplicación: la que tiene dentro `herramientas/`. */
export const REPOSITORIO_APP = fileURLToPath(new URL('../..', import.meta.url))

/** Si `ruta` es `carpeta` o está dentro de ella. */
export function estaDentro(ruta: string, carpeta: string): boolean {
  const camino = relative(resolve(carpeta), resolve(ruta))
  return camino === '' || (camino !== '..' && !camino.startsWith(`..${sep}`) && !isAbsolute(camino))
}

/**
 * Carpeta donde se guarda la tanda. Si no se dice, «Escaneos AAAA-MM» junto a la primera ruta de entrada.
 * Nunca dentro del repositorio de la aplicación: es público, y un `git add .` subiría documentos reales.
 */
export function carpetaDeSalida(rutas: string[], salida?: string, repositorio = REPOSITORIO_APP, fecha = new Date()): string {
  const elegida = resolve(salida ?? join(dirname(resolve(rutas[0])), carpetaDeTanda(fecha)))
  if (estaDentro(elegida, repositorio)) {
    throw new Error(
      `No se guarda nada dentro del repositorio de la aplicación (${resolve(repositorio)}), porque es público: ` +
      'un «git add .» subiría los documentos. ' +
      (salida ? `La carpeta de salida, ${elegida}, está dentro. ` : `Sin --salida, la tanda iría a ${elegida}, junto a la primera entrada. `) +
      'Elige una carpeta de fuera con --salida. No se ha creado nada.',
    )
  }
  return elegida
}

/**
 * Da a cada archivo un nombre de salida, sin extensión, que no se repite.
 * Los escáneres llaman a sus archivos «scan0001.pdf», «scan0002.pdf»…, así que dos carpetas pueden traer el mismo nombre.
 * Entonces se le pone delante el nombre de su carpeta: «Caja 1 - scan0001». Si aun así se repite, un número: «(2)».
 * Se compara sin distinguir mayúsculas, como hace Windows con los nombres de archivo.
 */
export function nombresDeSalida(archivos: string[], nombre: (archivo: string) => string): Map<string, string> {
  const veces = new Map<string, number>()
  for (const archivo of archivos) {
    const clave = nombre(archivo).toLowerCase()
    veces.set(clave, (veces.get(clave) ?? 0) + 1)
  }
  const usados = new Set<string>()
  const nombres = new Map<string, string>()
  for (const archivo of archivos) {
    const propio = nombre(archivo)
    const base = veces.get(propio.toLowerCase())! > 1 ? `${basename(dirname(archivo))} - ${propio}` : propio
    let elegido = base
    for (let n = 2; usados.has(elegido.toLowerCase()); n++) elegido = `${base} (${n})`
    usados.add(elegido.toLowerCase())
    nombres.set(archivo, elegido)
  }
  return nombres
}

/**
 * Prepara los archivos de `rutas`, que pueden ser carpetas o archivos sueltos:
 * - cada PDF escaneado se parte por sus hojas separadoras y se le pasa el OCR;
 * - un PDF sin hojas separadoras y con texto en todas sus páginas ya está listo y no se toca;
 * - cada .docx u .odt se pasa a PDF;
 * - el resto no se toca: entra tal cual en `escanear`.
 * Con `conOcr` en false solo parte, sin OCR.
 */
export async function prepararTanda(rutas: string[], salida: string, conOcr = true): Promise<Resumen> {
  const archivos: string[] = []
  for (const ruta of rutas) archivos.push(...await listarArchivos(resolve(ruta)))
  const extension = (archivo: string) => extname(archivo).slice(1).toLowerCase()
  const escaneos = archivos.filter(a => extension(a) === 'pdf')
  const editables = archivos.filter(a => EDITABLES.includes(extension(a)))

  // Antes de empezar se comprueba que están los programas necesarios, para no dejar la tanda a medias.
  if (conOcr && escaneos.length > 0 && !await hayOcr()) {
    throw new Error('No encuentro ocrmypdf. Instálalo como explica el README, o añade --sin-ocr para partir sin OCR.')
  }
  const programa = editables.length > 0 ? await libreOffice() : null
  if (editables.length > 0 && programa === null) {
    throw new Error('No encuentro LibreOffice. Instálalo como explica el README.')
  }

  // Cada escaneo da «nombre.pdf», o «nombre-01.pdf», «nombre-02.pdf»… si trae varios documentos.
  // Un editable conserva su extensión en el nombre, para que «a.docx» y «a.odt» no choquen: «a-docx.pdf».
  const nombres = nombresDeSalida([...escaneos, ...editables], archivo =>
    escaneos.includes(archivo) ? basename(archivo, extname(archivo)) : `${basename(archivo, extname(archivo))}-${extension(archivo)}`)

  // También antes de empezar: si la carpeta de salida ya tiene uno de esos nombres, se para sin crear nada.
  const yaHay = existsSync(salida) ? (await readdir(salida)).map(n => n.toLowerCase()) : []
  for (const [archivo, nombre] of nombres) {
    const propio = nombre.toLowerCase()
    const choca = yaHay.find(n => n === `${propio}.pdf` || (n.startsWith(`${propio}-`) && /^-\d{2}\.pdf$/.test(n.slice(propio.length))))
    if (choca) throw new Error(`${join(salida, choca)} ya existe y no se sobrescribe. Usa otra carpeta de salida. (Viene de ${archivo}.) No se ha creado nada.`)
  }

  await mkdir(salida, { recursive: true })
  const resumen: Resumen = { creados: [], sinTocar: archivos.filter(a => !escaneos.includes(a) && !editables.includes(a)) }

  // Nunca se escribe encima de un archivo que ya está en la carpeta de salida. Ya se ha comprobado arriba;
  // esto es por si dos nombres coinciden al añadir los números de las partes.
  const destino = (nombre: string): string => {
    const completo = join(salida, nombre)
    if (existsSync(completo)) throw new Error(`${completo} ya existe y no se sobrescribe. Usa otra carpeta de salida.`)
    resumen.creados.push(completo)
    return completo
  }

  const temporal = await mkdtemp(join(tmpdir(), 'tanda-'))
  try {
    for (const escaneo of escaneos) {
      const contenido = await readFile(escaneo)
      const analisis = await analizar(contenido)
      // Copiarlo cambiaría su huella y `escanear` no lo reconocería como repetido.
      if (yaEstaListo(analisis)) { resumen.sinTocar.push(escaneo); continue }
      const nombre = nombres.get(escaneo)!
      const partes = await partir(contenido, analisis.separadoras)
      for (const [i, parte] of partes.entries()) {
        // Un escaneo con varios documentos da «nombre-01.pdf», «nombre-02.pdf»…
        const sufijo = partes.length > 1 ? `-${String(i + 1).padStart(2, '0')}` : ''
        const final = destino(`${nombre}${sufijo}.pdf`)
        if (!conOcr) { await writeFile(final, parte); continue }
        const sinOcr = join(temporal, `${resumen.creados.length}.pdf`)
        await writeFile(sinOcr, parte)
        await ocr(sinOcr, final)
      }
    }
    // LibreOffice usa una carpeta de configuración propia, la misma para toda la tanda. Ver aPdf.
    const perfil = join(temporal, 'libreoffice')
    for (const editable of editables) {
      await aPdf(programa!, editable, destino(`${nombres.get(editable)!}.pdf`), perfil)
    }
  } finally {
    await rm(temporal, { recursive: true, force: true })
  }
  return resumen
}
