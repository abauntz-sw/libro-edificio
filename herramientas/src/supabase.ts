// Lo que importar habla con Supabase. Siempre con la sesión de una persona y la clave pública:
// la clave de servicio no se usa nunca.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Catalogo, Documento } from './comprobar.ts'

export function conectar(url: string, clavePublica: string): SupabaseClient {
  // La sesión vive solo mientras dura la orden. No se guarda en disco.
  return createClient(url, clavePublica, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * Inicia sesión con el correo de la persona. Supabase le envía un código y `pedirCodigo` se lo pregunta.
 * Si se pasa una contraseña, entra con ella y no se envía ningún correo.
 */
export async function iniciarSesion(
  cliente: SupabaseClient, correo: string, pedirCodigo: () => Promise<string>, contrasena?: string,
): Promise<void> {
  if (contrasena) {
    const { error } = await cliente.auth.signInWithPassword({ email: correo, password: contrasena })
    if (error) throw new Error(`No se pudo iniciar sesión: ${error.message}`)
    return
  }
  const envio = await cliente.auth.signInWithOtp({ email: correo, options: { shouldCreateUser: false } })
  if (envio.error) throw new Error(`No se pudo enviar el código a ${correo}: ${envio.error.message}`)
  const { error } = await cliente.auth.verifyOtp({ email: correo, token: (await pedirCodigo()).trim(), type: 'email' })
  if (error) throw new Error(`El código no vale: ${error.message}`)
}

/** Lanza un error legible si la consulta ha fallado y, si no, devuelve sus filas. */
function filas<T>(respuesta: { data: T[] | null; error: { message: string } | null }, que: string): T[] {
  if (respuesta.error) throw new Error(`No se pudo leer ${que}: ${respuesta.error.message}`)
  return respuesta.data ?? []
}

/** Lee del edificio de la persona conectada lo necesario para comprobar un listado. */
export async function cargarCatalogo(cliente: SupabaseClient): Promise<Catalogo & { repositorio: string }> {
  const { data: sesion } = await cliente.auth.getUser()
  if (!sesion.user) throw new Error('No hay sesión iniciada')

  const [yo] = filas(await cliente.from('usuarios').select('edificio_id, perfil').eq('auth_id', sesion.user.id), 'tu usuario')
  if (!yo) throw new Error('Tu cuenta no está dada de alta en ningún edificio, o está desactivada')
  if (yo.perfil !== 'admin') throw new Error('Solo una persona administradora puede importar documentos')
  const edificioId: string = yo.edificio_id

  const [edificio] = filas(await cliente.from('edificios').select('repositorio').eq('id', edificioId), 'el edificio')
  const tipos = filas(await cliente.from('tipos_documento').select('id'), 'los tipos de documento')
  const instalaciones = filas(
    await cliente.from('instalaciones').select('id, nombre, tipo_id').eq('edificio_id', edificioId), 'las instalaciones')

  // Supabase devuelve como mucho 1000 filas por consulta, así que las huellas se piden por tandas.
  const huellas = new Set<string>()
  const TANDA = 1000
  for (let desde = 0; ; desde += TANDA) {
    const tanda = filas(
      await cliente.from('documentos').select('sha256').eq('edificio_id', edificioId).order('id').range(desde, desde + TANDA - 1),
      'los documentos')
    tanda.forEach(d => huellas.add(d.sha256))
    if (tanda.length < TANDA) break
  }

  return { edificioId, repositorio: edificio?.repositorio ?? '', tipos: tipos.map(t => t.id), instalaciones, huellas }
}

/** Crea la ficha de un documento con `registrar_documento`. Repetirlo con el mismo identificador no duplica nada. */
export async function registrar(cliente: SupabaseClient, doc: Documento, bytes: number | null, commit: string | null): Promise<void> {
  const { error } = await cliente.rpc('registrar_documento', {
    p_id: doc.id,
    p_tipo: doc.tipo,
    p_titulo: doc.titulo,
    p_fecha: doc.fecha,
    p_emisor: doc.emisor,
    p_ruta: doc.ruta,
    p_nombre_original: doc.nombreOriginal,
    p_sha256: doc.sha256,
    p_instalaciones: doc.instalaciones,
    p_caduca: doc.caduca,
    p_tamano_bytes: bytes,
    p_commit_sha: commit,
  })
  if (error) throw new Error(error.message)
}
