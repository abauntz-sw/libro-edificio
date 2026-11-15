import type { SupabaseClient } from '@supabase/supabase-js'
import { type FormEvent, useState } from 'react'

/**
 * Pantalla de entrada. La persona escribe su correo y Supabase le envía un mensaje
 * con un enlace y un código. No hay contraseñas.
 */
export function Entrada({ supabase }: { supabase: SupabaseClient }) {
  const [correo, setCorreo] = useState('')
  const [enviadoA, setEnviadoA] = useState<string | null>(null)
  const [codigo, setCodigo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pedirCodigo(evento: FormEvent) {
    evento.preventDefault()
    setOcupado(true)
    setError(null)
    const destino = correo.trim()
    const { error } = await supabase.auth.signInWithOtp({
      email: destino,
      // Solo entra quien ya está dado de alta. El enlace del correo vuelve a esta misma web.
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
    })
    setOcupado(false)
    // Si el correo no está dado de alta no se dice: así nadie puede averiguar quién tiene cuenta.
    if (error && error.code !== 'otp_disabled') return setError(explicar(error))
    setEnviadoA(destino)
  }

  async function entrar(evento: FormEvent) {
    evento.preventDefault()
    if (!enviadoA) return
    setOcupado(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({ email: enviadoA, token: codigo.trim(), type: 'email' })
    setOcupado(false)
    if (error) setError('El código no vale o ha caducado. Pide otro.')
    // Si ha ido bien, Supabase avisa a App y se cambia de pantalla.
  }

  function otroCorreo() {
    setEnviadoA(null)
    setCodigo('')
    setError(null)
  }

  return (
    <main className="centro">
      <div className="tarjeta pila">
        <h1>Libro del Edificio</h1>

        {enviadoA === null ? (
          <form className="pila" onSubmit={pedirCodigo}>
            <p className="suave">Escribe tu correo y te enviamos un código para entrar.</p>
            <label className="campo">
              Correo
              <input
                type="email" name="correo" autoComplete="email" inputMode="email" required
                value={correo} onChange={e => setCorreo(e.target.value)}
              />
            </label>
            <button className="btn prim grande" disabled={ocupado}>
              {ocupado ? 'Enviando…' : 'Enviar código'}
            </button>
          </form>
        ) : (
          <form className="pila" onSubmit={entrar}>
            <p className="suave">
              Si <b>{enviadoA}</b> está dado de alta, le llegará un mensaje en unos minutos.
              Pulsa el enlace que trae o escribe aquí el código.
            </p>
            <label className="campo">
              Código
              <input
                name="codigo" autoComplete="one-time-code" inputMode="numeric" required
                value={codigo} onChange={e => setCodigo(e.target.value)}
              />
            </label>
            <button className="btn prim grande" disabled={ocupado}>
              {ocupado ? 'Entrando…' : 'Entrar'}
            </button>
            <button type="button" className="btn" onClick={otroCorreo}>Usar otro correo</button>
          </form>
        )}

        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </main>
  )
}

/** Pasa a lenguaje llano los errores de Supabase al pedir el código. */
function explicar(error: { code?: string; status?: number; message: string }): string {
  if (error.status === 429) return 'Se han pedido demasiados códigos. Espera unos minutos y vuelve a probar.'
  if (error.code === 'validation_failed') return 'Ese correo no parece válido.'
  return `No se pudo enviar el código: ${error.message}`
}
