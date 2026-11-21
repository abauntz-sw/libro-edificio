// Función «archivos»: sube y descarga los documentos del repositorio privado del edificio.
//
//   POST /archivos            con el archivo y su ficha: lo guarda y crea la ficha.
//   POST /archivos            con una foto y su parte: la guarda y la apunta en el parte.
//   GET  /archivos?id=...     devuelve el documento, si quien lo pide puede verlo.
//   GET  /archivos?foto=...   devuelve la foto, si quien la pide ve su parte.
//
// Este archivo solo junta las piezas. Lo que hace cada una está en los demás.

import { crearGitHub } from './github.ts'
import { crearLibro } from './libro.ts'
import { atender } from './peticion.ts'
import type { Almacen } from './github.ts'

/** Lee un secreto de la función. Si falta, lo dice con su nombre, que no es secreto. */
function secreto(nombre: string): string {
  const valor = Deno.env.get(nombre)
  if (!valor) throw new Error(`Falta el secreto ${nombre}`)
  return valor
}

/** La clave pública de Supabase. Sin la sesión de una persona no da acceso a nada. */
function clavePublica(): string {
  const nuevas = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
  return nuevas ? JSON.parse(nuevas).default : secreto('SUPABASE_ANON_KEY')
}

let github: Almacen | undefined

Deno.serve(peticion =>
  atender(peticion, {
    libro: autorizacion => crearLibro(secreto('SUPABASE_URL'), clavePublica(), autorizacion),
    almacen: () => github ??= crearGitHub({
      appId: secreto('GITHUB_APP_ID'),
      clavePrivada: secreto('GITHUB_APP_PRIVATE_KEY'),
    }),
  })
)
