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

export interface FotoGuardada { ruta: string; sha256: string; parte: string }

/** Lo que se apunta de una foto al registrarla. */
export interface RegistroFoto {
  id: string
  edificio: string
  parte: string
  ruta: string
  sha256: string
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
  /** La fecha del parte, o null si no existe o si esa persona no puede verlo. */
  fechaParte(id: string): Promise<string | null>
  /** Solo quien escribió el parte puede añadirle fotos, y hasta 7 días después de recibirlo. */
  puedoAdjuntarFoto(parte: string): Promise<boolean>
  /** Si quien escribió el parte ya no puede añadirle fotos por el plazo. A los demás, siempre false. */
  fotoFueraDePlazo(parte: string): Promise<boolean>
  /** La foto, o null si no existe o si esa persona no puede verla. */
  foto(id: string): Promise<FotoGuardada | null>
  registrarFoto(registro: RegistroFoto): Promise<void>
}

interface Fallo { code?: string; message: string }

export function crearLibro(url: string, clavePublica: string, autorizacion: string): Libro {
  const cliente = createClient(url, clavePublica, {
    global: { headers: { Authorization: autorizacion } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  /** Convierte un fallo de la base de datos en un error con su código HTTP. */
  function fallo(error: Fallo, estado: number, sinPermiso = 'No tienes permiso para archivar este documento.'): never {
    // 401 o PGRST301/PGRST303: la sesión no vale o ha caducado.
    if (estado === 401 || error.code === 'PGRST301' || error.code === 'PGRST303') {
      throw new ErrorHttp(401, 'La sesión ha caducado. Vuelve a entrar.')
    }
    // 42501: la base de datos dice que no hay permiso.
    if (error.code === '42501') throw new ErrorHttp(403, sinPermiso)
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

    async fechaParte(id) {
      const { data, error, status } = await cliente.from('partes').select('fecha').eq('id', id).maybeSingle()
      if (error) fallo(error, status)
      return data?.fecha ?? null
    },

    async puedoAdjuntarFoto(parte) {
      const { data, error, status } = await cliente.rpc('puedo_adjuntar_foto', { p_parte: parte })
      if (error) fallo(error, status)
      return data === true
    },

    async fotoFueraDePlazo(parte) {
      const { data, error, status } = await cliente.rpc('foto_fuera_de_plazo', { p_parte: parte })
      if (error) fallo(error, status)
      return data === true
    },

    async foto(id) {
      const { data, error, status } = await cliente
        .from('parte_fotos').select('ruta, sha256, parte_id').eq('id', id).maybeSingle()
      if (error) fallo(error, status)
      return data && { ruta: data.ruta, sha256: data.sha256, parte: data.parte_id }
    },

    async registrarFoto(registro) {
      // Un insert directo: la política de parte_fotos comprueba que el parte sea de quien llama,
      // y la regla de la tabla, que la ruta sea la de esa foto.
      const { error, status } = await cliente.from('parte_fotos').insert({
        id: registro.id,
        edificio_id: registro.edificio,
        parte_id: registro.parte,
        ruta: registro.ruta,
        sha256: registro.sha256,
      })
      // 23505: ya hay una foto con ese identificador, que esta persona no ve (si la viera, se habría visto antes).
      if (error?.code === '23505') throw new ErrorHttp(409, 'Ya hay otra foto con ese identificador.')
      if (error) fallo(error, status, 'No puedes añadir fotos a ese parte.')
    },
  }
}
