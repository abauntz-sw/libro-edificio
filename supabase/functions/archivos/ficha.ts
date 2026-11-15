// Comprueba lo que llega con una subida antes de escribir nada.
// No toca la red ni la base de datos: recibe los datos y dice si valen.

/** Tamaño máximo de un archivo subido desde la web. GitHub admite 100 MB, pero la función tiene poca memoria. */
export const LIMITE_BYTES = 25 * 1024 * 1024

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Un error que se le puede contar a la persona, con su código HTTP. */
export class ErrorHttp extends Error {
  constructor(readonly estado: number, mensaje: string) {
    super(mensaje)
  }
}

/** Los datos de un documento, ya comprobados. */
export interface Ficha {
  id: string
  tipo: string
  titulo: string
  fecha: string
  emisor: string
  caduca: string | null
  instalaciones: string[]
  nombreOriginal: string
}

export const esUuid = (texto: string) => UUID.test(texto)

/** Dice si un texto es una fecha real escrita como 2026-03-10. */
export function esFecha(texto: string): boolean {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto)
  if (!partes) return false
  const [ano, mes, dia] = partes.slice(1).map(Number)
  const fecha = new Date(Date.UTC(ano, mes - 1, dia))
  // Date acepta el 31 de febrero y lo convierte en marzo. Si cambia, la fecha no existe.
  return fecha.getUTCFullYear() === ano && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia
}

/** Ruta de un documento dentro del repositorio del edificio. La misma que usa la herramienta de carga local. */
export const rutaDocumento = (id: string, fecha: string) => `documentos/${fecha.slice(0, 4)}/${id}.pdf`

/** Un PDF empieza siempre por «%PDF-». Así no se cuela otro archivo con el nombre cambiado. */
export function esPdf(bytes: Uint8Array): boolean {
  const firma = [0x25, 0x50, 0x44, 0x46, 0x2d]
  return firma.every((byte, i) => bytes[i] === byte)
}

/** Huella SHA-256 de un archivo, en hexadecimal. */
export async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const huella = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return [...huella].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Lee la ficha de un formulario y comprueba cada campo.
 * Si algo no vale, lanza un ErrorHttp 400 con todos los fallos juntos.
 */
export function leerFicha(formulario: FormData, nombreArchivo: string): Ficha {
  const texto = (campo: string) => {
    const valor = formulario.get(campo)
    return typeof valor === 'string' ? valor.trim() : ''
  }
  const fallos: string[] = []

  const id = texto('id').toLowerCase()
  if (!esUuid(id)) fallos.push('falta el identificador del documento')

  const tipo = texto('tipo')
  if (tipo === '') fallos.push('falta el tipo')

  const titulo = texto('titulo')
  if (titulo === '') fallos.push('falta el título')
  else if (titulo.length > 200) fallos.push('el título pasa de 200 letras')

  const fecha = texto('fecha')
  if (fecha === '') fallos.push('falta la fecha')
  else if (!esFecha(fecha)) fallos.push(`la fecha «${fecha}» no vale. Escríbela como 2026-03-10`)

  const caduca = texto('caduca') || null
  if (caduca !== null && !esFecha(caduca)) fallos.push(`la fecha de caducidad «${caduca}» no vale. Escríbela como 2027-03-10`)
  else if (caduca !== null && esFecha(fecha) && caduca < fecha) fallos.push('caduca antes de su propia fecha')

  const emisor = texto('emisor')
  if (emisor.length > 200) fallos.push('el emisor pasa de 200 letras')

  const instalaciones = [...new Set(
    formulario.getAll('instalaciones').filter(valor => typeof valor === 'string').map(valor => valor.trim().toLowerCase()),
  )].filter(valor => valor !== '')
  if (!instalaciones.every(esUuid)) fallos.push('hay una instalación que no vale')

  // Solo el nombre, sin carpetas, por si el navegador manda la ruta entera.
  const nombreOriginal = (nombreArchivo.split(/[\\/]/).pop() ?? '').trim().slice(0, 255) || 'documento.pdf'

  if (fallos.length > 0) throw new ErrorHttp(400, `Revisa la ficha: ${fallos.join('; ')}.`)
  return { id, tipo, titulo, fecha, emisor, caduca, instalaciones, nombreOriginal }
}
