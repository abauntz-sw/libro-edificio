import { assertEquals, assertRejects } from '@std/assert'
import { crearGitHub, huellaGit } from '../github.ts'

const REPO = 'organizacion-ficticia/edificio-de-prueba'
const texto = (letras: string) => new TextEncoder().encode(letras)

// Una clave creada para el test. No es de ninguna App real.
const par = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify'],
)
const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', par.privateKey))
const CLAVE = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----\n`

/**
 * Un GitHub de mentira con una rama, como lo guarda Git por dentro: blobs, carpetas y commits.
 * `adelantos`: cuántas veces otro mueve la rama justo antes de que la movamos nosotros.
 */
function githubDeMentira({ adelantos = 0, archivos = new Map<string, Uint8Array>() } = {}) {
  const llamadas: string[] = []
  const blobs = new Map<string, Uint8Array>()
  const carpetas = new Map<string, { path: string; sha: string }[]>()
  const commits = new Map<string, { carpeta: string; mensaje: string }>()
  const estado = { rama: 'commit-0', contador: 0, adelantos, ultimoMensaje: '' }

  const pedir = async (entrada: string | URL | Request, opciones?: RequestInit): Promise<Response> => {
    const url = new URL(String(entrada))
    const metodo = opciones?.method ?? 'GET'
    const camino = url.pathname.replace(`/repos/${REPO}`, '')
    const cuerpo = opciones?.body ? JSON.parse(String(opciones.body)) : undefined
    llamadas.push(`${metodo} ${camino}`)

    if (camino.endsWith('/installation')) return Response.json({ id: 7 })
    if (camino.endsWith('/access_tokens')) {
      return Response.json({ token: 'token-de-prueba', expires_at: new Date(Date.now() + 3_600_000).toISOString() })
    }
    if (camino === '') return Response.json({ default_branch: 'main' })
    if (camino === '/git/ref/heads/main') return Response.json({ object: { sha: estado.rama } })
    if (camino.startsWith('/git/commits/')) return Response.json({ tree: { sha: `carpeta-de-${camino.split('/').pop()}` } })
    if (camino.startsWith('/contents/')) {
      const bytes = archivos.get(decodeURIComponent(camino.replace('/contents/', '')))
      return bytes ? Response.json({ sha: await huellaGit(bytes) }) : new Response(null, { status: 404 })
    }
    if (camino === '/git/blobs') {
      const bytes = Uint8Array.from(atob(cuerpo.content), letra => letra.charCodeAt(0))
      const sha = await huellaGit(bytes)
      blobs.set(sha, bytes)
      return Response.json({ sha }, { status: 201 })
    }
    if (camino === '/git/trees') {
      const sha = `carpeta-${++estado.contador}`
      carpetas.set(sha, cuerpo.tree)
      return Response.json({ sha }, { status: 201 })
    }
    if (camino === '/git/commits') {
      const sha = `commit-${++estado.contador}`
      commits.set(sha, { carpeta: cuerpo.tree, mensaje: cuerpo.message })
      return Response.json({ sha }, { status: 201 })
    }
    if (camino === '/git/refs/heads/main' && metodo === 'PATCH') {
      if (estado.adelantos > 0) {
        // Otro ha escrito a la vez: la rama ya no está donde creíamos.
        estado.adelantos--
        estado.rama = `commit-de-otro-${estado.adelantos}`
        return Response.json({ message: 'Update is not a fast forward' }, { status: 422 })
      }
      const { carpeta, mensaje } = commits.get(cuerpo.sha)!
      for (const pieza of carpetas.get(carpeta)!) archivos.set(pieza.path, blobs.get(pieza.sha)!)
      estado.rama = cuerpo.sha
      estado.ultimoMensaje = mensaje
      return Response.json({ object: { sha: cuerpo.sha } })
    }
    return new Response(null, { status: 404 })
  }

  const github = crearGitHub({ appId: 'app-de-prueba', clavePrivada: CLAVE, fetch: pedir, esperar: async () => {} })
  return { github, archivos, llamadas, estado }
}

const indice = (partes = 'fecha;instalacion\r\n') => new Map([
  ['indice/documentos.csv', texto('ruta;tipo\r\n')],
  ['indice/partes.csv', texto(partes)],
])
const escrituras = (llamadas: string[]) => llamadas.filter(l => l.startsWith('POST /git') || l.startsWith('PATCH'))

Deno.test('la primera vez deja todos los archivos en un solo commit', async () => {
  const { github, archivos, llamadas, estado } = githubDeMentira()
  const cambio = await github.actualizar(REPO, indice(), 'Actualiza el índice')

  assertEquals(cambio.cambiados, ['indice/documentos.csv', 'indice/partes.csv'])
  assertEquals(cambio.commit, estado.rama)
  assertEquals(new TextDecoder().decode(archivos.get('indice/partes.csv')), 'fecha;instalacion\r\n')
  assertEquals(estado.ultimoMensaje, 'Actualiza el índice')
  assertEquals(llamadas.filter(l => l === 'POST /git/commits').length, 1)
})

Deno.test('si nada ha cambiado, no hace commit', async () => {
  const { github, llamadas } = githubDeMentira({ archivos: indice() })
  const cambio = await github.actualizar(REPO, indice(), 'Actualiza el índice')

  assertEquals(cambio, { commit: null, cambiados: [] })
  assertEquals(escrituras(llamadas), [])
})

Deno.test('si cambia un archivo, solo sube ese', async () => {
  const { github, archivos, llamadas } = githubDeMentira({ archivos: indice() })
  const cambio = await github.actualizar(REPO, indice('fecha;instalacion\r\n2026-11-16;Caldera\r\n'), 'Actualiza el índice')

  assertEquals(cambio.cambiados, ['indice/partes.csv'])
  assertEquals(llamadas.filter(l => l === 'POST /git/blobs').length, 1)
  assertEquals(new TextDecoder().decode(archivos.get('indice/partes.csv')), 'fecha;instalacion\r\n2026-11-16;Caldera\r\n')
})

Deno.test('si otro mueve la rama a la vez, empieza otra vez y no pisa su commit', async () => {
  const { github, llamadas, estado } = githubDeMentira({ adelantos: 2 })
  const cambio = await github.actualizar(REPO, indice(), 'Actualiza el índice')

  assertEquals(llamadas.filter(l => l.startsWith('PATCH')).length, 3)
  assertEquals(cambio.commit, estado.rama)
})

Deno.test('si la rama no deja de moverse, se rinde tras cinco intentos', async () => {
  const { github, llamadas } = githubDeMentira({ adelantos: 99 })
  await assertRejects(() => github.actualizar(REPO, indice(), 'Actualiza el índice'), Error, 'mover la rama (422)')
  assertEquals(llamadas.filter(l => l.startsWith('PATCH')).length, 5)
})

Deno.test('no acepta rutas que salen de la carpeta', async () => {
  const { github, llamadas } = githubDeMentira()
  await assertRejects(
    () => github.actualizar(REPO, new Map([['indice/../.github/x.yml', texto('x')]]), 'x'),
    Error,
    'La ruta del archivo no vale',
  )
  assertEquals(escrituras(llamadas), [])
})
