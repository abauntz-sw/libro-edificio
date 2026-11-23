import type { SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useMemo, useState } from 'react'
import type { Acceso } from './acceso.ts'
import {
  type Agrupar, aPapelera, bajarDocumento, buscar, type Caducidad, caducidad, type Catalogo, type Documento, enGrupo,
  fechaCorta as fecha, grupos, hoy, leerCatalogo, leerDocumentos, mensajeError as sinConexion, nombresInstalaciones,
  pideAtencion, textoCaducidad,
} from './archivo.ts'

type Carga =
  | { paso: 'cargando' }
  /** `completo`: ya han llegado todas las tandas. */
  | { paso: 'listo'; documentos: Documento[]; catalogo: Catalogo; completo: boolean }
  | { paso: 'error'; mensaje: string }

/** Cuántos documentos se pintan de una vez. Con cientos, la lista se alarga con «Ver más». */
const DE_UNA_VEZ = 50

const CLASE: Record<Caducidad['estado'], string> = { caducado: 'crit', pronto: 'aviso', vigente: 'ok', sin: '' }

/** La marca de caducidad. Un documento sin caducidad no lleva ninguna en la lista. */
function Marca({ c }: { c: Caducidad }) {
  return c.estado === 'sin' ? null : <span className={`chip ${CLASE[c.estado]}`}>{textoCaducidad(c)}</span>
}

/**
 * El Archivo: los documentos del Libro que ve esta persona, con buscador, organizados por instalación,
 * tipo o año. Al abrir uno se ve su ficha y se puede descargar. La administración, además, lo manda a la papelera.
 */
export function Archivo({ supabase, acceso, volver }: { supabase: SupabaseClient; acceso: Acceso; volver: () => void }) {
  const [carga, setCarga] = useState<Carga>({ paso: 'cargando' })
  const [intento, setIntento] = useState(0)
  const [texto, setTexto] = useState('')
  const [agrupar, setAgrupar] = useState<Agrupar>('instalacion')
  const [grupo, setGrupo] = useState<string | null>(null)
  const [soloAtencion, setSoloAtencion] = useState(false)
  const [mostrar, setMostrar] = useState(DE_UNA_VEZ)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [aviso, setAviso] = useState('')
  const esEmpresa = acceso.perfil === 'empresa'

  useEffect(() => {
    let vigente = true
    leerCatalogo(supabase)
      .then(catalogo => leerDocumentos(supabase, false, hasta => {
        // Cada tanda que llega se enseña ya: no hace falta esperar a las demás.
        if (vigente) setCarga({ paso: 'listo', documentos: hasta, catalogo, completo: false })
      }).then(documentos => vigente && setCarga({ paso: 'listo', documentos, catalogo, completo: true })))
      .catch((error: Error) => vigente && setCarga({ paso: 'error', mensaje: sinConexion(error) }))
    return () => { vigente = false }
  }, [supabase, intento])

  const dia = hoy()
  const listo = carga.paso === 'listo' ? carga : null
  const encontrados = useMemo(() => {
    if (!listo) return []
    return buscar(listo.documentos, texto, listo.catalogo)
      .filter(d => enGrupo(d, agrupar, grupo))
      .filter(d => !soloAtencion || pideAtencion(d, dia))
  }, [listo, texto, agrupar, grupo, soloAtencion, dia])
  const documento = listo?.documentos.find(d => d.id === abierto)

  /** Cualquier cambio de búsqueda o de grupo vuelve a los primeros de la lista. */
  const desdeArriba = <T,>(poner: (valor: T) => void) => (valor: T) => { poner(valor); setMostrar(DE_UNA_VEZ) }

  function abrir(id: string) {
    setAbierto(id)
    setAviso('')
    window.scrollTo(0, 0)
  }

  function quitarDeLaLista(id: string) {
    if (!listo) return
    setCarga({ ...listo, documentos: listo.documentos.filter(d => d.id !== id) })
    setAbierto(null)
  }

  return (
    <>
      <div><button className="btn" onClick={volver}>← Inicio</button></div>
      <div className="pila">
        <h1>{esEmpresa ? 'Tus documentos' : 'Archivo'}</h1>
        <input
          className="buscar" type="search" value={texto} onChange={e => desdeArriba(setTexto)(e.target.value)}
          placeholder="Busca por título, empresa, tipo o instalación" aria-label="Buscar documentos"
        />
      </div>

      {aviso && <p className="hecho" role="status">{aviso}</p>}

      {carga.paso === 'cargando' && <p className="suave">Cargando los documentos…</p>}

      {carga.paso === 'error' && (
        <>
          <p className="error" role="alert">{carga.mensaje}</p>
          <div><button className="btn prim" onClick={() => { setCarga({ paso: 'cargando' }); setIntento(n => n + 1) }}>Reintentar</button></div>
        </>
      )}

      {listo && (
        <div className="lat">
          <aside className="pila">
            <div className="grupos" role="group" aria-label="Organizar por">
              {([['instalacion', 'Instalación'], ['tipo', 'Tipo'], ['ano', 'Año']] as const).map(([clave, nombre]) => (
                <button key={clave} className="btn" aria-pressed={agrupar === clave}
                  onClick={() => { desdeArriba(setAgrupar)(clave); setGrupo(null) }}>{nombre}</button>
              ))}
            </div>
            <div className="arbol" role="group" aria-label="Grupos">
              <button className="nodo" aria-pressed={grupo === null} onClick={() => desdeArriba(setGrupo)(null)}>
                <span>Todos</span><span className="suave">{listo.documentos.length}</span>
              </button>
              {grupos(listo.documentos, agrupar, listo.catalogo, esEmpresa).map(g => (
                <button key={g.clave} className="nodo" aria-pressed={grupo === g.clave} onClick={() => desdeArriba(setGrupo)(g.clave)}>
                  <span>{g.nombre}</span><span className="suave">{g.cuenta}</span>
                </button>
              ))}
            </div>
          </aside>

          <div className="pila">
            <div className="fila">
              <button className="btn" aria-pressed={!soloAtencion} onClick={() => desdeArriba(setSoloAtencion)(false)}>Todos</button>
              <button className="btn" aria-pressed={soloAtencion} onClick={() => desdeArriba(setSoloAtencion)(true)}>Caducados o por caducar</button>
              <span className="suave peq" role="status">
                {encontrados.length} {encontrados.length === 1 ? 'documento' : 'documentos'}
                {!listo.completo && ' (siguen llegando…)'}
              </span>
            </div>

            {documento && (
              <Ficha
                supabase={supabase} acceso={acceso} documento={documento} catalogo={listo.catalogo} dia={dia}
                cerrar={() => setAbierto(null)}
                enviado={() => { quitarDeLaLista(documento.id); setAviso(`«${documento.titulo}» está en la papelera. Se puede recuperar desde allí.`) }}
              />
            )}

            {encontrados.length === 0
              ? <p className="lista vacio">No hay documentos con esa búsqueda. Prueba con otra palabra o quita el filtro.</p>
              : (
                <ul className="lista" aria-label="Documentos">
                  {encontrados.slice(0, mostrar).map(d => (
                    <li key={d.id}>
                      <button className="item" onClick={() => abrir(d.id)} aria-current={d.id === abierto || undefined}>
                        <div>
                          <b>{d.titulo}</b>
                          <span className="suave peq">
                            {listo.catalogo.tipos.get(d.tipo) ?? d.tipo} · {fecha(d.fecha)}{d.emisor && ` · ${d.emisor}`}
                          </span>
                        </div>
                        <Marca c={caducidad(d.caduca, dia)} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            {encontrados.length > mostrar && (
              <div><button className="btn" onClick={() => setMostrar(n => n + DE_UNA_VEZ)}>
                Ver {Math.min(DE_UNA_VEZ, encontrados.length - mostrar)} más (quedan {encontrados.length - mostrar})
              </button></div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/** La ficha de un documento: sus datos, la descarga y, para la administración, la papelera. */
function Ficha({ supabase, acceso, documento: d, catalogo, dia, cerrar, enviado }: {
  supabase: SupabaseClient; acceso: Acceso; documento: Documento; catalogo: Catalogo; dia: string
  cerrar: () => void; enviado: () => void
}) {
  const [ocupado, setOcupado] = useState<'' | 'bajando' | 'borrando'>('')
  const [confirmar, setConfirmar] = useState(false)
  const [error, setError] = useState('')
  const c = caducidad(d.caduca, dia)
  const instalaciones = nombresInstalaciones(d, catalogo)

  // Al abrir otro documento, la ficha empieza de cero.
  useEffect(() => { setConfirmar(false); setError('') }, [d.id])

  async function descargar() {
    setOcupado('bajando')
    setError('')
    try {
      const archivo = await bajarDocumento(supabase, d.id)
      const enlace = document.createElement('a')
      enlace.href = URL.createObjectURL(archivo)
      enlace.download = /\.pdf$/i.test(d.nombreOriginal) ? d.nombreOriginal : `${d.nombreOriginal}.pdf`
      enlace.click()
      // Se suelta un poco después: si se suelta en el acto, algún navegador corta la descarga.
      setTimeout(() => URL.revokeObjectURL(enlace.href), 10_000)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado('')
    }
  }

  async function eliminar() {
    setOcupado('borrando')
    setError('')
    try {
      await aPapelera(supabase, d.id, acceso.id ?? null)
      enviado()
    } catch (e) {
      setError(sinConexion(e as Error))
      setOcupado('')
    }
  }

  return (
    <article className="ficha" aria-label={`Ficha de ${d.titulo}`}>
      <div className="fila" style={{ justifyContent: 'space-between' }}>
        <h2>{d.titulo}</h2>
        <button className="btn" onClick={cerrar}>Cerrar</button>
      </div>
      <dl>
        <dt>Tipo</dt><dd>{catalogo.tipos.get(d.tipo) ?? d.tipo}</dd>
        <dt>Fecha</dt><dd>{fecha(d.fecha)}</dd>
        <dt>Emisor</dt><dd>{d.emisor || 'Sin indicar'}</dd>
        <dt>Caduca</dt><dd>{d.caduca ? <>{fecha(d.caduca)} <Marca c={c} /></> : 'No caduca'}</dd>
        <dt>Instalación</dt><dd>{d.instalaciones.length === 0 ? 'Todo el edificio' : instalaciones.join(', ') || 'Otras instalaciones'}</dd>
        <dt>Nombre recibido</dt><dd>{d.nombreOriginal}</dd>
      </dl>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="fila">
        <button className="btn prim" onClick={descargar} disabled={ocupado !== ''}>
          {ocupado === 'bajando' ? 'Descargando…' : 'Descargar'}
        </button>
        {/* Solo la administración manda a la papelera. La base de datos lo comprueba igualmente. */}
        {acceso.perfil === 'admin' && !confirmar && (
          <button className="btn peligro" onClick={() => setConfirmar(true)} disabled={ocupado !== ''}>Eliminar</button>
        )}
        {acceso.perfil === 'admin' && confirmar && (
          <>
            <span className="peq">¿Enviar a la papelera?</span>
            <button className="btn peligro" onClick={eliminar} disabled={ocupado !== ''}>
              {ocupado === 'borrando' ? 'Enviando…' : 'Sí, a la papelera'}
            </button>
            <button className="btn" onClick={() => setConfirmar(false)} disabled={ocupado !== ''}>No</button>
          </>
        )}
      </div>
    </article>
  )
}
