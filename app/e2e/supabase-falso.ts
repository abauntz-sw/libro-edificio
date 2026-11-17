// Un Supabase de mentira para los tests de extremo a extremo.
//
// Contesta, desde el propio test, las peticiones que la web hace a Supabase, con datos ficticios.
// Como la base de datos de verdad, ignora un parte cuyo identificador ya tiene (`on conflict do nothing`).
// Así se comprueba lo que importa en la 1.7: cuántas veces llega cada parte.

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

const TABLAS: Record<string, unknown[]> = {
  usuarios: [{ nombre: 'Guarda de Ejemplo', perfil: 'guarda', edificio_id: 'e1', contacto_id: 'c-guarda' }],
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
  modo: Modo = 'aceptar'
  /** Peticiones que no sabe contestar. Si hay alguna, el test lo dice. */
  desconocidas: string[] = []
  private contexto?: BrowserContext
  private sinRed = false

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
    if (tabla && peticion.method() === 'GET' && TABLAS[tabla]) {
      // Con .maybeSingle() la librería pide un solo objeto.
      const unoSolo = (peticion.headers().accept ?? '').includes('vnd.pgrst.object')
      return ruta.fulfill({ status: 200, headers: CORS, json: unoSolo ? TABLAS[tabla][0] : TABLAS[tabla] })
    }

    if (tabla === 'partes' && peticion.method() === 'POST') {
      const fila = peticion.postDataJSON() as Record<string, unknown>
      const id = String(fila.id)
      this.envios.push(id)
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
