// Lee y escribe archivos en el repositorio privado del edificio, como una GitHub App.
//
// Una GitHub App no tiene contraseña. Tiene una clave privada, y con ella:
//   1. Firma un pase corto que dice «soy la App».
//   2. Lo cambia en GitHub por un token que solo vale una hora y solo para ese repositorio.
//   3. Con ese token lee y escribe archivos.
// La clave privada solo vive en los secretos de la función. Nunca llega al navegador.

import { ErrorHttp } from './ficha.ts'

/** Un fallo de GitHub, con su código de respuesta, para decidir si vale la pena repetir. */
export class ErrorGitHub extends Error {
  constructor(readonly estado: number, mensaje: string) {
    super(mensaje)
  }
}

export interface Escritura {
  /** El commit que ha creado el archivo. */
  commit: string | null
  /** Cierto si ese mismo archivo ya estaba en esa ruta y no ha hecho falta escribirlo. */
  yaEstaba: boolean
}

/** Dónde se guardan los archivos. Los tests usan uno de mentira. */
export interface Almacen {
  escribir(repositorio: string, ruta: string, bytes: Uint8Array<ArrayBuffer>, mensaje: string): Promise<Escritura>
  /** Devuelve el contenido del archivo, o null si no está. */
  leer(repositorio: string, ruta: string): Promise<ReadableStream<Uint8Array> | null>
}

export interface Cambio {
  /** El commit nuevo, o null si todos los archivos ya estaban iguales. */
  commit: string | null
  /** Las rutas que han cambiado. */
  cambiados: string[]
}

/** Lo que usa la exportación diaria: dejar varios archivos a la vez. */
export interface Repositorio {
  /**
   * Deja esos archivos en el repositorio, todos en un solo commit.
   * Si ya estaban iguales, no hace commit: así el historial solo crece cuando algo cambia.
   */
  actualizar(repositorio: string, archivos: Map<string, Uint8Array>, mensaje: string): Promise<Cambio>
}

export interface OpcionesGitHub {
  /** El «App ID» o el «Client ID» de la GitHub App. */
  appId: string
  /** La clave privada de la App, en formato PEM, tal como la descarga GitHub. */
  clavePrivada: string
  fetch?: typeof fetch
  api?: string
  /** Espera unos milisegundos. Los tests la cambian para no esperar de verdad. */
  esperar?: (ms: number) => Promise<void>
}

/** Cuántas veces se intenta una escritura si GitHub responde con conflicto. */
const INTENTOS = 5

const REPOSITORIO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

const base64 = (bytes: Uint8Array): string => {
  // De 3 en 3 bytes, para que los trozos se puedan pegar. Por trozos, para no agotar la memoria.
  const trozos: string[] = []
  for (let i = 0; i < bytes.length; i += 30_000) {
    trozos.push(btoa(String.fromCharCode(...bytes.subarray(i, i + 30_000))))
  }
  return trozos.join('')
}
const base64url = (bytes: Uint8Array) => base64(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
const deTexto = (texto: string) => new TextEncoder().encode(texto)
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')

/** Escribe la longitud de un bloque como pide el formato DER. */
function longitudDer(longitud: number): number[] {
  if (longitud < 0x80) return [longitud]
  const bytes: number[] = []
  for (let resto = longitud; resto > 0; resto >>= 8) bytes.unshift(resto & 0xff)
  return [0x80 | bytes.length, ...bytes]
}

/**
 * Prepara la clave privada para firmar.
 * GitHub la entrega en un formato antiguo (PKCS#1, «BEGIN RSA PRIVATE KEY») que el navegador y Deno no leen.
 * Aquí se envuelve en el formato moderno (PKCS#8). Si ya viene en el moderno, se usa tal cual.
 */
export function importarClave(pem: string): Promise<CryptoKey> {
  // Algunos paneles guardan los saltos de línea como «\n» escrito con dos letras.
  const limpio = pem.replaceAll('\\n', '\n')
  const antigua = limpio.includes('BEGIN RSA PRIVATE KEY')
  const cuerpo = limpio.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '')
  if (cuerpo === '') throw new Error('La clave privada de la GitHub App está vacía o no es un PEM')
  const der = Uint8Array.from(atob(cuerpo), letra => letra.charCodeAt(0))

  let pkcs8 = der
  if (antigua) {
    // Cabecera fija: versión 0 y «esto es una clave RSA». Después va la clave antigua dentro de un bloque.
    const cabecera = [0x02, 0x01, 0x00, 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]
    const contenido = [...cabecera, 0x04, ...longitudDer(der.length), ...der]
    pkcs8 = new Uint8Array([0x30, ...longitudDer(contenido.length), ...contenido])
  }
  return crypto.subtle.importKey('pkcs8', pkcs8, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
}

/** La huella que Git le pone a un archivo. Sirve para saber si dos archivos son el mismo sin descargarlos. */
export async function huellaGit(bytes: Uint8Array): Promise<string> {
  const cabecera = deTexto(`blob ${bytes.length}\0`)
  const todo = new Uint8Array(cabecera.length + bytes.length)
  todo.set(cabecera)
  todo.set(bytes, cabecera.length)
  return hex(await crypto.subtle.digest('SHA-1', todo))
}

export function crearGitHub(opciones: OpcionesGitHub): Almacen & Repositorio {
  const pedir = opciones.fetch ?? fetch
  const api = opciones.api ?? 'https://api.github.com'
  const esperar = opciones.esperar ?? ((ms: number) => new Promise<void>(listo => setTimeout(listo, ms)))

  let clave: Promise<CryptoKey> | undefined
  const tokens = new Map<string, { token: string; caduca: number }>()
  // Las escrituras van de una en una: cada una espera a que acabe la anterior.
  let cola: Promise<unknown> = Promise.resolve()

  const cabeceras = (autorizacion: string, formato = 'application/vnd.github+json') => ({
    Authorization: `Bearer ${autorizacion}`,
    Accept: formato,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'libro-edificio',
  })

  const direccion = (repositorio: string, ruta: string) => {
    if (!REPOSITORIO.test(repositorio)) throw new Error('El repositorio del edificio no tiene la forma organizacion/repo')
    const partes = ruta.split('/')
    if (partes.some(parte => parte === '' || parte === '.' || parte === '..')) throw new Error('La ruta del archivo no vale')
    return `${api}/repos/${repositorio}/contents/${partes.map(encodeURIComponent).join('/')}`
  }

  /** El pase firmado que dice «soy la App». Vale 9 minutos. */
  async function pase(): Promise<string> {
    clave ??= importarClave(opciones.clavePrivada)
    const ahora = Math.floor(Date.now() / 1000)
    const partes = [
      { alg: 'RS256', typ: 'JWT' },
      // Un minuto atrás, por si el reloj de GitHub va algo retrasado.
      { iat: ahora - 60, exp: ahora + 540, iss: opciones.appId },
    ].map(parte => base64url(deTexto(JSON.stringify(parte)))).join('.')
    const firma = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await clave, deTexto(partes))
    return `${partes}.${base64url(new Uint8Array(firma))}`
  }

  /** El token de una hora para un repositorio. Se guarda en memoria y se renueva cuando le quedan 5 minutos. */
  async function token(repositorio: string): Promise<string> {
    const guardado = tokens.get(repositorio)
    if (guardado && guardado.caduca - Date.now() > 5 * 60_000) return guardado.token
    if (!REPOSITORIO.test(repositorio)) throw new Error('El repositorio del edificio no tiene la forma organizacion/repo')

    const firmado = await pase()
    const instalacion = await pedir(`${api}/repos/${repositorio}/installation`, { headers: cabeceras(firmado) })
    if (instalacion.status === 404) throw new Error('La GitHub App no está instalada en el repositorio del edificio')
    if (!instalacion.ok) throw new Error(`GitHub no reconoce la App (${instalacion.status}). Revisa su identificador y su clave`)
    const { id } = await instalacion.json()

    // El token se pide solo para este repositorio y solo para leer y escribir archivos.
    const respuesta = await pedir(`${api}/app/installations/${id}/access_tokens`, {
      method: 'POST',
      headers: cabeceras(firmado),
      body: JSON.stringify({ repositories: [repositorio.split('/')[1]], permissions: { contents: 'write' } }),
    })
    if (!respuesta.ok) throw new Error(`GitHub no ha dado el token de la App (${respuesta.status})`)
    const datos = await respuesta.json()
    tokens.set(repositorio, { token: datos.token, caduca: Date.parse(datos.expires_at) })
    return datos.token
  }

  /** Si la ruta ya tiene un archivo, dice si es el mismo que se quería escribir. */
  async function yaGuardado(repositorio: string, ruta: string, bytes: Uint8Array): Promise<Escritura | null> {
    const url = direccion(repositorio, ruta)
    const actual = await pedir(url, { headers: cabeceras(await token(repositorio), 'application/vnd.github.object+json') })
    if (actual.status === 404) return null
    if (!actual.ok) throw new Error(`GitHub no deja mirar el archivo (${actual.status})`)
    const { sha } = await actual.json()
    if (sha !== await huellaGit(bytes)) throw new ErrorHttp(409, 'Ya hay otro archivo guardado con ese identificador.')

    const historia = await pedir(
      `${api}/repos/${repositorio}/commits?per_page=1&path=${encodeURIComponent(ruta)}`,
      { headers: cabeceras(await token(repositorio)) },
    )
    const commits = historia.ok ? await historia.json() : []
    return { commit: commits[0]?.sha ?? null, yaEstaba: true }
  }

  async function escribirUnaVez(repositorio: string, ruta: string, bytes: Uint8Array, mensaje: string): Promise<Escritura> {
    const url = direccion(repositorio, ruta)
    // GitHub pide el archivo en base64, dentro de un JSON. Se monta por trozos para no copiarlo de más.
    const cuerpo = new Blob([`{"message":${JSON.stringify(mensaje)},"content":"`, base64(bytes), '"}'])

    for (let intento = 1; ; intento++) {
      const respuesta = await pedir(url, {
        method: 'PUT',
        headers: { ...cabeceras(await token(repositorio)), 'Content-Type': 'application/json' },
        body: cuerpo,
      })
      if (respuesta.ok) {
        const datos = await respuesta.json()
        return { commit: datos.commit?.sha ?? null, yaEstaba: false }
      }
      await respuesta.body?.cancel()

      // 422: la ruta ya tiene un archivo. Sin su huella, GitHub no deja pisarlo, y aquí nunca se manda.
      if (respuesta.status === 422) {
        const guardado = await yaGuardado(repositorio, ruta, bytes)
        if (guardado) return guardado
      }
      // 409: otra escritura ha cambiado el repositorio a la vez. Se espera un poco y se repite.
      const repetible = respuesta.status === 409 || respuesta.status >= 500
      if (!repetible || intento === INTENTOS) throw new Error(`GitHub no ha guardado el archivo (${respuesta.status})`)
      await esperar(300 * 2 ** (intento - 1) + Math.random() * 200)
    }
  }

  /** Pide algo a GitHub y devuelve su respuesta en JSON. Si falla, dice qué se estaba haciendo. */
  async function pedirJson(repositorio: string, que: string, camino: string, metodo = 'GET', cuerpo?: unknown) {
    const respuesta = await pedir(`${api}/repos/${repositorio}${camino}`, {
      method: metodo,
      headers: { ...cabeceras(await token(repositorio)), 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    })
    if (!respuesta.ok) {
      await respuesta.body?.cancel()
      throw new ErrorGitHub(respuesta.status, `GitHub no deja ${que} (${respuesta.status})`)
    }
    return respuesta.json()
  }

  /**
   * Un commit con varios archivos. Se hace por piezas, como Git por dentro:
   *   1. Mira a qué commit apunta la rama y compara cada archivo con el que hay allí.
   *   2. Sube cada archivo cambiado (un «blob»).
   *   3. Monta la carpeta nueva (un «tree») sobre la de antes, cambiando solo esos archivos.
   *   4. Crea el commit y mueve la rama hasta él.
   * Si en medio otro ha movido la rama, el paso 4 falla y se empieza otra vez.
   */
  async function actualizarUnaVez(repositorio: string, archivos: Map<string, Uint8Array>, mensaje: string): Promise<Cambio> {
    for (const ruta of archivos.keys()) direccion(repositorio, ruta)
    const { default_branch: rama } = await pedirJson(repositorio, 'ver el repositorio', '')
    const refRama = `/git/refs/heads/${encodeURIComponent(rama)}`

    for (let intento = 1; ; intento++) {
      const { object: { sha: anterior } } = await pedirJson(repositorio, 'ver la rama', `/git/ref/heads/${encodeURIComponent(rama)}`)
      const { tree: { sha: carpeta } } = await pedirJson(repositorio, 'ver el último commit', `/git/commits/${anterior}`)

      const cambiados: string[] = []
      for (const [ruta, bytes] of archivos) {
        const actual = await pedir(`${direccion(repositorio, ruta)}?ref=${anterior}`, {
          headers: cabeceras(await token(repositorio), 'application/vnd.github.object+json'),
        })
        if (actual.status !== 404 && !actual.ok) throw new Error(`GitHub no deja mirar ${ruta} (${actual.status})`)
        const sha = actual.ok ? (await actual.json()).sha : null
        if (actual.status === 404) await actual.body?.cancel()
        if (sha !== await huellaGit(bytes)) cambiados.push(ruta)
      }
      if (cambiados.length === 0) return { commit: null, cambiados }

      const piezas = []
      for (const ruta of cambiados) {
        const blob = await pedirJson(repositorio, 'guardar un archivo', '/git/blobs', 'POST',
          { content: base64(archivos.get(ruta)!), encoding: 'base64' })
        piezas.push({ path: ruta, mode: '100644', type: 'blob', sha: blob.sha })
      }
      const nueva = await pedirJson(repositorio, 'montar la carpeta', '/git/trees', 'POST', { base_tree: carpeta, tree: piezas })
      const commit = await pedirJson(repositorio, 'crear el commit', '/git/commits', 'POST',
        { message: mensaje, tree: nueva.sha, parents: [anterior] })

      try {
        // force: false. Si la rama ya no está en «anterior», GitHub no la mueve y responde 422.
        await pedirJson(repositorio, 'mover la rama', refRama, 'PATCH', { sha: commit.sha, force: false })
        return { commit: commit.sha, cambiados }
      } catch (error) {
        const repetible = error instanceof ErrorGitHub && (error.estado === 409 || error.estado === 422 || error.estado >= 500)
        if (!repetible || intento === INTENTOS) throw error
        await esperar(300 * 2 ** (intento - 1) + Math.random() * 200)
      }
    }
  }

  return {
    actualizar(repositorio, archivos, mensaje) {
      const turno = cola.then(() => actualizarUnaVez(repositorio, archivos, mensaje))
      cola = turno.catch(() => {})
      return turno
    },

    escribir(repositorio, ruta, bytes, mensaje) {
      const turno = cola.then(() => escribirUnaVez(repositorio, ruta, bytes, mensaje))
      cola = turno.catch(() => {})
      return turno
    },

    async leer(repositorio, ruta) {
      const respuesta = await pedir(direccion(repositorio, ruta), {
        headers: cabeceras(await token(repositorio), 'application/vnd.github.raw+json'),
      })
      if (respuesta.status === 404) return null
      if (!respuesta.ok || !respuesta.body) throw new Error(`GitHub no ha entregado el archivo (${respuesta.status})`)
      return respuesta.body
    },
  }
}
