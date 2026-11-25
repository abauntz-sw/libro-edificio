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

// Cómo se llaman los archivos: lo mismo que usa la herramienta de carga local.
export { rutaDocumento, rutaFoto } from '../_compartido/nombres.ts'

/** Lo que va delante del identificador en un nombre: `<fecha>_<tipo>_<descripción>_` o `<fecha>_<instalación>_`. */
const FECHA = '[0-9]{4}-[0-9]{2}-[0-9]{2}'
const PARTE = '[a-z0-9-]+'

/**
 * Dice si una ruta es la de ese documento. Valen dos formas, y la base de datos tiene la misma regla:
 *   documentos/AAAA/<fecha>_<tipo>_<descripción>_<id>.<extensión>   la de ahora (#77); la descripción puede faltar
 *   documentos/AAAA/<id>.<extensión>                                 la de antes, que no se renombra
 * La extensión puede ser otra que pdf, porque la herramienta de carga local también guarda otros formatos.
 * Así una ficha no puede apuntar a otro archivo del repositorio, como el índice o una foto.
 */
export function esRutaDeDocumento(ruta: string, id: string): boolean {
  // id ya viene comprobado como UUID: solo lleva cifras, letras de la a a la f y guiones.
  return esUuid(id) &&
    new RegExp(`^documentos/[0-9]{4}/(${FECHA}_${PARTE}_(${PARTE}_)?)?${id}\\.[a-z0-9]+$`).test(ruta)
}

/** Un PDF empieza siempre por «%PDF-». Así no se cuela otro archivo con el nombre cambiado. */
export function esPdf(bytes: Uint8Array): boolean {
  const firma = [0x25, 0x50, 0x44, 0x46, 0x2d]
  return firma.every((byte, i) => bytes[i] === byte)
}

/** Tamaño máximo de una foto. El móvil las comprime antes de enviarlas: así una foto normal pesa menos de 1 MB. */
export const LIMITE_FOTO_BYTES = 5 * 1024 * 1024

/** Un JPEG empieza siempre por FF D8 FF. El móvil manda las fotos en JPEG después de comprimirlas. */
export function esJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

/**
 * Dice si una ruta es la de esa foto. Valen fotos/AAAA/<fecha>_<instalación>_<id>.jpg, sin instalación
 * si la foto no tiene parte (#82), y la forma de antes, fotos/AAAA/<id>.jpg. La base de datos tiene la misma regla.
 */
export function esRutaDeFoto(ruta: string, id: string): boolean {
  return esUuid(id) && new RegExp(`^fotos/[0-9]{4}/(${FECHA}_(${PARTE}_)?)?${id}\\.jpg$`).test(ruta)
}

/** Los datos de una foto: su identificador, creado por el móvil, y el del parte al que va. */
export interface DatosFoto {
  id: string
  parte: string
}

/** Lee el identificador de la foto y el de su parte. Si alguno no vale, lanza un ErrorHttp 400. */
export function leerFoto(formulario: FormData): DatosFoto {
  const uuid = (campo: string) => {
    const valor = formulario.get(campo)
    return typeof valor === 'string' ? valor.trim().toLowerCase() : ''
  }
  const id = uuid('id')
  const parte = uuid('parte')
  const fallos: string[] = []
  if (!esUuid(id)) fallos.push('falta el identificador de la foto')
  if (!esUuid(parte)) fallos.push('falta el identificador del parte')
  if (fallos.length > 0) throw new ErrorHttp(400, `Revisa la foto: ${fallos.join('; ')}.`)
  return { id, parte }
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
