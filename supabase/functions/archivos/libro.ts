// Lo que la función pregunta a la base de datos.
//
// Todo se pregunta con la sesión de la persona que llama, no con la clave de servicio.
// Así es la propia base de datos la que decide qué ve y qué puede hacer cada uno.

import { createClient } from '@supabase/supabase-js'
import { ErrorHttp, type Ficha } from './ficha.ts'

export interface Edificio { id: string; repositorio: string }

export interface DocumentoGuardado { ruta: string; nombreOriginal: string; sha256: string }

/** Lo que se apunta de un documento al registrarlo. */
export interface Registro extends Ficha {
  ruta: string
  sha256: string
  tamanoBytes: number
  commit: string | null
}

/** La base de datos, vista por una persona. Los tests usan una de mentira. */
export interface Libro {
  /** El edificio de quien llama, o null si su cuenta no tiene acceso. */
  edificio(): Promise<Edificio | null>
  puedoArchivar(instalaciones: string[]): Promise<boolean>
  existeTipo(tipo: string): Promise<boolean>
  /** Cuántas de esas instalaciones existen y son de su edificio. */
  cuentaInstalaciones(ids: string[]): Promise<number>
  /** El documento, o null si no existe o si esa persona no puede verlo. */
  documento(id: string): Promise<DocumentoGuardado | null>
  registrar(registro: Registro): Promise<void>
}

interface Fallo { code?: string; message: string }

export function crearLibro(url: string, clavePublica: string, autorizacion: string): Libro {
  const cliente = createClient(url, clavePublica, {
    global: { headers: { Authorization: autorizacion } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  /** Convierte un fallo de la base de datos en un error con su código HTTP. */
  function fallo(error: Fallo, estado: number): never {
    // 401 o PGRST301/PGRST303: la sesión no vale o ha caducado.
    if (estado === 401 || error.code === 'PGRST301' || error.code === 'PGRST303') {
      throw new ErrorHttp(401, 'La sesión ha caducado. Vuelve a entrar.')
    }
    // 42501: la base de datos dice que no hay permiso.
    if (error.code === '42501') throw new ErrorHttp(403, 'No tienes permiso para archivar este documento.')
    throw new Error(`La base de datos ha fallado (${error.code ?? estado}): ${error.message}`)
  }

  return {
    async edificio() {
      const { data, error, status } = await cliente.from('edificios').select('id, repositorio').maybeSingle()
      if (error) fallo(error, status)
      return data
    },

    async puedoArchivar(instalaciones) {
      const { data, error, status } = await cliente.rpc('puedo_archivar', { p_instalaciones: instalaciones })
      if (error) fallo(error, status)
      return data === true
    },

    async existeTipo(tipo) {
      const { data, error, status } = await cliente.from('tipos_documento').select('id').eq('id', tipo).maybeSingle()
      if (error) fallo(error, status)
      return data !== null
    },

    async cuentaInstalaciones(ids) {
      if (ids.length === 0) return 0
      const { data, error, status } = await cliente.from('instalaciones').select('id').in('id', ids)
      if (error) fallo(error, status)
      return data?.length ?? 0
    },

    async documento(id) {
      const { data, error, status } = await cliente
        .from('documentos').select('ruta, nombre_original, sha256').eq('id', id).maybeSingle()
      if (error) fallo(error, status)
      return data && { ruta: data.ruta, nombreOriginal: data.nombre_original, sha256: data.sha256 }
    },

    async registrar(registro) {
      const { error, status } = await cliente.rpc('registrar_documento', {
        p_id: registro.id,
        p_tipo: registro.tipo,
        p_titulo: registro.titulo,
        p_fecha: registro.fecha,
        p_emisor: registro.emisor,
        p_ruta: registro.ruta,
        p_nombre_original: registro.nombreOriginal,
        p_sha256: registro.sha256,
        p_instalaciones: registro.instalaciones,
        p_caduca: registro.caduca,
        p_tamano_bytes: registro.tamanoBytes,
        p_commit_sha: registro.commit,
      })
      if (error) fallo(error, status)
    },
  }
}
