// Un Supabase de mentira para los tests de extremo a extremo.
//
// Contesta, desde el propio test, las peticiones que la web hace a Supabase, con datos ficticios.
// Como la base de datos de verdad, ignora un parte cuyo identificador ya tiene (`on conflict do nothing`).
// Así se comprueba lo que importa en la 1.7: cuántas veces llega cada parte.
// También contesta por la función «archivos», para los certificados y las fotos de los partes,
// y para bajar los documentos del Archivo.

import type { BrowserContext, Page, Route } from '@playwright/test'
import { leerCabeceraJpeg } from '../src/cabecera-jpeg.ts'

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

/** Cómo contesta al subir una foto. */
export type ModoFotos =
  /** La guarda y responde bien. */
  | 'aceptar'
  /** La rechaza como la función cuando el parte se recibió hace más de 7 días. */
  | 'fuera-de-plazo'

/** Con qué perfil entra el test. La guarda no puede adjuntar certificados; la administración, sí. */
export type PerfilFalso = 'guarda' | 'admin'

const USUARIOS: Record<PerfilFalso, unknown> = {
  guarda: { id: 'u-guarda', nombre: 'Guarda de Ejemplo', perfil: 'guarda', edificio_id: 'e1', contacto_id: 'c-guarda' },
  admin: { id: 'u-admin', nombre: 'Administración de Ejemplo', perfil: 'admin', edificio_id: 'e1', contacto_id: null },
}

const TABLAS: Record<string, unknown[]> = {
  edificios: [{ nombre: 'Albergue de Ejemplo (ficticio)' }],
  instalaciones: [{ id: 'i-incendios', nombre: 'Protección contra incendios' }, { id: 'i-calor', nombre: 'Calefacción y agua caliente' }],
  tipos_documento: [{ id: 'certificado', nombre: 'Certificado' }, { id: 'contrato-mantenimiento', nombre: 'Contrato de mantenimiento' }, { id: 'licencia', nombre: 'Licencia' }],
  revisiones: [{
    id: 'r-extintores', instalacion_id: 'i-incendios', descripcion: 'Revisión de extintores y equipos por el titular',
    periodicidad_meses: 3, responsable_id: 'c-guarda', proxima: '2026-12-15',
  }],
}

/** Un documento del Archivo, como lo devuelve la base de datos con sus instalaciones. */
export interface DocumentoFalso {
  id: string; tipo_id: string; titulo: string; fecha: string; emisor: string; caduca: string | null
  nombre_original: string; eliminado_en: string | null; eliminado_por: string | null
  documento_instalaciones: { instalacion_id: string }[]
}

/** Una fecha a tantos días de hoy, como 2026-11-23. */
const aDias = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10)

/** Unos documentos ficticios: uno caducado, uno que caduca pronto, uno vigente y uno de todo el edificio. */
const documentosDeEjemplo = (): DocumentoFalso[] => [
  ['d-calor', 'contrato-mantenimiento', 'Contrato de calefacción', aDias(-400), 'Calor Ficticio SL', aDias(-30), 'contrato_calefaccion.pdf', ['i-calor']],
  ['d-extintores', 'certificado', 'Revisión anual de extintores', aDias(-300), 'Extintores Ficticios SL', aDias(40), 'extintores ultima.pdf', ['i-incendios']],
  ['d-caldera', 'certificado', 'Revisión de la caldera', aDias(-20), 'Calor Ficticio SL', aDias(345), 'scan0015.pdf', ['i-calor']],
  ['d-licencia', 'licencia', 'Licencia de actividad', '2021-06-02', 'Ayuntamiento de Villaficticia', null, 'scan0013.pdf', []],
].map(([id, tipo_id, titulo, fecha, emisor, caduca, nombre_original, instalaciones]) => ({
  id, tipo_id, titulo, fecha, emisor, caduca, nombre_original, eliminado_en: null, eliminado_por: null,
  documento_instalaciones: (instalaciones as string[]).map(instalacion_id => ({ instalacion_id })),
}) as DocumentoFalso)

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
  /** Lo que llega al servidor, en orden: «certificado <id>», «parte <id>» o «foto <id>». */
  llegadas: string[] = []
  /** Los certificados guardados, por identificador, con su ficha. */
  certificados = new Map<string, Record<string, string | string[]>>()
  /** Las fotos guardadas, por identificador: su parte y sus bytes tal como llegan. */
  fotos = new Map<string, { parte: string; bytes: Buffer }>()
  /** Los documentos del Archivo y de la Papelera. Se cambian al mandarlos a la papelera o recuperarlos. */
  documentos = documentosDeEjemplo()
  /** Los documentos que se han bajado, por identificador, en orden. */
  bajados: string[] = []
  modo: Modo = 'aceptar'
  modoFotos: ModoFotos = 'aceptar'
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

    if (tabla === 'documentos') return this.contestarDocumentos(ruta, url)

    if (url.pathname === '/functions/v1/archivos' && peticion.method() === 'GET') {
      // Como la función de verdad: entrega el PDF de un documento que se ve, y si no, 404.
      const id = url.searchParams.get('id') ?? ''
      this.bajados.push(id)
      const documento = this.documentos.find(d => d.id === id && d.eliminado_en === null)
      if (!documento) return ruta.fulfill({ status: 404, headers: CORS, json: { error: 'No se encuentra ese documento.' } })
      return ruta.fulfill({
        status: 200, headers: { ...CORS, 'content-type': 'application/pdf' }, body: Buffer.from(`%PDF-1.7 ${documento.titulo}`),
      })
    }

    if (url.pathname === '/functions/v1/archivos' && peticion.method() === 'POST') {
      // Como la función de verdad: repetir la subida del mismo documento o de la misma foto no la duplica.
      const { campos, archivo } = leerFormulario(peticion.postDataBuffer() ?? Buffer.alloc(0), peticion.headers()['content-type'] ?? '')
      const id = String(campos.id)
      if (campos.parte !== undefined) {
        this.llegadas.push(`foto ${id}`)
        if (this.modoFotos === 'fuera-de-plazo') {
          return ruta.fulfill({ status: 403, headers: CORS, json: { error: 'Ese parte se recibió hace más de 7 días y ya no admite fotos.' } })
        }
        const yaEstaba = this.fotos.has(id)
        if (!yaEstaba) this.fotos.set(id, { parte: String(campos.parte), bytes: archivo ?? Buffer.alloc(0) })
        return ruta.fulfill({ status: yaEstaba ? 200 : 201, headers: CORS, json: { id, yaEstaba } })
      }
      this.llegadas.push(`certificado ${id}`)
      const yaEstaba = this.certificados.has(id)
      if (!yaEstaba) this.certificados.set(id, campos)
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

  /**
   * La tabla `documentos`: leer el Archivo o la Papelera (por `eliminado_en`) y cambiar `eliminado_en`.
   * No mira permisos: eso lo decide la base de datos de verdad, y lo comprueba comprobar.mjs.
   */
  private async contestarDocumentos(ruta: Route, url: URL) {
    const peticion = ruta.request()
    const filtro = url.searchParams.get('eliminado_en')
    if (peticion.method() === 'GET') {
      const filas = this.documentos.filter(d => filtro === 'is.null' ? d.eliminado_en === null : filtro === 'not.is.null' ? d.eliminado_en !== null : true)
      return ruta.fulfill({ status: 200, headers: CORS, json: ordenar(filas, url.searchParams.get('order') ?? '') })
    }
    if (peticion.method() === 'PATCH') {
      const id = url.searchParams.get('id')?.replace(/^eq\./, '')
      const documento = this.documentos.find(d => d.id === id)
      if (documento) Object.assign(documento, peticion.postDataJSON())
      // Con count: 'exact', la librería lee cuántas filas han cambiado de Content-Range.
      return ruta.fulfill({ status: 204, headers: { ...CORS, 'content-range': `*/${documento ? 1 : 0}` }, body: '' })
    }
    this.desconocidas.push(`${peticion.method()} ${url.pathname}`)
    return ruta.fulfill({ status: 404, headers: CORS, json: { message: 'No existe en el Supabase de mentira' } })
  }
}

/** Ordena como PostgREST: `order=fecha.desc,id.asc`. */
function ordenar<T extends object>(filas: T[], orden: string): T[] {
  const criterios = orden.split(',').filter(c => c !== '').map(c => c.split('.') as [keyof T, string])
  return [...filas].sort((a, b) => {
    for (const [campo, sentido] of criterios) {
      const x = String(a[campo] ?? ''), y = String(b[campo] ?? '')
      if (x !== y) return (x < y ? -1 : 1) * (sentido === 'desc' ? -1 : 1)
    }
    return 0
  })
}

/**
 * Lee los campos de texto de un formulario multipart. De un archivo, guarda su nombre y su contenido como texto,
 * que basta para los PDF ficticios de los tests, y aparte sus bytes, para las fotos.
 */
function leerFormulario(cuerpo: Buffer, tipo: string): { campos: Record<string, string | string[]>; archivo?: Buffer } {
  const frontera = tipo.match(/boundary=(.+)$/)?.[1]
  const campos: Record<string, string | string[]> = {}
  let bytes: Buffer | undefined
  if (!frontera) return { campos }
  for (const parte of cuerpo.toString('latin1').split(`--${frontera}`)) {
    const [cabecera, ...resto] = parte.split('\r\n\r\n')
    const nombre = cabecera.match(/name="([^"]+)"/)?.[1]
    if (!nombre) continue
    const crudo = Buffer.from(resto.join('\r\n\r\n').replace(/\r\n$/, ''), 'latin1')
    const valor = crudo.toString('utf8')
    const archivo = cabecera.match(/filename="([^"]*)"/)?.[1]
    if (archivo !== undefined) {
      campos.nombre_archivo = Buffer.from(archivo, 'latin1').toString('utf8')
      campos.contenido = valor
      bytes = crudo
      continue
    }
    const previo = campos[nombre]
    campos[nombre] = previo === undefined ? valor : [...[previo].flat(), valor]
  }
  return { campos, archivo: bytes }
}

/** El ancho y el alto de un JPEG, leídos de su cabecera con el mismo lector que usa la app. */
export function medidasJpeg(bytes: Buffer): { ancho: number; alto: number } | null {
  const cabecera = leerCabeceraJpeg(bytes)
  return cabecera && { ancho: cabecera.ancho, alto: cabecera.alto }
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
