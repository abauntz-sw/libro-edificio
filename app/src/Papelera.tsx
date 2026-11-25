import type { SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import {
  type Catalogo, type Documento, fechaCorta as fecha, leerCatalogo, leerDocumentos, mensajeError as sinConexion, recuperar,
} from './archivo.ts'

type Carga =
  | { paso: 'cargando' }
  | { paso: 'listo'; documentos: Documento[]; catalogo: Catalogo }
  | { paso: 'error'; mensaje: string }

/**
 * La Papelera: los documentos que la administración ha quitado del Archivo. Solo la ve la administración.
 * El archivo no se borra: sigue en el repositorio del edificio, y aquí se puede recuperar.
 */
export function Papelera({ supabase, volver }: { supabase: SupabaseClient; volver: () => void }) {
  const [carga, setCarga] = useState<Carga>({ paso: 'cargando' })
  const [intento, setIntento] = useState(0)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let vigente = true
    Promise.all([leerCatalogo(supabase), leerDocumentos(supabase, true)]).then(
      ([catalogo, documentos]) => vigente && setCarga({ paso: 'listo', documentos, catalogo }),
      (e: Error) => vigente && setCarga({ paso: 'error', mensaje: sinConexion(e) }),
    )
    return () => { vigente = false }
  }, [supabase, intento])

  async function sacar(d: Documento) {
    setOcupado(d.id)
    setAviso('')
    setError('')
    try {
      await recuperar(supabase, d.id)
      setCarga(c => c.paso === 'listo' ? { ...c, documentos: c.documentos.filter(x => x.id !== d.id) } : c)
      setAviso(`«${d.titulo}» vuelve a estar en el Archivo.`)
    } catch (e) {
      setError(sinConexion(e as Error))
    } finally {
      setOcupado(null)
    }
  }

  return (
    <>
      <div><button className="btn" onClick={volver}>← Inicio</button></div>
      <div className="pila">
        <h1>Papelera</h1>
        <p className="suave">
          Los documentos que se quitan del Archivo. Se pueden recuperar. El archivo no se borra:
          sigue guardado en el repositorio del edificio.
        </p>
      </div>

      {aviso && <p className="hecho" role="status">{aviso}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {carga.paso === 'cargando' && <p className="suave">Cargando la papelera…</p>}

      {carga.paso === 'error' && (
        <>
          <p className="error" role="alert">{carga.mensaje}</p>
          <div><button className="btn prim" onClick={() => { setCarga({ paso: 'cargando' }); setIntento(n => n + 1) }}>Reintentar</button></div>
        </>
      )}

      {carga.paso === 'listo' && carga.documentos.length === 0 && <p className="lista vacio">La papelera está vacía.</p>}

      {carga.paso === 'listo' && carga.documentos.length > 0 && (
        <ul className="lista" aria-label="Documentos en la papelera">
          {carga.documentos.map(d => (
            <li key={d.id} className="item est">
              <div>
                <b>{d.titulo}</b>
                <span className="suave peq">
                  {carga.catalogo.tipos.get(d.tipo) ?? d.tipo} · {fecha(d.fecha)}
                  {d.eliminadoEn && ` · En la papelera desde el ${fecha(d.eliminadoEn)}`}
                </span>
              </div>
              <button className="btn" onClick={() => sacar(d)} disabled={ocupado !== null}
                aria-label={`Recuperar «${d.titulo}»`}>
                {ocupado === d.id ? 'Recuperando…' : 'Recuperar'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
