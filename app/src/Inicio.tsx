import type { SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useMemo, useState } from 'react'
import { type Acceso, leerAcceso, NOMBRE_PERFIL } from './acceso.ts'
import { almacenIndexedDB, Cola, pedirAlmacenPersistente, type Recuento } from './cola.ts'
import { Huecos } from './Huecos.tsx'
import { Parte } from './Parte.tsx'
import { enviarParte } from './parte.ts'
import { Pendientes } from './Pendientes.tsx'
import { CLAVE, conRecuerdo } from './recuerdo.ts'
import { Subir } from './Subir.tsx'

type Carga =
  | { paso: 'cargando' }
  /** `deMemoria`: sin conexión, con los datos de la última vez. */
  | { paso: 'listo'; acceso: Acceso; deMemoria: boolean }
  | { paso: 'sin-acceso' }
  | { paso: 'error'; mensaje: string }

/** Lo que se ve tras iniciar sesión: el nombre del edificio, el informe de huecos, la subida de documentos y los partes. */
export function Inicio({ supabase, authId }: { supabase: SupabaseClient; authId: string }) {
  const [carga, setCarga] = useState<Carga>({ paso: 'cargando' })
  const [intento, setIntento] = useState(0)
  const [pantalla, setPantalla] = useState<'inicio' | 'huecos' | 'subir' | 'parte'>('inicio')
  // La cola de partes de este móvil. Ver cola.ts.
  const cola = useMemo(() => new Cola(almacenIndexedDB(),
    (fila, certificado, fotos, llega, parteLlegado) => enviarParte(supabase, fila, certificado, fotos, llega, parteLlegado)), [supabase])
  const [recuento, setRecuento] = useState<Recuento>({ pendientes: 0, rechazados: [] })

  useEffect(() => {
    let vigente = true
    const contar = () => { cola.recuento(authId).then(r => vigente && setRecuento(r), () => {}) }
    const dejar = cola.escuchar(contar)
    // Se reintenta al abrir, al volver la conexión y al volver a la aplicación. No se depende de que
    // el navegador envíe en segundo plano, porque Safari no lo hace.
    const reintentar = () => { if (document.visibilityState === 'visible') cola.reintentar(authId) }
    reintentar()
    contar()
    window.addEventListener('online', reintentar)
    document.addEventListener('visibilitychange', reintentar)
    pedirAlmacenPersistente()
    return () => {
      vigente = false
      dejar()
      window.removeEventListener('online', reintentar)
      document.removeEventListener('visibilitychange', reintentar)
    }
  }, [cola, authId])

  useEffect(() => {
    // Si la persona sale antes de que llegue la respuesta, la respuesta se descarta.
    let vigente = true
    conRecuerdo(CLAVE.acceso(authId), () => leerAcceso(supabase, authId)).then(
      ({ datos: acceso, deMemoria }) => vigente && setCarga(acceso ? { paso: 'listo', acceso, deMemoria } : { paso: 'sin-acceso' }),
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

  function salir() {
    // Los partes sin enviar no se borran al salir: se enviarán cuando esta persona vuelva a entrar aquí.
    const quedan = recuento.pendientes + recuento.rechazados.length
    if (quedan > 0 && !confirm(`Tienes ${quedan === 1 ? 'un parte' : `${quedan} partes`} sin enviar en este móvil. Se enviarán cuando vuelvas a entrar. ¿Salir igualmente?`)) return
    supabase.auth.signOut({ scope: 'local' })
  }

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
            <button className="btn" onClick={salir}>Salir</button>
          </div>
        </div>
      </header>

      <main className="ancho gutter pila">
        {carga.paso === 'cargando' && <p className="suave">Cargando el edificio…</p>}

        {carga.paso === 'listo' && carga.deMemoria && (
          <p className="sin-red" role="status">Sin conexión. Ves los datos de la última vez que hubo red.</p>
        )}
        {carga.paso === 'listo' && <Pendientes cola={cola} authId={authId} recuento={recuento} />}

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
          <Parte supabase={supabase} authId={authId} acceso={carga.acceso} cola={cola} volver={() => setPantalla('inicio')} />
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
