// Programas de fuera que hacen el trabajo pesado: ocrmypdf para el OCR y LibreOffice para pasar a PDF.
// Todo se ejecuta en este ordenador. No se envía nada a ningún servicio.

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { promisify } from 'node:util'

const ejecutar = promisify(execFile)

/** Idiomas del OCR: español y euskera. */
export const IDIOMAS_OCR = 'spa+eus'

// En Windows, LibreOffice no suele quedar en el PATH. Estos son sus sitios habituales.
const SITIOS_LIBREOFFICE = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
]

async function responde(programa: string): Promise<boolean> {
  try {
    await ejecutar(programa, ['--version'])
    return true
  } catch {
    return false
  }
}

/** Dice si ocrmypdf está instalado. */
export const hayOcr = () => responde('ocrmypdf')

/** Devuelve cómo llamar a LibreOffice, o null si no está instalado. La variable SOFFICE manda si existe. */
export async function libreOffice(): Promise<string | null> {
  if (process.env.SOFFICE) return process.env.SOFFICE
  if (await responde('soffice')) return 'soffice'
  return SITIOS_LIBREOFFICE.find(sitio => existsSync(sitio)) ?? null
}

/** Mensaje legible cuando un programa de fuera falla. */
function fallo(que: string, error: unknown): Error {
  const detalle = (error as { stderr?: string }).stderr?.trim() || (error instanceof Error ? error.message : String(error))
  return new Error(`${que}: ${detalle}`)
}

/**
 * Pasa el OCR a un PDF y escribe el resultado en `salida`, con el texto buscable.
 * Las páginas que ya tienen texto se dejan como están.
 */
export async function ocr(entrada: string, salida: string): Promise<void> {
  try {
    await ejecutar('ocrmypdf', ['--language', IDIOMAS_OCR, '--skip-text', '--quiet', entrada, salida])
  } catch (error) {
    throw fallo(`El OCR ha fallado con ${basename(entrada)}`, error)
  }
}

/** Convierte un .docx o un .odt a PDF con LibreOffice, sin abrir ventanas. El original solo se lee. */
export async function aPdf(programa: string, original: string, salida: string): Promise<void> {
  // LibreOffice elige el nombre del PDF, así que se convierte en una carpeta temporal y luego se mueve.
  const temporal = await mkdtemp(join(tmpdir(), 'a-pdf-'))
  try {
    await ejecutar(programa, ['--headless', '--convert-to', 'pdf', '--outdir', temporal, original])
    const creado = join(temporal, `${basename(original, extname(original))}.pdf`)
    if (!existsSync(creado)) throw new Error('LibreOffice no ha creado el PDF')
    await rename(creado, salida)
  } catch (error) {
    throw fallo(`No se pudo pasar a PDF ${basename(original)}`, error)
  } finally {
    await rm(temporal, { recursive: true, force: true })
  }
}
