// Subir documentos desde la web (tarea 1.2).
//
// La web no habla con GitHub. Manda cada PDF a la función «archivos», que comprueba el permiso,
// lo guarda en el repositorio del edificio y crea su ficha con registrar_documento.
//
// Aquí está lo que no depende de la pantalla: comprobar cada archivo, calcular su huella,
// buscar duplicados y mandarlo. Así se puede probar sin navegador.

import type { SupabaseClient } from '@supabase/supabase-js'

/** El mismo límite que la función «archivos». GitHub admite más, pero la función tiene poca memoria. */
export const LIMITE_BYTES = 25 * 1024 * 1024
const MEGAS = LIMITE_BYTES / 1024 / 1024

/** Un archivo elegido, con su ficha, mientras se prepara y se sube. */
export interface Fila {
  /** Se crea al elegir el archivo y no cambia. Si la subida se repite, la función no duplica nada. */
  id: string
  archivo: File
  titulo: string
  tipo: string
  fecha: string
  caduca: string
  instalaciones: string[]
  /** La huella SHA-256, cuando ya está calculada. */
  huella?: string
  /** Si el archivo no se puede subir: es demasiado grande o no es un PDF. */
  rechazo?: string
  /** Si ya está en el Libro, o en esta misma tanda. */
  duplicado?: string
  estado: 'lista' | 'subiendo' | 'hecha' | 'error'
  mensaje?: string
}

export interface Opcion {
  id: string
  nombre: string
}

/** Propone un título a partir del nombre del archivo: sin extensión y con espacios. */
export function tituloDesdeNombre(nombre: string): string {
  return nombre.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Un PDF empieza siempre por «%PDF-». Así no se cuela otro archivo con el nombre cambiado. */
export function esPdf(inicio: Uint8Array): boolean {
  return [0x25, 0x50, 0x44, 0x46, 0x2d].every((byte, i) => inicio[i] === byte)
}

/** Huella SHA-256 del contenido, en hexadecimal. Es la misma que calcula la función. */
export async function huellaSha256(contenido: ArrayBuffer): Promise<string> {
  const huella = new Uint8Array(await crypto.subtle.digest('SHA-256', contenido))
  return [...huella].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Dice por qué un archivo no se puede subir, o `undefined` si vale.
 * Mira el tamaño antes de leerlo, para no cargar en memoria un archivo enorme.
 */
export async function comprobarArchivo(archivo: File): Promise<string | undefined> {
  if (archivo.size === 0) return 'El archivo está vacío.'
  if (archivo.size > LIMITE_BYTES) {
    const pesa = (archivo.size / 1024 / 1024).toFixed(1).replace('.', ',')
    return `Pesa ${pesa} MB y el límite es ${MEGAS} MB. Redúcelo o cárgalo con la herramienta de carga local.`
  }
  const inicio = new Uint8Array(await archivo.slice(0, 5).arrayBuffer())
  if (!esPdf(inicio)) return 'No es un PDF. Desde la web solo se suben PDF.'
  return undefined
}

/** Prepara la fila de un archivo recién elegido: comprueba el archivo y calcula su huella. */
export async function prepararFila(archivo: File, id: string): Promise<Fila> {
  const fila: Fila = {
    id, archivo, titulo: tituloDesdeNombre(archivo.name), tipo: '', fecha: '', caduca: '', instalaciones: [], estado: 'lista',
  }
  fila.rechazo = await comprobarArchivo(archivo)
  if (!fila.rechazo) fila.huella = await huellaSha256(await archivo.arrayBuffer())
  return fila
}

/**
 * Busca en el Libro los documentos con estas huellas. Devuelve su título por huella.
 * Solo encuentra los que la persona puede ver. Los de la papelera los ve la administración, y lo dice.
 */
export async function buscarDuplicados(supabase: SupabaseClient, huellas: string[]): Promise<Map<string, string>> {
  const encontrados = new Map<string, string>()
  if (huellas.length === 0) return encontrados
  const { data, error } = await supabase.from('documentos').select('sha256, titulo, eliminado_en').in('sha256', huellas)
  if (error) throw new Error(`No se pudo comprobar si ya están en el Libro: ${error.message}`)
  for (const d of data) encontrados.set(d.sha256, d.eliminado_en ? `«${d.titulo}», en la papelera` : `«${d.titulo}»`)
  return encontrados
}

/**
 * Marca las filas repetidas: las que ya están en el Libro y las que se repiten dentro de la tanda.
 * Devuelve filas nuevas, sin cambiar las de entrada.
 */
export function marcarDuplicados(filas: Fila[], enElLibro: Map<string, string>): Fila[] {
  const vistas = new Map<string, string>()
  return filas.map(fila => {
    if (!fila.huella) return fila
    const enLibro = enElLibro.get(fila.huella)
    const enTanda = vistas.get(fila.huella)
    if (!enTanda) vistas.set(fila.huella, fila.archivo.name)
    const duplicado = enLibro
      ? `Ya está en el Libro como ${enLibro}.`
      : enTanda ? `Es el mismo archivo que «${enTanda}».` : undefined
    return { ...fila, duplicado }
  })
}

/**
 * Lo que le falta a una ficha para poder subirla, o una lista vacía si está completa.
 * Una empresa tiene que marcar al menos una instalación suya: la base de datos no le deja otra cosa.
 */
export function faltaEnFicha(fila: Fila, esEmpresa: boolean): string[] {
  const falta: string[] = []
  if (fila.titulo.trim() === '') falta.push('el título')
  else if (fila.titulo.trim().length > 200) falta.push('un título más corto, de 200 letras como mucho')
  if (fila.tipo === '') falta.push('el tipo')
  if (fila.fecha === '') falta.push('la fecha')
  if (fila.caduca !== '' && fila.fecha !== '' && fila.caduca < fila.fecha) falta.push('una caducidad posterior a la fecha')
  if (esEmpresa && fila.instalaciones.length === 0) falta.push('la instalación')
  return falta
}

/** El formulario que espera la función «archivos». */
export function formulario(fila: Fila): FormData {
  const datos = new FormData()
  datos.append('archivo', fila.archivo, fila.archivo.name)
  datos.append('id', fila.id)
  datos.append('tipo', fila.tipo)
  datos.append('titulo', fila.titulo.trim())
  datos.append('fecha', fila.fecha)
  if (fila.caduca) datos.append('caduca', fila.caduca)
  for (const instalacion of fila.instalaciones) datos.append('instalaciones', instalacion)
  return datos
}

/**
 * Manda un documento a la función «archivos». Devuelve el mensaje de error, o `undefined` si ha ido bien.
 * Si la función responde con un error, se muestra su motivo, que ya está escrito para la persona.
 */
export async function subir(supabase: SupabaseClient, fila: Fila): Promise<string | undefined> {
  const { error } = await supabase.functions.invoke('archivos', { body: formulario(fila) })
  if (!error) return undefined
  // Con un error de la función, `context` es su respuesta. Lleva un JSON con el motivo.
  const respuesta: unknown = (error as { context?: unknown }).context
  if (respuesta instanceof Response) {
    const cuerpo = await respuesta.json().catch(() => null) as { error?: string } | null
    if (cuerpo?.error) return cuerpo.error
  }
  return navigator.onLine ? 'No se pudo subir. Vuelve a intentarlo.' : 'No hay conexión. Cuando vuelva, pulsa Guardar otra vez.'
}

/** Los tipos de documento y las instalaciones que la persona puede elegir, por orden alfabético. */
export async function leerOpciones(supabase: SupabaseClient): Promise<{ tipos: Opcion[]; instalaciones: Opcion[] }> {
  const [tipos, instalaciones] = await Promise.all([
    supabase.from('tipos_documento').select('id, nombre').order('nombre'),
    supabase.from('instalaciones').select('id, nombre').order('nombre'),
  ])
  if (tipos.error) throw new Error(`No se pudieron leer los tipos de documento: ${tipos.error.message}`)
  if (instalaciones.error) throw new Error(`No se pudieron leer las instalaciones: ${instalaciones.error.message}`)
  return { tipos: tipos.data, instalaciones: instalaciones.data }
}
