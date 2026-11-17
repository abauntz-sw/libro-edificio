import { assertEquals, assertRejects } from '@std/assert'
import { ErrorHttp } from '../ficha.ts'
import { crearGitHub, huellaGit } from '../github.ts'

const REPO = 'organizacion-ficticia/edificio-de-prueba'
const RUTA = 'documentos/2026/99999999-9999-4999-8999-999999999991.pdf'
const texto = (letras: string) => new TextEncoder().encode(letras)
const PDF = texto('%PDF-1.7 ficticio')

// Una clave creada para el test. No es de ninguna App real.
const par = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify'],
)
const moderna = new Uint8Array(await crypto.subtle.exportKey('pkcs8', par.privateKey))
const pem = (titulo: string, der: Uint8Array) =>
  `-----BEGIN ${titulo}-----\n${btoa(String.fromCharCode(...der)).match(/.{1,64}/g)!.join('\n')}\n-----END ${titulo}-----\n`
const CLAVE_MODERNA = pem('PRIVATE KEY', moderna)
// El formato antiguo, el que entrega GitHub, es el moderno sin sus 26 bytes de cabecera.
const CLAVE_ANTIGUA = pem('RSA PRIVATE KEY', moderna.slice(26))

const deBase64url = (letras: string) =>
  Uint8Array.from(atob(letras.replaceAll('-', '+').replaceAll('_', '/')), letra => letra.charCodeAt(0))

/** Un GitHub de mentira: guarda los archivos en memoria y apunta lo que se le pide. */
function githubDeMentira({ conflictos = 0, instalada = true } = {}) {
  const archivos = new Map<string, Uint8Array>()
  const llamadas: string[] = []
  const estado = { aLaVez: 0, maximoALaVez: 0, permisosPedidos: null as unknown }

  const pedir = async (entrada: string | URL | Request, opciones?: RequestInit): Promise<Response> => {
    const url = new URL(String(entrada))
    const metodo = opciones?.method ?? 'GET'
    const cabeceras = new Headers(opciones?.headers)
    const credencial = (cabeceras.get('Authorization') ?? '').replace('Bearer ', '')
    llamadas.push(`${metodo} ${url.pathname}`)

    if (url.pathname.endsWith('/installation') || url.pathname.endsWith('/access_tokens')) {
      // Aquí GitHub exige el pase firmado por la App.
      const [cabecera, datos, firma] = credencial.split('.')
      const valida = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5', par.publicKey, deBase64url(firma), texto(`${cabecera}.${datos}`),
      )
      const { iss, exp } = JSON.parse(new TextDecoder().decode(deBase64url(datos)))
      if (!valida || iss !== 'app-de-prueba' || exp * 1000 < Date.now()) return new Response(null, { status: 401 })
      if (url.pathname.endsWith('/installation')) {
        return instalada ? Response.json({ id: 7 }) : new Response(null, { status: 404 })
      }
      estado.permisosPedidos = JSON.parse(await new Response(opciones?.body).text())
      return Response.json({ token: 'token-de-prueba', expires_at: new Date(Date.now() + 3_600_000).toISOString() }, { status: 201 })
    }

    if (credencial !== 'token-de-prueba') return new Response(null, { status: 401 })
    if (url.pathname.endsWith('/commits')) return Response.json([{ sha: 'commit-anterior' }])

    const ruta = decodeURIComponent(url.pathname.replace(`/repos/${REPO}/contents/`, ''))
    if (metodo === 'PUT') {
      estado.aLaVez++
      estado.maximoALaVez = Math.max(estado.maximoALaVez, estado.aLaVez)
      const cuerpo = JSON.parse(await new Response(opciones?.body).text())
      estado.aLaVez--
      if (conflictos-- > 0) return new Response(null, { status: 409 })
      if (archivos.has(ruta)) return new Response(null, { status: 422 })
      archivos.set(ruta, Uint8Array.from(atob(cuerpo.content), letra => letra.charCodeAt(0)))
      return Response.json({ commit: { sha: `commit-${archivos.size}` } }, { status: 201 })
    }
    const guardado = archivos.get(ruta)
    if (!guardado) return new Response(null, { status: 404 })
    return cabeceras.get('Accept')?.includes('raw')
      ? new Response(guardado.slice())
      : Response.json({ sha: await huellaGit(guardado) })
  }

  const esperas: number[] = []
  const almacen = (clavePrivada = CLAVE_ANTIGUA) => crearGitHub({
    appId: 'app-de-prueba',
    clavePrivada,
    fetch: pedir,
    api: 'https://github.prueba',
    esperar: ms => { esperas.push(ms); return Promise.resolve() },
  })
  const veces = (llamada: string) => llamadas.filter(una => una.startsWith(llamada)).length
  return { archivos, estado, esperas, almacen, veces }
}

Deno.test('escribe el archivo y devuelve el commit', async () => {
  const github = githubDeMentira()
  const escrito = await github.almacen().escribir(REPO, RUTA, PDF, 'Añade un documento')
  assertEquals(escrito, { commit: 'commit-1', yaEstaba: false })
  assertEquals(github.archivos.get(RUTA), PDF)
})

Deno.test('firma con la clave en el formato de GitHub y en el moderno', async () => {
  for (const clave of [CLAVE_ANTIGUA, CLAVE_MODERNA, CLAVE_ANTIGUA.replaceAll('\n', '\\n')]) {
    const github = githubDeMentira()
    await github.almacen(clave).escribir(REPO, RUTA, PDF, 'Añade un documento')
    assertEquals(github.archivos.size, 1)
  }
})

Deno.test('pide el token solo para ese repositorio y solo para archivos', async () => {
  const github = githubDeMentira()
  await github.almacen().escribir(REPO, RUTA, PDF, 'Añade un documento')
  assertEquals(github.estado.permisosPedidos, { repositories: ['edificio-de-prueba'], permissions: { contents: 'write' } })
})

Deno.test('guarda el token y no lo pide en cada llamada', async () => {
  const github = githubDeMentira()
  const almacen = github.almacen()
  await almacen.escribir(REPO, RUTA, PDF, 'Añade un documento')
  await almacen.leer(REPO, RUTA)
  assertEquals(github.veces('POST /app/installations/7/access_tokens'), 1)
})

Deno.test('reintenta si GitHub responde con conflicto', async () => {
  const github = githubDeMentira({ conflictos: 2 })
  const escrito = await github.almacen().escribir(REPO, RUTA, PDF, 'Añade un documento')
  assertEquals(escrito.yaEstaba, false)
  assertEquals(github.veces('PUT'), 3)
  assertEquals(github.esperas.length, 2)
  // Cada espera es más larga que la anterior.
  assertEquals(github.esperas[1] > github.esperas[0], true)
})

Deno.test('se rinde tras cinco conflictos seguidos', async () => {
  const github = githubDeMentira({ conflictos: 99 })
  await assertRejects(() => github.almacen().escribir(REPO, RUTA, PDF, 'Añade un documento'), Error, '409')
  assertEquals(github.veces('PUT'), 5)
  assertEquals(github.archivos.size, 0)
})

Deno.test('si ese mismo archivo ya estaba, lo da por bueno', async () => {
  const github = githubDeMentira()
  github.archivos.set(RUTA, PDF)
  const escrito = await github.almacen().escribir(REPO, RUTA, PDF, 'Añade un documento')
  assertEquals(escrito, { commit: 'commit-anterior', yaEstaba: true })
})

Deno.test('no pisa un archivo distinto que ya está en esa ruta', async () => {
  const github = githubDeMentira()
  github.archivos.set(RUTA, texto('%PDF-1.7 otro contenido'))
  const error = await assertRejects(() => github.almacen().escribir(REPO, RUTA, PDF, 'Añade un documento'), ErrorHttp)
  assertEquals(error.estado, 409)
  assertEquals(github.archivos.get(RUTA), texto('%PDF-1.7 otro contenido'))
})

Deno.test('las escrituras van de una en una', async () => {
  const github = githubDeMentira()
  const almacen = github.almacen()
  const rutas = [1, 2, 3, 4].map(n => `documentos/2026/${n}.pdf`)
  await Promise.all(rutas.map(ruta => almacen.escribir(REPO, ruta, PDF, 'Añade un documento')))
  assertEquals(github.archivos.size, 4)
  assertEquals(github.estado.maximoALaVez, 1)
})

Deno.test('una escritura fallida no bloquea las siguientes', async () => {
  const github = githubDeMentira()
  const almacen = github.almacen()
  github.archivos.set(RUTA, texto('%PDF-1.7 otro contenido'))
  await assertRejects(() => almacen.escribir(REPO, RUTA, PDF, 'Añade un documento'))
  await almacen.escribir(REPO, 'documentos/2026/otro.pdf', PDF, 'Añade un documento')
  assertEquals(github.archivos.size, 2)
})

Deno.test('lee un archivo, y dice que no está si no está', async () => {
  const github = githubDeMentira()
  github.archivos.set(RUTA, PDF)
  const contenido = await github.almacen().leer(REPO, RUTA)
  assertEquals(new Uint8Array(await new Response(contenido).arrayBuffer()), PDF)
  assertEquals(await github.almacen().leer(REPO, 'documentos/2026/no-esta.pdf'), null)
})

Deno.test('avisa si la App no está instalada en el repositorio', async () => {
  const github = githubDeMentira({ instalada: false })
  await assertRejects(() => github.almacen().leer(REPO, RUTA), Error, 'no está instalada')
})

Deno.test('rechaza rutas y repositorios con mala forma', async () => {
  const almacen = githubDeMentira().almacen()
  await assertRejects(() => almacen.leer(REPO, 'documentos/../../otro'), Error, 'ruta')
  await assertRejects(() => almacen.leer('sin-barra', RUTA), Error, 'organizacion/repo')
  await assertRejects(() => almacen.leer('a/b/c', RUTA), Error, 'organizacion/repo')
})

Deno.test('huellaGit da la misma huella que Git', async () => {
  // Valores de referencia: `git hash-object` de un archivo vacío y de «hello» con salto de línea.
  assertEquals(await huellaGit(new Uint8Array()), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391')
  assertEquals(await huellaGit(texto('hello\n')), 'ce013625030ba8dba906f756967f9e9ca394464a')
})
