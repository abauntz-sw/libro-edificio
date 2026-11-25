// Atiende cada petición: subir un documento o una foto de un parte (POST), o descargarlos (GET).
//
// El orden importa. Primero se comprueba todo lo que se puede, después se escribe el archivo
// y al final se crea la ficha. Si el último paso falla, queda un archivo sin ficha, que no hace daño.
// Nunca queda una ficha sin archivo.

import {
  ErrorHttp,
  esJpeg,
  esPdf,
  esRutaDeDocumento,
  esRutaDeFoto,
  esUuid,
  leerFicha,
  leerFoto,
  LIMITE_BYTES,
  LIMITE_FOTO_BYTES,
  rutaDocumento,
  rutaFoto,
  sha256,
} from './ficha.ts'
import type { Almacen } from './github.ts'
import type { Libro } from './libro.ts'

/** Los días que hay para añadir fotos a un parte, desde que se recibe. La regla está en la base de datos. */
const PLAZO_FOTOS_DIAS = 7

export interface Piezas {
  /** Abre la base de datos con la sesión de quien llama. */
  libro(autorizacion: string): Libro
  /** Se pide al usarlo, para que un secreto que falte dé un error claro y no tumbe la función. */
  almacen(): Almacen
}

// La web está en otra dirección, así que el navegador pide permiso antes de llamar.
// Vale cualquier origen porque aquí no hay cookies: sin la sesión en la cabecera no se hace nada.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Disposition',
}

const json = (estado: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } })

const megas = Math.round(LIMITE_BYTES / 1024 / 1024)
const demasiadoGrande = () =>
  new ErrorHttp(413, `El archivo pesa más de ${megas} MB. Redúcelo o cárgalo con la herramienta de carga local.`)

async function subir(peticion: Request, libro: Libro, piezas: Piezas): Promise<Response> {
  // Si el navegador ya avisa de que es enorme, no hace falta ni leerlo. El margen es para la ficha.
  if (Number(peticion.headers.get('content-length') ?? 0) > LIMITE_BYTES + 1024 * 1024) throw demasiadoGrande()

  const formulario = await peticion.formData().catch(() => {
    throw new ErrorHttp(400, 'La subida no ha llegado bien. Vuelve a intentarlo.')
  })
  const archivo = formulario.get('archivo')
  if (!(archivo instanceof File)) throw new ErrorHttp(400, 'Falta el archivo.')
  if (archivo.size === 0) throw new ErrorHttp(400, 'El archivo está vacío.')
  if (archivo.size > LIMITE_BYTES) throw demasiadoGrande()

  // Una foto lleva el parte al que va. Un documento, su ficha.
  return formulario.has('parte')
    ? await subirFoto(formulario, archivo, libro, piezas)
    : await subirDocumento(formulario, archivo, libro, piezas)
}

async function subirDocumento(formulario: FormData, archivo: File, libro: Libro, piezas: Piezas): Promise<Response> {
  const ficha = leerFicha(formulario, archivo.name)
  const bytes = new Uint8Array(await archivo.arrayBuffer())
  if (!esPdf(bytes)) throw new ErrorHttp(400, 'El archivo no es un PDF.')
  const huella = await sha256(bytes)

  const edificio = await libro.edificio()
  if (!edificio || !(await libro.puedoArchivar(ficha.instalaciones))) {
    throw new ErrorHttp(403, 'No tienes permiso para archivar este documento.')
  }
  // Estas dos comprobaciones las repite la base de datos al crear la ficha.
  // Se hacen antes para no dejar un archivo guardado que luego no se pueda registrar.
  if (!(await libro.existeTipo(ficha.tipo))) throw new ErrorHttp(400, 'Ese tipo de documento no existe en el edificio.')
  const instalaciones = await libro.nombresInstalaciones(ficha.instalaciones)
  if (instalaciones.length !== ficha.instalaciones.length) {
    throw new ErrorHttp(400, 'Hay una instalación que no es de este edificio.')
  }

  // El nombre se saca de la ficha de hoy. Si luego se corrige la ficha, el archivo no se renombra.
  const ruta = rutaDocumento({ ...ficha, instalaciones, extension: 'pdf' })
  const previo = await libro.documento(ficha.id)
  if (previo) {
    // Repetir una subida que ya salió bien no hace nada. Así un reintento con mala cobertura no duplica.
    if (previo.sha256 !== huella) throw new ErrorHttp(409, 'Ya hay otro documento con ese identificador.')
    return json(200, { id: ficha.id, ruta: previo.ruta, sha256: huella, yaEstaba: true })
  }

  // El mensaje del commit no lleva títulos ni nombres: solo el identificador.
  const escrito = await piezas.almacen().escribir(edificio.repositorio, ruta, bytes, `Añade el documento ${ficha.id}`)

  try {
    await libro.registrar({ ...ficha, ruta, sha256: huella, tamanoBytes: bytes.length, commit: escrito.commit })
  } catch (error) {
    if (error instanceof ErrorHttp) throw error
    console.error(`Archivo guardado sin ficha: ${ruta}`, error)
    throw new ErrorHttp(500, 'El archivo se ha guardado, pero no su ficha. Vuelve a intentarlo: no se duplicará.')
  }
  return json(201, { id: ficha.id, ruta, sha256: huella, yaEstaba: escrito.yaEstaba })
}

/**
 * Guarda una foto de un parte que ya está en la base de datos.
 * El móvil envía primero el parte y después sus fotos, una a una: así una foto nunca llega sin su parte.
 */
async function subirFoto(formulario: FormData, archivo: File, libro: Libro, piezas: Piezas): Promise<Response> {
  if (archivo.size > LIMITE_FOTO_BYTES) {
    throw new ErrorHttp(413, `La foto pesa más de ${Math.round(LIMITE_FOTO_BYTES / 1024 / 1024)} MB. Hazla con menos resolución.`)
  }
  const { id, parte } = leerFoto(formulario)
  const bytes = new Uint8Array(await archivo.arrayBuffer())
  if (!esJpeg(bytes)) throw new ErrorHttp(400, 'La foto no es un JPEG.')
  const huella = await sha256(bytes)

  // Se responde lo mismo si el parte no existe que si es de otro: así no se sabe cuál de las dos cosas pasa.
  const edificio = await libro.edificio()
  const delParte = edificio && await libro.parte(parte)
  if (!edificio || !delParte || !(await libro.puedoAdjuntarFoto(parte))) {
    // Solo a quien escribió el parte se le dice que es por el plazo.
    if (edificio && delParte && await libro.fotoFueraDePlazo(parte)) {
      throw new ErrorHttp(403, `Ese parte se recibió hace más de ${PLAZO_FOTOS_DIAS} días y ya no admite fotos.`)
    }
    throw new ErrorHttp(403, 'No puedes añadir fotos a ese parte.')
  }

  const previa = await libro.foto(id)
  if (previa) {
    // Repetir una subida que ya salió bien no hace nada, igual que con los documentos.
    if (previa.sha256 !== huella || previa.parte !== parte) throw new ErrorHttp(409, 'Ya hay otra foto con ese identificador.')
    return json(200, { id, ruta: previa.ruta, sha256: huella, yaEstaba: true })
  }

  // Si el identificador es de una foto que esta persona no ve, se responde 409 de una de dos formas.
  // Si la ruta es la misma, GitHub no deja pisar el archivo. Si es otra (un parte de otro año o de otra instalación),
  // GitHub guarda el archivo y la base de datos rechaza el identificador repetido: queda un archivo suelto,
  // que no hace daño. Solo pasa si alguien manipula el móvil.
  const ruta = rutaFoto({ id, ...delParte })
  const escrito = await piezas.almacen().escribir(edificio.repositorio, ruta, bytes, `Añade la foto ${id}`)

  try {
    await libro.registrarFoto({ id, edificio: edificio.id, parte, ruta, sha256: huella })
  } catch (error) {
    if (error instanceof ErrorHttp) throw error
    console.error(`Foto guardada sin apuntar: ${ruta}`, error)
    throw new ErrorHttp(500, 'La foto se ha guardado, pero no se ha apuntado en el parte. Vuelve a intentarlo: no se duplicará.')
  }
  return json(201, { id, ruta, sha256: huella, yaEstaba: escrito.yaEstaba })
}

/** Entrega una foto, si quien la pide ve su parte. */
async function descargarFoto(id: string, libro: Libro, piezas: Piezas): Promise<Response> {
  if (!esUuid(id)) throw new ErrorHttp(400, 'Falta el identificador de la foto.')
  const noEsta = new ErrorHttp(404, 'No se encuentra esa foto.')
  const foto = await libro.foto(id)
  const edificio = foto && await libro.edificio()
  if (!foto || !edificio) throw noEsta
  // La base de datos ya lo impide, pero aquí se repite: solo se entregan archivos de fotos/.
  if (!esRutaDeFoto(foto.ruta, id)) {
    console.error(`Foto ${id} con una ruta que no es de una foto: ${foto.ruta}`)
    throw noEsta
  }
  const contenido = await piezas.almacen().leer(edificio.repositorio, foto.ruta)
  if (!contenido) {
    console.error(`Foto sin archivo: ${foto.ruta}`)
    throw noEsta
  }
  return new Response(contenido, {
    headers: {
      ...CORS,
      'Content-Type': 'image/jpeg',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  })
}

async function descargar(peticion: Request, libro: Libro, piezas: Piezas): Promise<Response> {
  const parametros = new URL(peticion.url).searchParams
  if (parametros.has('foto')) return await descargarFoto((parametros.get('foto') ?? '').toLowerCase(), libro, piezas)

  const id = (parametros.get('id') ?? '').toLowerCase()
  if (!esUuid(id)) throw new ErrorHttp(400, 'Falta el identificador del documento.')

  // La base de datos solo devuelve el documento si esa persona puede verlo.
  // Se responde lo mismo si no existe que si es de otro: así no se sabe cuál de las dos cosas pasa.
  const noEsta = new ErrorHttp(404, 'No se encuentra ese documento.')
  const documento = await libro.documento(id)
  const edificio = documento && await libro.edificio()
  if (!documento || !edificio) throw noEsta
  // Solo se entregan documentos. Una ficha que apunta a otro archivo, como el índice o una foto,
  // la ha creado alguien a propósito con registrar_documento para leer lo que no le toca.
  if (!esRutaDeDocumento(documento.ruta, id)) {
    console.error(`Ficha ${id} con una ruta que no es de un documento: ${documento.ruta}`)
    throw noEsta
  }

  const contenido = await piezas.almacen().leer(edificio.repositorio, documento.ruta)
  if (!contenido) {
    console.error(`Ficha sin archivo: ${documento.ruta}`)
    throw noEsta
  }
  return new Response(contenido, {
    headers: {
      ...CORS,
      'Content-Type': documento.ruta.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
      // filename* admite tildes y eñes en el nombre.
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(documento.nombreOriginal)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  })
}

export async function atender(peticion: Request, piezas: Piezas): Promise<Response> {
  try {
    if (peticion.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (peticion.method !== 'GET' && peticion.method !== 'POST') throw new ErrorHttp(405, 'Aquí solo se sube o se descarga.')

    const autorizacion = peticion.headers.get('authorization') ?? ''
    if (!/^Bearer \S+$/i.test(autorizacion)) throw new ErrorHttp(401, 'Hace falta iniciar sesión.')
    const libro = piezas.libro(autorizacion)

    return peticion.method === 'POST' ? await subir(peticion, libro, piezas) : await descargar(peticion, libro, piezas)
  } catch (error) {
    if (error instanceof ErrorHttp) return json(error.estado, { error: error.message })
    // El detalle va al registro de la función, no a quien llama.
    console.error(error)
    return json(500, { error: 'Algo ha fallado en el servidor. Vuelve a intentarlo más tarde.' })
  }
}
