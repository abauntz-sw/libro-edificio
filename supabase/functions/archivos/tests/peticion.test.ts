import { assertEquals } from '@std/assert'
import { ErrorHttp, LIMITE_BYTES, LIMITE_FOTO_BYTES } from '../ficha.ts'
import type { Almacen } from '../github.ts'
import type { DocumentoGuardado, FotoGuardada, Libro, Registro } from '../libro.ts'
import { atender } from '../peticion.ts'

const REPO = 'organizacion-ficticia/edificio-de-prueba'
const ID = '99999999-9999-4999-8999-999999999991'
const CALDERA = '11111111-2222-4333-8444-555555555555'
const EXTINTORES = '66666666-7777-4888-8999-000000000000'
const PDF = new TextEncoder().encode('%PDF-1.7 documento ficticio')
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode('foto ficticia')])
const PARTE_GUARDA = 'aaaaaaaa-0000-4000-8000-000000000001'
const PARTE_CALOR = 'aaaaaaaa-0000-4000-8000-000000000002'
const FOTO = 'bbbbbbbb-0000-4000-8000-000000000001'

type Perfil = 'admin' | 'guarda' | 'calor' | 'extintores'

/**
 * Un edificio de mentira con las mismas reglas que la base de datos:
 * administración archiva y ve todo, el guarda solo ve, y una empresa solo archiva y ve lo de su instalación.
 */
function edificioDeMentira() {
  const documentos = new Map<string, DocumentoGuardado & { instalaciones: string[] }>()
  const archivos = new Map<string, Uint8Array>()
  const fallos = { registrar: 0, registrarFoto: 0 }
  const instalacionDe: Partial<Record<Perfil, string>> = { calor: CALDERA, extintores: EXTINTORES }
  // Dos partes: uno del guarda, en los extintores, y otro de la empresa de la caldera, del año pasado.
  const partes = new Map<string, { fecha: string; autor: Perfil; instalacion: string }>([
    [PARTE_GUARDA, { fecha: '2026-11-18', autor: 'guarda', instalacion: EXTINTORES }],
    [PARTE_CALOR, { fecha: '2025-12-30', autor: 'calor', instalacion: CALDERA }],
  ])
  const fotos = new Map<string, FotoGuardada>()
  // Como veo_parte: administración y guarda ven todos los partes; una empresa, los de su instalación.
  const veParte = (perfil: Perfil, id: string) => {
    const parte = partes.get(id)
    return parte !== undefined && (perfil === 'admin' || perfil === 'guarda' || parte.instalacion === instalacionDe[perfil])
  }

  const libro = (perfil: Perfil): Libro => ({
    edificio: () => Promise.resolve({ id: 'edificio', repositorio: REPO }),
    puedoArchivar: instalaciones => Promise.resolve(
      perfil === 'admin' ||
        (instalacionDe[perfil] !== undefined && instalaciones.length > 0 && instalaciones.every(una => una === instalacionDe[perfil])),
    ),
    existeTipo: tipo => Promise.resolve(tipo === 'certificado'),
    cuentaInstalaciones: ids => Promise.resolve(ids.filter(id => id === CALDERA || id === EXTINTORES).length),
    documento: id => {
      const documento = documentos.get(id)
      const loVe = documento && (perfil === 'admin' || perfil === 'guarda' || documento.instalaciones.includes(instalacionDe[perfil]!))
      return Promise.resolve(loVe ? documento : null)
    },
    registrar: (registro: Registro) => {
      if (fallos.registrar-- > 0) return Promise.reject(new Error('la base de datos no responde'))
      if (!documentos.has(registro.id)) documentos.set(registro.id, { ...registro })
      return Promise.resolve()
    },
    fechaParte: id => Promise.resolve(veParte(perfil, id) ? partes.get(id)!.fecha : null),
    puedoAdjuntarFoto: id => Promise.resolve(partes.get(id)?.autor === perfil),
    foto: id => {
      const foto = fotos.get(id)
      return Promise.resolve(foto && veParte(perfil, foto.parte) ? foto : null)
    },
    registrarFoto: registro => {
      if (fallos.registrarFoto-- > 0) return Promise.reject(new Error('la base de datos no responde'))
      if (partes.get(registro.parte)?.autor !== perfil) return Promise.reject(new ErrorHttp(403, 'No puedes añadir fotos a ese parte.'))
      if (!fotos.has(registro.id)) fotos.set(registro.id, { ruta: registro.ruta, sha256: registro.sha256, parte: registro.parte })
      return Promise.resolve()
    },
  })

  const almacen: Almacen = {
    escribir: (_repositorio, ruta, bytes) => {
      const yaEstaba = archivos.has(ruta)
      archivos.set(ruta, bytes)
      return Promise.resolve({ commit: 'commit-1', yaEstaba })
    },
    leer: (_repositorio, ruta) => {
      const bytes = archivos.get(ruta)
      return Promise.resolve(bytes ? new Response(bytes.slice()).body : null)
    },
  }

  // La «sesión» de los tests es el nombre del perfil.
  const piezas = { libro: (autorizacion: string) => libro(autorizacion.replace('Bearer ', '') as Perfil), almacen: () => almacen }

  const subir = (perfil: Perfil | null, campos: Record<string, string> = {}, archivo: Uint8Array | null = PDF) => {
    const datos = new FormData()
    const ficha = { id: ID, tipo: 'certificado', titulo: 'Revisión de prueba', fecha: '2026-03-10', instalaciones: CALDERA, ...campos }
    for (const [campo, valor] of Object.entries(ficha)) if (valor !== '') datos.append(campo, valor)
    if (archivo) datos.append('archivo', new File([archivo.slice()], 'revisión caldera.pdf'))
    return atender(new Request('https://funcion.prueba/archivos', {
      method: 'POST',
      headers: perfil ? { Authorization: `Bearer ${perfil}` } : {},
      body: datos,
    }), piezas)
  }

  const descargar = (perfil: Perfil | null, id = ID) =>
    atender(new Request(`https://funcion.prueba/archivos?id=${id}`, {
      headers: perfil ? { Authorization: `Bearer ${perfil}` } : {},
    }), piezas)

  const subirFoto = (perfil: Perfil | null, campos: Record<string, string> = {}, archivo: Uint8Array | null = JPEG) => {
    const datos = new FormData()
    for (const [campo, valor] of Object.entries({ id: FOTO, parte: PARTE_GUARDA, ...campos })) datos.append(campo, valor)
    if (archivo) datos.append('archivo', new File([archivo.slice()], 'foto.jpg'))
    return atender(new Request('https://funcion.prueba/archivos', {
      method: 'POST',
      headers: perfil ? { Authorization: `Bearer ${perfil}` } : {},
      body: datos,
    }), piezas)
  }

  const descargarFoto = (perfil: Perfil | null, id = FOTO) =>
    atender(new Request(`https://funcion.prueba/archivos?foto=${id}`, {
      headers: perfil ? { Authorization: `Bearer ${perfil}` } : {},
    }), piezas)

  return { documentos, archivos, fotos, fallos, piezas, subir, descargar, subirFoto, descargarFoto }
}

/** Calla los avisos que la función escribe en su registro cuando algo falla a propósito. */
async function enSilencio<T>(tarea: () => Promise<T>): Promise<T> {
  const original = console.error
  console.error = () => {}
  try { return await tarea() } finally { console.error = original }
}

const RUTA = `documentos/2026/${ID}.pdf`

Deno.test('administración sube un PDF: se guarda el archivo y se crea la ficha', async () => {
  const edificio = edificioDeMentira()
  const respuesta = await edificio.subir('admin', { emisor: 'Calor Ficticio SL', caduca: '2027-03-10' })
  assertEquals(respuesta.status, 201)
  const cuerpo = await respuesta.json()
  assertEquals([cuerpo.id, cuerpo.ruta, cuerpo.yaEstaba], [ID, RUTA, false])
  assertEquals(edificio.archivos.get(RUTA), PDF)

  const ficha = edificio.documentos.get(ID) as unknown as Registro
  assertEquals(ficha.sha256, cuerpo.sha256)
  assertEquals(ficha.sha256.length, 64)
  assertEquals(
    [ficha.ruta, ficha.titulo, ficha.caduca, ficha.nombreOriginal, ficha.tamanoBytes, ficha.commit, ficha.instalaciones],
    [RUTA, 'Revisión de prueba', '2027-03-10', 'revisión caldera.pdf', PDF.length, 'commit-1', [CALDERA]],
  )
})

Deno.test('administración descarga lo que subió, con su nombre original', async () => {
  const edificio = edificioDeMentira()
  await edificio.subir('admin')
  const respuesta = await edificio.descargar('admin')
  assertEquals(respuesta.status, 200)
  assertEquals(new Uint8Array(await respuesta.arrayBuffer()), PDF)
  assertEquals(respuesta.headers.get('Content-Type'), 'application/pdf')
  assertEquals(respuesta.headers.get('Content-Disposition'), "attachment; filename*=UTF-8''revisi%C3%B3n%20caldera.pdf")
  assertEquals(respuesta.headers.get('Cache-Control'), 'private, no-store')
})

Deno.test('una empresa no descarga un documento ajeno aunque conozca su identificador', async () => {
  const edificio = edificioDeMentira()
  await edificio.subir('admin')
  let lecturas = 0
  const leer = edificio.piezas.almacen().leer
  edificio.piezas.almacen().leer = (...datos) => { lecturas++; return leer(...datos) }

  const ajena = await edificio.descargar('extintores')
  assertEquals(ajena.status, 404)
  assertEquals(lecturas, 0, 'no se llega a pedir el archivo a GitHub')
  // Responde igual que si el documento no existiera.
  const inexistente = await edificio.descargar('extintores', '99999999-9999-4999-8999-999999999999')
  assertEquals(await ajena.text(), await inexistente.text())

  // La empresa que lo mantiene sí lo descarga.
  assertEquals((await edificio.descargar('calor')).status, 200)
})

Deno.test('una empresa archiva en su instalación y no en la de otra', async () => {
  const edificio = edificioDeMentira()
  assertEquals((await edificio.subir('calor')).status, 201)
  const ajena = await edificio.subir('calor', { id: '99999999-9999-4999-8999-999999999992', instalaciones: EXTINTORES })
  assertEquals(ajena.status, 403)
  assertEquals(edificio.archivos.size, 1)
})

Deno.test('el guarda no archiva, y no se escribe nada', async () => {
  const edificio = edificioDeMentira()
  assertEquals((await edificio.subir('guarda')).status, 403)
  assertEquals([edificio.archivos.size, edificio.documentos.size], [0, 0])
})

Deno.test('sin sesión no se sube ni se descarga', async () => {
  const edificio = edificioDeMentira()
  await edificio.subir('admin')
  assertEquals((await edificio.subir(null)).status, 401)
  assertEquals((await edificio.descargar(null)).status, 401)
})

Deno.test('rechaza lo que no vale antes de escribir nada', async () => {
  const edificio = edificioDeMentira()
  const casos: [string, Promise<Response>, number, string][] = [
    ['sin archivo', edificio.subir('admin', {}, null), 400, 'Falta el archivo'],
    ['archivo vacío', edificio.subir('admin', {}, new Uint8Array()), 400, 'vacío'],
    ['no es un PDF', edificio.subir('admin', {}, new TextEncoder().encode('<html>')), 400, 'no es un PDF'],
    ['pesa demasiado', edificio.subir('admin', {}, new Uint8Array(LIMITE_BYTES + 1)), 413, '25 MB'],
    ['ficha incompleta', edificio.subir('admin', { titulo: '' }), 400, 'falta el título'],
    ['tipo que no existe', edificio.subir('admin', { tipo: 'inventado' }), 400, 'tipo de documento'],
    ['instalación de otro edificio', edificio.subir('admin', { instalaciones: '00000000-0000-4000-8000-000000000000' }), 400, 'instalación'],
  ]
  for (const [caso, respuesta, estado, aviso] of casos) {
    const recibida = await respuesta
    assertEquals(recibida.status, estado, caso)
    assertEquals((await recibida.json()).error.includes(aviso), true, caso)
  }
  assertEquals([edificio.archivos.size, edificio.documentos.size], [0, 0])
})

Deno.test('repetir una subida no duplica nada', async () => {
  const edificio = edificioDeMentira()
  await edificio.subir('admin')
  const repetida = await edificio.subir('admin')
  assertEquals(repetida.status, 200)
  assertEquals((await repetida.json()).yaEstaba, true)
  assertEquals([edificio.archivos.size, edificio.documentos.size], [1, 1])
})

Deno.test('el mismo identificador con otro archivo se rechaza', async () => {
  const edificio = edificioDeMentira()
  await edificio.subir('admin')
  const otro = await edificio.subir('admin', {}, new TextEncoder().encode('%PDF-1.7 otro documento'))
  assertEquals(otro.status, 409)
  assertEquals(edificio.archivos.get(RUTA), PDF)
})

Deno.test('si falla la ficha tras guardar el archivo, lo dice, y repetir lo arregla', async () => {
  const edificio = edificioDeMentira()
  edificio.fallos.registrar = 1
  const fallida = await enSilencio(() => edificio.subir('admin'))
  assertEquals(fallida.status, 500)
  assertEquals((await fallida.json()).error.includes('no se duplicará'), true)
  // Queda un archivo sin ficha, nunca una ficha sin archivo.
  assertEquals([edificio.archivos.size, edificio.documentos.size], [1, 0])

  const repetida = await edificio.subir('admin')
  assertEquals(repetida.status, 201)
  assertEquals((await repetida.json()).yaEstaba, true)
  assertEquals([edificio.archivos.size, edificio.documentos.size], [1, 1])
})

Deno.test('un fallo inesperado no cuenta detalles a quien llama', async () => {
  const edificio = edificioDeMentira()
  const piezas = { ...edificio.piezas, almacen: (): Almacen => { throw new Error('Falta el secreto GITHUB_APP_ID') } }
  const datos = new FormData()
  for (const [campo, valor] of Object.entries({ id: ID, tipo: 'certificado', titulo: 'x', fecha: '2026-03-10' })) datos.append(campo, valor)
  datos.append('archivo', new File([PDF.slice()], 'a.pdf'))
  const respuesta = await enSilencio(() => atender(
    new Request('https://funcion.prueba/archivos', { method: 'POST', headers: { Authorization: 'Bearer admin' }, body: datos }), piezas,
  ))
  assertEquals(respuesta.status, 500)
  assertEquals((await respuesta.text()).includes('GITHUB'), false)
})

Deno.test('una sesión caducada pide volver a entrar', async () => {
  const edificio = edificioDeMentira()
  const piezas = {
    ...edificio.piezas,
    libro: (): Libro => ({
      ...edificio.piezas.libro('Bearer admin'),
      documento: () => Promise.reject(new ErrorHttp(401, 'La sesión ha caducado. Vuelve a entrar.')),
    }),
  }
  const respuesta = await atender(
    new Request(`https://funcion.prueba/archivos?id=${ID}`, { headers: { Authorization: 'Bearer caducada' } }), piezas,
  )
  assertEquals(respuesta.status, 401)
})

Deno.test('una ficha que apunta a otro archivo del repositorio no se descarga', async () => {
  // Una empresa puede crear con registrar_documento una ficha suya que apunte al índice,
  // que tiene la lista de todos los documentos del edificio.
  const edificio = edificioDeMentira()
  edificio.archivos.set('indice/documentos.csv', new TextEncoder().encode('ruta;tipo;titulo\n'))
  edificio.documentos.set(ID, {
    ruta: 'indice/documentos.csv', nombreOriginal: 'indice.pdf', sha256: 'a'.repeat(64), instalaciones: [CALDERA],
  })
  let lecturas = 0
  const leer = edificio.piezas.almacen().leer
  edificio.piezas.almacen().leer = (...datos) => { lecturas++; return leer(...datos) }

  const respuesta = await enSilencio(() => edificio.descargar('calor'))
  assertEquals(respuesta.status, 404)
  assertEquals(lecturas, 0, 'no se llega a pedir el archivo a GitHub')
  // Responde igual que si el documento no existiera.
  const inexistente = await edificio.descargar('calor', '99999999-9999-4999-8999-999999999999')
  assertEquals(await respuesta.text(), await inexistente.text())
})

Deno.test('si la ficha existe pero el archivo no está, responde que no se encuentra', async () => {
  const edificio = edificioDeMentira()
  await edificio.subir('admin')
  edificio.archivos.clear()
  assertEquals((await enSilencio(() => edificio.descargar('admin'))).status, 404)
})

Deno.test('responde al permiso que pide el navegador y rechaza otros métodos', async () => {
  const { piezas } = edificioDeMentira()
  const permiso = await atender(new Request('https://funcion.prueba/archivos', { method: 'OPTIONS' }), piezas)
  assertEquals(permiso.status, 204)
  assertEquals(permiso.headers.get('Access-Control-Allow-Origin'), '*')
  assertEquals(permiso.headers.get('Access-Control-Allow-Headers')?.includes('authorization'), true)

  const borrar = await atender(new Request('https://funcion.prueba/archivos', { method: 'DELETE' }), piezas)
  assertEquals(borrar.status, 405)
})

Deno.test('descargar pide un identificador con forma de UUID', async () => {
  const edificio = edificioDeMentira()
  assertEquals((await edificio.descargar('admin', 'documentos/2026/x.pdf')).status, 400)
})

// Fotos de los partes

const RUTA_FOTO = `fotos/2026/${FOTO}.jpg`

/** Cuenta las veces que se pide un archivo a GitHub. */
function contarLecturas(edificio: ReturnType<typeof edificioDeMentira>) {
  const cuenta = { lecturas: 0 }
  const leer = edificio.piezas.almacen().leer
  edificio.piezas.almacen().leer = (...datos) => { cuenta.lecturas++; return leer(...datos) }
  return cuenta
}

Deno.test('el guarda añade una foto a su parte: se guarda en fotos/ y se apunta', async () => {
  const edificio = edificioDeMentira()
  const respuesta = await edificio.subirFoto('guarda')
  assertEquals(respuesta.status, 201)
  const cuerpo = await respuesta.json()
  assertEquals([cuerpo.id, cuerpo.ruta, cuerpo.yaEstaba], [FOTO, RUTA_FOTO, false])
  assertEquals(edificio.archivos.get(RUTA_FOTO), JPEG)
  assertEquals(edificio.fotos.get(FOTO), { ruta: RUTA_FOTO, sha256: cuerpo.sha256, parte: PARTE_GUARDA })
})

Deno.test('la carpeta de la foto es la del año del parte', async () => {
  const edificio = edificioDeMentira()
  const respuesta = await edificio.subirFoto('calor', { parte: PARTE_CALOR })
  assertEquals(respuesta.status, 201)
  assertEquals((await respuesta.json()).ruta, `fotos/2025/${FOTO}.jpg`)
})

Deno.test('nadie más añade fotos a un parte, y no se escribe nada', async () => {
  const edificio = edificioDeMentira()
  for (const perfil of ['admin', 'calor', 'extintores'] as const) {
    assertEquals((await edificio.subirFoto(perfil)).status, 403, perfil)
  }
  // Un parte que no existe responde lo mismo que uno ajeno.
  const ajeno = await edificio.subirFoto('calor')
  const inexistente = await edificio.subirFoto('calor', { parte: 'aaaaaaaa-0000-4000-8000-000000000099' })
  assertEquals(inexistente.status, 403)
  assertEquals(await ajeno.text(), await inexistente.text())
  assertEquals([edificio.archivos.size, edificio.fotos.size], [0, 0])
})

Deno.test('rechaza una foto que no vale antes de escribir nada', async () => {
  const edificio = edificioDeMentira()
  const grande = new Uint8Array(LIMITE_FOTO_BYTES + 1)
  grande.set([0xff, 0xd8, 0xff])
  const casos: [string, Promise<Response>, number, string][] = [
    ['no es un JPEG', edificio.subirFoto('guarda', {}, PDF), 400, 'no es un JPEG'],
    ['pesa demasiado', edificio.subirFoto('guarda', {}, grande), 413, '5 MB'],
    ['parte que no vale', edificio.subirFoto('guarda', { parte: 'x' }), 400, 'identificador del parte'],
    ['sin identificador', edificio.subirFoto('guarda', { id: '' }), 400, 'identificador de la foto'],
    ['sin archivo', edificio.subirFoto('guarda', {}, null), 400, 'Falta el archivo'],
  ]
  for (const [caso, respuesta, estado, aviso] of casos) {
    const recibida = await respuesta
    assertEquals(recibida.status, estado, caso)
    assertEquals((await recibida.json()).error.includes(aviso), true, caso)
  }
  assertEquals([edificio.archivos.size, edificio.fotos.size], [0, 0])
})

Deno.test('repetir la subida de una foto no duplica nada, y otra foto con el mismo identificador se rechaza', async () => {
  const edificio = edificioDeMentira()
  await edificio.subirFoto('guarda')
  const repetida = await edificio.subirFoto('guarda')
  assertEquals(repetida.status, 200)
  assertEquals((await repetida.json()).yaEstaba, true)

  const otra = await edificio.subirFoto('guarda', {}, new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 1, 2, 3]))
  assertEquals(otra.status, 409)
  assertEquals(edificio.archivos.get(RUTA_FOTO), JPEG)
  assertEquals([edificio.archivos.size, edificio.fotos.size], [1, 1])
})

Deno.test('si falla apuntar la foto tras guardarla, lo dice, y repetir lo arregla', async () => {
  const edificio = edificioDeMentira()
  edificio.fallos.registrarFoto = 1
  const fallida = await enSilencio(() => edificio.subirFoto('guarda'))
  assertEquals(fallida.status, 500)
  assertEquals((await fallida.json()).error.includes('no se duplicará'), true)
  assertEquals([edificio.archivos.size, edificio.fotos.size], [1, 0])

  const repetida = await edificio.subirFoto('guarda')
  assertEquals(repetida.status, 201)
  assertEquals((await repetida.json()).yaEstaba, true)
  assertEquals([edificio.archivos.size, edificio.fotos.size], [1, 1])
})

Deno.test('descarga una foto quien ve su parte', async () => {
  const edificio = edificioDeMentira()
  await edificio.subirFoto('guarda')
  for (const perfil of ['guarda', 'admin'] as const) {
    const respuesta = await edificio.descargarFoto(perfil)
    assertEquals(respuesta.status, 200, perfil)
    assertEquals(new Uint8Array(await respuesta.arrayBuffer()), JPEG)
    assertEquals(respuesta.headers.get('Content-Type'), 'image/jpeg')
    assertEquals(respuesta.headers.get('Cache-Control'), 'private, no-store')
  }
})

Deno.test('una empresa no descarga la foto de un parte ajeno', async () => {
  const edificio = edificioDeMentira()
  await edificio.subirFoto('guarda')
  const cuenta = contarLecturas(edificio)
  const ajena = await edificio.descargarFoto('calor')
  assertEquals(ajena.status, 404)
  assertEquals(cuenta.lecturas, 0, 'no se llega a pedir el archivo a GitHub')
  const inexistente = await edificio.descargarFoto('calor', 'bbbbbbbb-0000-4000-8000-000000000099')
  assertEquals(await ajena.text(), await inexistente.text())
  assertEquals((await edificio.descargarFoto(null)).status, 401)
  assertEquals((await edificio.descargarFoto('guarda', 'fotos/2026/x.jpg')).status, 400)
})

Deno.test('una foto apuntada a otro archivo del repositorio no se descarga', async () => {
  // La base de datos ya lo impide. Esto comprueba que la función lo repite.
  const edificio = edificioDeMentira()
  edificio.archivos.set('indice/partes.csv', new TextEncoder().encode('fecha;instalacion\n'))
  edificio.fotos.set(FOTO, { ruta: 'indice/partes.csv', sha256: 'a'.repeat(64), parte: PARTE_GUARDA })
  const cuenta = contarLecturas(edificio)
  assertEquals((await enSilencio(() => edificio.descargarFoto('guarda'))).status, 404)
  assertEquals(cuenta.lecturas, 0)
})
