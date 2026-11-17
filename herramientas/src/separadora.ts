// La hoja separadora: una página con un código QR que se pone entre documento y documento
// antes de escanear un montón de papel seguido.

import { PDFDocument, StandardFonts } from 'pdf-lib'
import QRCode from 'qrcode'

/** Texto que lleva el QR. Es fijo: todas las hojas separadoras son iguales. */
export const CODIGO_SEPARADORA = 'LIBRO-DEL-EDIFICIO:HOJA-SEPARADORA'

const A4: [number, number] = [595.28, 841.89]   // en puntos

/** Crea el PDF imprimible de la hoja separadora, en A4. */
export async function crearSeparadora(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle('Hoja separadora del Libro del Edificio')
  const pagina = pdf.addPage(A4)
  const [ancho, alto] = A4
  const normal = await pdf.embedFont(StandardFonts.Helvetica)
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold)

  const centrado = (texto: string, y: number, tamano: number, fuente = normal) =>
    pagina.drawText(texto, { x: (ancho - fuente.widthOfTextAtSize(texto, tamano)) / 2, y, size: tamano, font: fuente })

  centrado('HOJA SEPARADORA', alto - 110, 34, negrita)
  centrado('Libro del Edificio', alto - 145, 16)

  // QR grande y con mucha corrección de errores, para que se lea aunque el escaneo salga torcido o sucio.
  const lado = 320
  const qr = await pdf.embedPng(await QRCode.toBuffer(CODIGO_SEPARADORA, { errorCorrectionLevel: 'H', margin: 4, width: 1200 }))
  pagina.drawImage(qr, { x: (ancho - lado) / 2, y: (alto - lado) / 2, width: lado, height: lado })

  const lineas = [
    'Pon una hoja como esta entre un documento y el siguiente.',
    'Después escanea todo el montón seguido.',
    'El programa parte el escaneo por estas hojas y las descarta.',
    'Se puede reutilizar. No la grapes ni escribas sobre el código.',
  ]
  lineas.forEach((linea, i) => centrado(linea, 190 - i * 24, 14))
  return pdf.save()
}
