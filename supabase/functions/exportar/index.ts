// Función «exportar»: cada noche deja el índice de cada edificio en su repositorio.
//
//   POST /exportar   con la clave secreta en la cabecera `apikey`. La lanza la tarea programada.
//
// Este archivo solo junta las piezas. Lo que hace está en exportar.ts.
// La parte de GitHub es la misma que usa la función «archivos».

import { createClient } from '@supabase/supabase-js'
import { crearGitHub } from '../archivos/github.ts'
import type { Repositorio } from '../archivos/github.ts'
import { atender } from './exportar.ts'
import type { Libro } from './exportar.ts'

/** Lee un secreto de la función. Si falta, lo dice con su nombre, que no es secreto. */
function secreto(nombre: string): string {
  const valor = Deno.env.get(nombre)
  if (!valor) throw new Error(`Falta el secreto ${nombre}`)
  return valor
}

/** La clave secreta de Supabase. Salta los permisos por filas: solo se usa aquí, nunca en el navegador. */
function claveSecreta(): string {
  const nuevas = Deno.env.get('SUPABASE_SECRET_KEYS')
  return nuevas ? JSON.parse(nuevas).default : secreto('SUPABASE_SERVICE_ROLE_KEY')
}

function crearLibro(): Libro {
  const cliente = createClient(secreto('SUPABASE_URL'), claveSecreta(), { auth: { persistSession: false } })
  return {
    async edificios() {
      const { data, error } = await cliente.from('edificios').select('id, nombre, repositorio').order('nombre')
      if (error) throw new Error(`No se pueden leer los edificios: ${error.message}`)
      return data
    },
    async indice(edificio) {
      const { data, error } = await cliente.rpc('exportar_indice', { p_edificio: edificio })
      if (error) throw new Error(`No se puede preparar el índice: ${error.message}`)
      return data
    },
  }
}

let github: Repositorio | undefined

Deno.serve(peticion =>
  atender(peticion, {
    claveSecreta: claveSecreta(),
    libro: crearLibro(),
    repositorio: github ??= crearGitHub({
      appId: secreto('GITHUB_APP_ID'),
      clavePrivada: secreto('GITHUB_APP_PRIVATE_KEY'),
    }),
  })
)
