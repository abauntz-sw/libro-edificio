// Cómo se llaman los archivos en el repositorio del edificio (issue #77).
//
//   documentos/2026/2026-11-21_certificado_revision-de-la-caldera_<id>.pdf
//   fotos/2026/2026-11-21_extintores_<id>.jpg
//
// Lo usan la función «archivos» (Deno) y las herramientas de carga local (Node).
// Las dos importan este mismo archivo, así que no pueden dar nombres distintos.
// Por eso no tiene dependencias ni nada propio de Deno o de Node.
//
// El nombre se decide el día en que se archiva y no cambia aunque luego se corrija la ficha.

/**
 * Lo más que ocupa la descripción. Con el tipo más largo, el nombre se queda en 116 caracteres.
 * Así la ruta completa entra en los 260 de Windows, también en una copia dentro de OneDrive.
 */
export const LARGO_DESCRIPCION = 40

/**
 * Deja un texto en minúsculas, sin acentos y solo con a-z, 0-9 y guiones.
 * «Revisión nº 3 (caldera)» queda «revision-no-3-caldera».
 */
export function limpiar(texto: string): string {
  return texto
    // NFKD separa la letra de su acento (á = a + ´) y convierte º y ª en o y a.
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Corta un texto ya limpio a LARGO_DESCRIPCION caracteres, en un guion para no partir una palabra. */
export function cortar(texto: string, largo = LARGO_DESCRIPCION): string {
  if (texto.length <= largo) return texto
  const guion = texto.lastIndexOf('-', largo)
  return (guion > 0 ? texto.slice(0, guion) : texto.slice(0, largo)).replace(/-+$/, '')
}

/** Palabras que no dicen qué es un documento. Salen de los nombres que pone un escáner o un móvil. */
const GENERICAS = new Set([
  'archivo', 'at', 'cam', 'copia', 'copy', 'doc', 'document', 'documento', 'dsc', 'escaneado', 'escaneo', 'escaner',
  'file', 'foto', 'hoja', 'image', 'imagen', 'img', 'nuevo', 'page', 'pag', 'pagina', 'pdf', 'photo', 'scan',
  'scanned', 'sin', 'titulo', 'untitled', 'vid', 'wa', 'whatsapp',
])

/**
 * Dice si un texto ya limpio no dice nada: vacío, solo números o palabras genéricas con números,
 * como «escaneo001», «scan», «documento-3» o «sin-titulo».
 */
export function noDiceNada(texto: string): boolean {
  return texto.split(/[^a-z]+/).filter(palabra => palabra !== '').every(palabra => GENERICAS.has(palabra))
}

/** Palabras de enlace que se saltan al quitar el tipo del principio del título. */
const ENLACES = new Set(['de', 'del', 'el', 'la', 'las', 'los'])

/**
 * Si el título empieza por el tipo, lo quita, con las palabras de enlace de alrededor.
 * Con el tipo `certificado`, «certificado-de-revision-de-la-caldera» queda «revision-de-la-caldera».
 * Con `acta-inspeccion`, «acta-de-inspeccion-bt» queda «bt». Si no empieza por el tipo entero, no cambia.
 */
export function quitarTipo(titulo: string, tipo: string): string {
  const palabras = titulo.split('-')
  let i = 0
  for (const delTipo of tipo.split('-')) {
    while (ENLACES.has(palabras[i]) && palabras[i] !== delTipo) i++
    if (palabras[i] !== delTipo) return titulo
    i++
  }
  while (ENLACES.has(palabras[i])) i++
  return palabras.slice(i).join('-')
}

/**
 * La descripción de un documento: el título, sin el tipo del principio.
 * Si el título no dice nada, la instalación; si hay varias, la primera por nombre.
 * Si tampoco hay instalación, ninguna.
 */
export function descripcionDocumento(titulo: string, tipo: string, instalaciones: string[]): string {
  const delTitulo = quitarTipo(limpiar(titulo), limpiar(tipo))
  if (!noDiceNada(delTitulo)) return cortar(delTitulo)
  // Se ordenan ya limpias: así sale lo mismo en Deno y en Node, sin depender del idioma del sistema.
  const primera = instalaciones.map(limpiar).filter(nombre => nombre !== '').sort()[0] ?? ''
  return cortar(primera)
}

export interface DatosDocumento {
  id: string
  /** La fecha del documento, como 2026-11-21. */
  fecha: string
  /** El tipo_id, como `certificado`. */
  tipo: string
  titulo: string
  /** Los nombres de sus instalaciones, no los identificadores. */
  instalaciones: string[]
  /** Sin el punto: `pdf`. */
  extension: string
}

/** `<fecha>_<tipo>_<descripción>_<id>.<extensión>`. Sin descripción, `<fecha>_<tipo>_<id>.<extensión>`. */
export function nombreDocumento(d: DatosDocumento): string {
  const descripcion = descripcionDocumento(d.titulo, d.tipo, d.instalaciones)
  return `${[d.fecha, limpiar(d.tipo), descripcion, d.id].filter(parte => parte !== '').join('_')}.${d.extension}`
}

/** Ruta de un documento dentro del repositorio del edificio. El año de la carpeta es el de la fecha. */
export const rutaDocumento = (d: DatosDocumento) => `documentos/${d.fecha.slice(0, 4)}/${nombreDocumento(d)}`

export interface DatosFoto {
  id: string
  /** La fecha del parte, o la de la foto si todavía no tiene parte (#82). */
  fecha: string
  /** El nombre de la instalación del parte. Una foto sin parte no la tiene. */
  instalacion: string | null
}

/** `<fecha>_<instalación>_<id>.jpg`. Sin instalación, `<fecha>_<id>.jpg`. */
export function nombreFoto(f: DatosFoto): string {
  const instalacion = cortar(limpiar(f.instalacion ?? ''))
  return `${[f.fecha, instalacion, f.id].filter(parte => parte !== '').join('_')}.jpg`
}

/** Ruta de una foto dentro del repositorio del edificio. El año de la carpeta es el de la fecha. */
export const rutaFoto = (f: DatosFoto) => `fotos/${f.fecha.slice(0, 4)}/${nombreFoto(f)}`
