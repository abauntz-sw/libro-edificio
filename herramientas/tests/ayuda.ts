// Ayudas comunes a varias pruebas. Todo lo que crean es ficticio.

import { PDFDocument, StandardFonts } from 'pdf-lib'
import { crearSeparadora } from '../src/separadora.ts'

/** Crea un PDF ficticio. Cada texto es una página; «---» es una hoja separadora. */
export async function pdfFicticio(paginas: string[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const fuente = await pdf.embedFont(StandardFonts.Helvetica)
  const separadora = await PDFDocument.load(await crearSeparadora())
  for (const texto of paginas) {
    if (texto === '---') {
      pdf.addPage((await pdf.copyPages(separadora, [0]))[0])
    } else {
      pdf.addPage([595.28, 841.89]).drawText(texto, { x: 60, y: 760, size: 18, font: fuente })
    }
  }
  return pdf.save()
}
