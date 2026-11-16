// Quién es la persona conectada y a qué edificio tiene acceso.

import type { SupabaseClient } from '@supabase/supabase-js'

export type Perfil = 'admin' | 'consulta' | 'guarda' | 'empresa'

export const NOMBRE_PERFIL: Record<Perfil, string> = {
  admin: 'Administración',
  consulta: 'Consulta',
  guarda: 'Guarda',
  empresa: 'Empresa',
}

export interface Acceso {
  persona: string
  perfil: Perfil
  edificio: string
  /** La ficha de contacto de la guarda o de la empresa. La administración puede no tenerla. */
  contactoId: string | null
}

/**
 * Lee la ficha de la persona conectada y el nombre de su edificio.
 * Devuelve `null` si su cuenta no está dada de alta en ningún edificio, o está desactivada
 * o caducada: en esos casos la base de datos no le deja ver nada.
 */
export async function leerAcceso(supabase: SupabaseClient, authId: string): Promise<Acceso | null> {
  const usuario = await supabase.from('usuarios').select('nombre, perfil, edificio_id, contacto_id').eq('auth_id', authId).maybeSingle()
  if (usuario.error) throw new Error(`No se pudo leer tu usuario: ${usuario.error.message}`)
  if (!usuario.data) return null

  const edificio = await supabase.from('edificios').select('nombre').eq('id', usuario.data.edificio_id).maybeSingle()
  if (edificio.error) throw new Error(`No se pudo leer el edificio: ${edificio.error.message}`)
  if (!edificio.data) return null

  return {
    persona: usuario.data.nombre, perfil: usuario.data.perfil, edificio: edificio.data.nombre,
    contactoId: usuario.data.contacto_id,
  }
}
