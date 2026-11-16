// Comprueba el listado antes de escribir nada. No toca el disco ni la base de datos:
// recibe las filas y lo que ya hay en el edificio, y dice qué se cargaría y qué está mal.

import type { Fila } from './csv.ts'
import { AVISO_PREPARADO } from './listado.ts'
import { idDocumento } from './uuid.ts'

export interface Instalacion { id: string; nombre: string; tipo_id: string }

/** Lo que hace falta saber del edificio para comprobar un listado. */
export interface Catalogo {
  edificioId: string
  /** Identificadores de los tipos de documento admitidos. */
  tipos: string[]
  instalaciones: Instalacion[]
  /** Huellas de los documentos que ya tiene el edificio. */
  huellas: Set<string>
}

/** Una fila del listado ya comprobada y lista para cargar. */
export interface Documento {
  fila: number
  id: string
  tipo: string
  titulo: string
  fecha: string
  emisor: string
  caduca: string | null
  instalaciones: string[]
  rutaOriginal: string
  nombreOriginal: string
  sha256: string
  /** Dónde queda el archivo dentro del repositorio del edificio. */
  ruta: string
}

export interface ErrorFila { fila: number; mensaje: string }

export interface Comprobacion {
  documentos: Documento[]
  /** Filas marcadas con «si» cuyo archivo ya está en el Libro. */
  yaCargadas: { fila: number; titulo: string }[]
  noIncluidas: number
  errores: ErrorFila[]
}

const normalizar = (texto: string) => texto.trim().toLowerCase()

/** Lee una fecha escrita como 2026-03-10 o como 10/03/2026, que es como la deja Excel. Devuelve año-mes-día. */
export function leerFecha(texto: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto.trim())
  const es = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto.trim())
  const [ano, mes, dia] = iso ? [iso[1], iso[2], iso[3]] : es ? [es[3], es[2], es[1]] : []
  if (!ano || !mes || !dia) return null
  const fecha = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)))
  // Date acepta el 31 de febrero y lo convierte en marzo. Si cambia, la fecha no existe.
  const existe = fecha.getUTCFullYear() === Number(ano) && fecha.getUTCMonth() === Number(mes) - 1 && fecha.getUTCDate() === Number(dia)
  return existe ? `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}` : null
}

/** Ruta de un documento dentro del repositorio del edificio: documentos/AAAA/<id>.ext */
export const rutaDocumento = (id: string, fecha: string, extension: string) =>
  `documentos/${fecha.slice(0, 4)}/${id}.${extension}`

/**
 * Convierte la columna `instalaciones` en identificadores.
 * Cada valor, separado por comas, es el nombre de una instalación o su tipo, si solo hay una de ese tipo.
 */
export function buscarInstalaciones(texto: string, instalaciones: Instalacion[]): { ids: string[]; errores: string[] } {
  const ids: string[] = []
  const errores: string[] = []
  for (const valor of texto.split(',').map(v => v.trim()).filter(v => v !== '')) {
    const porNombre = instalaciones.filter(i => normalizar(i.nombre) === normalizar(valor))
    const porTipo = instalaciones.filter(i => normalizar(i.tipo_id) === normalizar(valor))
    const encontradas = porNombre.length > 0 ? porNombre : porTipo
    if (encontradas.length === 1) {
      if (!ids.includes(encontradas[0].id)) ids.push(encontradas[0].id)
    } else if (encontradas.length > 1) {
      errores.push(`hay varias instalaciones de tipo «${valor}»: escribe el nombre (${encontradas.map(i => i.nombre).join(', ')})`)
    } else {
      const validas = [...new Set(instalaciones.map(i => i.tipo_id))].sort().join(', ')
      errores.push(`la instalación «${valor}» no existe en el edificio. Valen: ${validas || 'ninguna'}`)
    }
  }
  return { ids, errores }
}

/**
 * Comprueba todas las filas y devuelve todos los errores juntos, cada uno con su número de fila.
 * El número es el que se ve en la hoja de cálculo: la fila 1 son los títulos.
 */
export function comprobarListado(filas: Fila[], catalogo: Catalogo): Comprobacion {
  const resultado: Comprobacion = { documentos: [], yaCargadas: [], noIncluidas: 0, errores: [] }
  const filaDeHuella = new Map<string, number>()

  filas.forEach((datos, indice) => {
    const fila = indice + 2
    const error = (mensaje: string) => resultado.errores.push({ fila, mensaje })

    const incluir = normalizar(datos.incluir ?? '').replace('í', 'i')
    if (incluir === '' || incluir === 'no') { resultado.noIncluidas++; return }
    if (incluir !== 'si') { error(`incluir debe ser «si» o «no», y pone «${datos.incluir}»`); return }

    // El PDF de una tanda con hojas separadoras, o un .docx, ya preparados: hay que cargar lo que salió de ellos.
    if ((datos.aviso ?? '').includes(AVISO_PREPARADO)) {
      error('este archivo ya pasó por preparar: carga los PDF que salieron de él (lo dice la columna aviso), no este')
      return
    }

    const sha256 = normalizar(datos.sha256 ?? '')
    if (!/^[a-f0-9]{64}$/.test(sha256)) { error('la columna sha256 no tiene una huella válida'); return }

    const repetida = filaDeHuella.get(sha256)
    if (repetida !== undefined) { error(`es el mismo archivo que el de la fila ${repetida}: deja solo uno con «si»`); return }
    filaDeHuella.set(sha256, fila)

    const titulo = (datos.titulo ?? '').trim()
    if (catalogo.huellas.has(sha256)) { resultado.yaCargadas.push({ fila, titulo }); return }

    const antes = resultado.errores.length
    const tipo = normalizar(datos.tipo ?? '')
    if (tipo === '') error('falta el tipo')
    else if (!catalogo.tipos.includes(tipo)) error(`el tipo «${datos.tipo}» no existe. Valen: ${[...catalogo.tipos].sort().join(', ')}`)

    if (titulo === '') error('falta el título')

    const fecha = leerFecha(datos.fecha ?? '')
    if ((datos.fecha ?? '').trim() === '') error('falta la fecha')
    else if (fecha === null) error(`la fecha «${datos.fecha}» no vale. Escríbela como 2026-03-10`)

    const textoCaduca = (datos.caduca ?? '').trim()
    const caduca = textoCaduca === '' ? null : leerFecha(textoCaduca)
    if (textoCaduca !== '' && caduca === null) error(`la fecha de caducidad «${datos.caduca}» no vale. Escríbela como 2027-03-10`)
    else if (fecha !== null && caduca !== null && caduca < fecha) error('caduca antes de su propia fecha')

    const extension = normalizar(datos.extension ?? '')
    if (!/^[a-z0-9]+$/.test(extension)) error('el archivo no tiene extensión')

    const rutaOriginal = (datos.ruta_original ?? '').trim()
    if (rutaOriginal === '') error('falta ruta_original')

    const instalaciones = buscarInstalaciones(datos.instalaciones ?? '', catalogo.instalaciones)
    instalaciones.errores.forEach(error)

    if (resultado.errores.length > antes || fecha === null) return
    const id = idDocumento(catalogo.edificioId, sha256)
    resultado.documentos.push({
      fila, id, tipo, titulo, fecha, caduca, sha256, rutaOriginal,
      emisor: (datos.emisor ?? '').trim(),
      instalaciones: instalaciones.ids,
      nombreOriginal: (datos.nombre ?? '').trim() || rutaOriginal.split('/').pop()!,
      ruta: rutaDocumento(id, fecha, extension),
    })
  })
  return resultado
}
