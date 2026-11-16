import type { SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { type Acceso, leerAcceso, NOMBRE_PERFIL } from './acceso.ts'
import { Huecos } from './Huecos.tsx'
import { Parte } from './Parte.tsx'
import { Subir } from './Subir.tsx'

type Carga =
  | { paso: 'cargando' }
  | { paso: 'listo'; acceso: Acceso }
  | { paso: 'sin-acceso' }
  | { paso: 'error'; mensaje: string }

/** Lo que se ve tras iniciar sesión: el nombre del edificio, el informe de huecos la subida de documentos y los partes. */
export function Inicio({ supabase, authId }: { supabase: SupabaseClient; authId: string }) {
  const [carga, setCarga] = useState<Carga>({ paso: 'cargando' })
  const [intento, setIntento] = useState(0)
  const [pantalla, setPantalla] = useState<'inicio' | 'huecos' | 'subir' | 'parte'>('inicio')

  useEffect(() => {
    // Si la persona sale antes de que llegue la respuesta, la respuesta se descarta.
    let vigente = true
    leerAcceso(supabase, authId).then(
      acceso => vigente && setCarga(acceso ? { paso: 'listo', acceso } : { paso: 'sin-acceso' }),
      (error: Error) => vigente && setCarga({
        paso: 'error',
        mensaje: navigator.onLine ? error.message : 'No hay conexión. Cuando vuelva, pulsa Reintentar.',
      }),
    )
    return () => { vigente = false }
  }, [supabase, authId, intento])

  function reintentar() {
    setCarga({ paso: 'cargando' })
    setIntento(n => n + 1)
  }

  const acceso = carga.paso === 'listo' ? carga.acceso : null

  return (
    <>
      <header>
        <div className="cab ancho gutter">
          <div className="marca">
            <b>Libro del Edificio</b>
            {acceso && <span>{acceso.edificio}</span>}
          </div>
          <div className="fila peq suave">
            {acceso && <span>{acceso.persona} · {NOMBRE_PERFIL[acceso.perfil]}</span>}
            {/* scope 'local': cierra la sesión solo en este aparato. */}
            <button className="btn" onClick={() => supabase.auth.signOut({ scope: 'local' })}>Salir</button>
          </div>
        </div>
      </header>

      <main className="ancho gutter pila">
        {carga.paso === 'cargando' && <p className="suave">Cargando el edificio…</p>}

        {carga.paso === 'listo' && pantalla === 'inicio' && (
          <>
            <h1>Inicio</h1>
            <p>Has entrado en el Libro de <b>{carga.acceso.edificio}</b>.</p>
            <p className="suave">La aplicación está en construcción. Pronto verás aquí los documentos y las revisiones.</p>
            <div className="fila">
              {/* La consulta solo mira: no registra partes. */}
              {carga.acceso.perfil !== 'consulta' && (
                <button className="btn prim" onClick={() => setPantalla('parte')}>Registrar parte</button>
              )}
              <button className="btn" onClick={() => setPantalla('huecos')}>Ver qué documentos faltan</button>
              {/* Solo la administración y las empresas pueden archivar. La base de datos lo comprueba igualmente. */}
              {puedeSubir(carga.acceso) && <button className="btn" onClick={() => setPantalla('subir')}>Subir documentos</button>}
            </div>
          </>
        )}

        {carga.paso === 'listo' && pantalla === 'huecos' && (
          <Huecos supabase={supabase} volver={() => setPantalla('inicio')} />
        )}

        {carga.paso === 'listo' && pantalla === 'parte' && (
          <Parte supabase={supabase} acceso={carga.acceso} volver={() => setPantalla('inicio')} />
        )}

        {carga.paso === 'listo' && pantalla === 'subir' && (
          <Subir supabase={supabase} esEmpresa={carga.acceso.perfil === 'empresa'} volver={() => setPantalla('inicio')} />
        )}

        {carga.paso === 'sin-acceso' && (
          <>
            <h1>No tienes acceso</h1>
            <p>Tu cuenta no está dada de alta en ningún edificio, o está desactivada. Habla con la persona que administra el Libro.</p>
          </>
        )}

        {carga.paso === 'error' && (
          <>
            <h1>No se pudo cargar</h1>
            <p className="error" role="alert">{carga.mensaje}</p>
            <div><button className="btn prim" onClick={reintentar}>Reintentar</button></div>
          </>
        )}
      </main>
    </>
  )
}

const puedeSubir = (acceso: Acceso) => acceso.perfil === 'admin' || acceso.perfil === 'empresa'
