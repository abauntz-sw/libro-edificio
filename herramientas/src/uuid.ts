// Identificadores UUID versión 5: el mismo espacio y el mismo nombre dan siempre el mismo identificador.

import { createHash } from 'node:crypto'

const FORMATO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Calcula el UUID v5 de un nombre dentro de un espacio, que es otro UUID. */
export function uuidV5(espacio: string, nombre: string): string {
  if (!FORMATO.test(espacio)) throw new Error(`No es un UUID: ${espacio}`)
  const bytes = createHash('sha1')
    .update(Buffer.from(espacio.replaceAll('-', ''), 'hex'))
    .update(nombre, 'utf8')
    .digest()
  bytes[6] = (bytes[6] & 0x0f) | 0x50   // versión 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80   // variante estándar
  const hex = bytes.subarray(0, 16).toString('hex')
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
}

/**
 * Identificador de un documento, a partir de su edificio y de la huella de su archivo.
 * Como no depende del momento, repetir una carga da los mismos identificadores y no duplica nada.
 */
export const idDocumento = (edificioId: string, sha256: string) => uuidV5(edificioId, sha256)
