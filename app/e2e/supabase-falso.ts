// Un Supabase de mentira para los tests de extremo a extremo.
//
// Contesta, desde el propio test, las peticiones que la web hace a Supabase, con datos ficticios.
// Como la base de datos de verdad, ignora un parte cuyo identificador ya tiene (`on conflict do nothing`).
// Así se comprueba lo que importa en la 1.7: cuántas veces llega cada parte.
// También contesta por la función «archivos», para los certificados de los partes.

import type { BrowserContext, Page, Route } from '@playwright/test'

export const SUPABASE = 'http://supabase.prueba'
const GUARDA = '33333333-3333-4333-8333-333333333333'

/** Cómo contesta al enviar un parte. */
export type Modo =
  /** Lo guarda y responde bien. */
  | 'aceptar'
  /** Lo guarda, pero la respuesta no llega: como si se cortara la cobertura justo después. */
  | 'perder-respuesta'
  /** Lo rechaza como la base de datos cuando no hay permiso. */
  | 'rechazar'

/** Con qué perfil entra el test. La guarda no puede adjuntar certificados; la administración, sí. */
export type PerfilFalso = 'guarda' | 'admin'

const USUARIOS: Record<PerfilFalso, unknown> = {
  guarda: { nombre: 'Guarda de Ejemplo', perfil: 'guarda', edificio_id: 'e1', contacto_id: 'c-guarda' },
  admin: { nombre: 'Administración de Ejemplo', perfil: 'admin', edificio_id: 'e1', contacto_id: null },
}

const TABLAS: Record<string, unknown[]> = {
  edificios: [{ nombre: 'Albergue de Ejemplo (ficticio)' }],
  instalaciones: [{ id: 'i-incendios', nombre: 'Protección contra incendios' }],
  revisiones: [{
    id: 'r-extintores', instalacion_id: 'i-incendios', descripcion: 'Revisión de extintores y equipos por el titular',
    periodicidad_meses: 3, responsable_id: 'c-guarda', proxima: '2026-12-15',
  }],
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }

/** Una sesión con forma de verdad, que no caduca durante el test. Supabase no la comprueba aquí: no hay Supabase. */
function sesion() {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const exp = Math.floor(Date.now() / 1000) + 24 * 3600
  return {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: GUARDA, role: 'authenticated', exp })}.firma`,
    refresh_token: 'renovar', token_type: 'bearer', expires_in: 24 * 3600, expires_at: exp,
    user: { id: GUARDA, aud: 'authenticated', role: 'authenticated', email: 'guarda@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  }
}

export class SupabaseFalso {
  /** Los partes guardados, por identificador. */
  partes = new Map<string, Record<string, unknown>>()
  /** Cada envío de un parte que ha llegado al servidor, con su identificador. Incluye los repetidos. */
  envios: string[] = []
  /** Lo que llega al servidor, en orden: «certificado <id>» o «parte <id>». */
  llegadas: string[] = []
  /** Los certificados guardados, por identificador, con su ficha. */
  certificados = new Map<string, Record<string, string | string[]>>()
  modo: Modo = 'aceptar'
  /** Peticiones que no sabe contestar. Si hay alguna, el test lo dice. */
  desconocidas: string[] = []
  private contexto?: BrowserContext
  private sinRed = false
  private perfil: PerfilFalso

  constructor(perfil: PerfilFalso = 'guarda') {
    this.perfil = perfil
  }

  /**
   * Corta o devuelve la red. Playwright deja el navegador sin conexión, pero sigue pasando las peticiones
   * a este Supabase de mentira, así que también tiene que dejar de contestar.
   */
  async red(hay: boolean) {
    this.sinRed = !hay
    await this.contexto?.setOffline(!hay)
  }

  /** Contesta por Supabase en todo el contexto y deja la sesión de la guarda en el navegador. */
  async instalar(contexto: BrowserContext) {
    await contexto.addInitScript(([clave, valor]) => {
      // Solo la primera vez: si el test recarga la página, la sesión ya está.
      if (!localStorage.getItem(clave)) localStorage.setItem(clave, valor)
    }, ['sb-supabase-auth-token', JSON.stringify(sesion())])
    this.contexto = contexto
    await contexto.route(`${SUPABASE}/**`, ruta => this.contestar(ruta))
  }

  private async contestar(ruta: Route) {
    const peticion = ruta.request()
    const url = new URL(peticion.url())
    if (this.sinRed) return ruta.abort('internetdisconnected')
    if (peticion.method() === 'OPTIONS') return ruta.fulfill({ status: 204, headers: CORS })

    const tabla = url.pathname.match(/^\/rest\/v1\/(\w+)$/)?.[1]
    const filas = tabla === 'usuarios' ? [USUARIOS[this.perfil]] : tabla && TABLAS[tabla]
    if (filas && peticion.method() === 'GET') {
      // Con .maybeSingle() la librería pide un solo objeto.
      const unoSolo = (peticion.headers().accept ?? '').includes('vnd.pgrst.object')
      return ruta.fulfill({ status: 200, headers: CORS, json: unoSolo ? filas[0] : filas })
    }

    if (url.pathname === '/functions/v1/archivos' && peticion.method() === 'POST') {
      // Como la función de verdad: repetir la subida del mismo documento no lo duplica.
      const ficha = leerFormulario(peticion.postDataBuffer() ?? Buffer.alloc(0), peticion.headers()['content-type'] ?? '')
      const id = String(ficha.id)
      this.llegadas.push(`certificado ${id}`)
      const yaEstaba = this.certificados.has(id)
      if (!yaEstaba) this.certificados.set(id, ficha)
      return ruta.fulfill({ status: yaEstaba ? 200 : 201, headers: CORS, json: { id, yaEstaba } })
    }

    if (tabla === 'partes' && peticion.method() === 'POST') {
      const fila = peticion.postDataJSON() as Record<string, unknown>
      const id = String(fila.id)
      this.envios.push(id)
      this.llegadas.push(`parte ${id}`)
      if (this.modo === 'rechazar') {
        return ruta.fulfill({ status: 403, headers: CORS, json: { code: '42501', message: 'new row violates row-level security policy for table "partes"', details: null, hint: null } })
      }
      if (!this.partes.has(id)) this.partes.set(id, fila)
      if (this.modo === 'perder-respuesta') return ruta.abort('connectionreset')
      return ruta.fulfill({ status: 201, headers: CORS, body: '' })
    }

    this.desconocidas.push(`${peticion.method()} ${url.pathname}`)
    return ruta.fulfill({ status: 404, headers: CORS, json: { message: 'No existe en el Supabase de mentira' } })
  }
}

/**
 * Lee los campos de texto de un formulario multipart. De un archivo, guarda su nombre y su contenido como texto.
 * Basta para los PDF ficticios de los tests.
 */
function leerFormulario(cuerpo: Buffer, tipo: string): Record<string, string | string[]> {
  const frontera = tipo.match(/boundary=(.+)$/)?.[1]
  const campos: Record<string, string | string[]> = {}
  if (!frontera) return campos
  for (const parte of cuerpo.toString('latin1').split(`--${frontera}`)) {
    const [cabecera, ...resto] = parte.split('\r\n\r\n')
    const nombre = cabecera.match(/name="([^"]+)"/)?.[1]
    if (!nombre) continue
    const valor = Buffer.from(resto.join('\r\n\r\n').replace(/\r\n$/, ''), 'latin1').toString('utf8')
    const archivo = cabecera.match(/filename="([^"]*)"/)?.[1]
    if (archivo !== undefined) { campos.nombre_archivo = Buffer.from(archivo, 'latin1').toString('utf8'); campos.contenido = valor; continue }
    const previo = campos[nombre]
    campos[nombre] = previo === undefined ? valor : [...[previo].flat(), valor]
  }
  return campos
}

/** Abre la web y espera a Inicio. */
export async function abrir(pagina: Page) {
  await pagina.goto('/')
  await pagina.getByRole('heading', { name: 'Inicio' }).waitFor()
}

/** Rellena un parte que cierra la revisión de extintores. */
export async function rellenarParte(pagina: Page, frase: string) {
  await pagina.getByRole('button', { name: 'Protección contra incendios' }).click()
  await pagina.getByRole('button', { name: /Revisión de extintores/ }).click()
  await pagina.getByRole('button', { name: 'Comprobación' }).click()
  await pagina.getByLabel('Cuéntalo en una frase').fill(frase)
}
