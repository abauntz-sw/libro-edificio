import type { SupabaseClient } from '@supabase/supabase-js'
import { type DragEvent, useEffect, useState } from 'react'
import {
  buscarDuplicados, faltaEnFicha, type Fila, leerOpciones, marcarDuplicados, type Opcion, prepararFila, subir,
} from './subida.ts'

type Opciones = { tipos: Opcion[]; instalaciones: Opcion[] }

/**
 * Subir documentos: se eligen o se arrastran PDF, se rellena la ficha de cada uno y se guardan.
 * Cada archivo se sube por separado. Si uno falla, los demás siguen, y se puede repetir sin duplicar.
 */
export function Subir({ supabase, esEmpresa, volver }: { supabase: SupabaseClient; esEmpresa: boolean; volver: () => void }) {
  const [opciones, setOpciones] = useState<Opciones | null>(null)
  const [errorOpciones, setErrorOpciones] = useState('')
  const [filas, setFilas] = useState<Fila[]>([])
  // Lo que ya está en el Libro, por huella. Se guarda para volver a marcar al quitar un archivo.
  const [enElLibro, setEnElLibro] = useState(new Map<string, string>())
  const [aviso, setAviso] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [encima, setEncima] = useState(false)

  useEffect(() => {
    let vigente = true
    leerOpciones(supabase).then(o => vigente && setOpciones(o), (e: Error) => vigente && setErrorOpciones(e.message))
    return () => { vigente = false }
  }, [supabase])

  /** Añade los archivos elegidos: comprueba cada uno, calcula su huella y busca duplicados. */
  async function anadir(archivos: File[]) {
    setAviso('')
    const nuevas = await Promise.all(archivos.map(a => prepararFila(a, crypto.randomUUID())))
    let encontrados = enElLibro
    try {
      const halladas = await buscarDuplicados(supabase, nuevas.flatMap(f => f.huella ? [f.huella] : []))
      encontrados = new Map([...enElLibro, ...halladas])
      setEnElLibro(encontrados)
    } catch (error) {
      setAviso((error as Error).message)
    }
    setFilas(previas => marcarDuplicados([...previas, ...nuevas], encontrados))
  }

  function cambiar(id: string, cambios: Partial<Fila>) {
    setFilas(previas => previas.map(f => f.id === id ? { ...f, ...cambios } : f))
  }

  function quitar(id: string) {
    setFilas(previas => marcarDuplicados(previas.filter(f => f.id !== id), enElLibro))
  }

  const pendientes = filas.filter(f => !f.rechazo && f.estado !== 'hecha')

  /** Sube una a una las que faltan. Antes mira que todas tengan la ficha completa. */
  async function guardar() {
    const incompleta = pendientes.find(f => faltaEnFicha(f, esEmpresa).length > 0)
    if (incompleta) {
      setAviso(`A «${incompleta.archivo.name}» le falta ${faltaEnFicha(incompleta, esEmpresa).join(', ')}.`)
      return
    }
    setAviso('')
    setGuardando(true)
    for (const fila of pendientes) {
      cambiar(fila.id, { estado: 'subiendo', mensaje: undefined })
      const error = await subir(supabase, fila)
      cambiar(fila.id, error ? { estado: 'error', mensaje: error } : { estado: 'hecha' })
    }
    setGuardando(false)
  }

  function soltar(evento: DragEvent) {
    evento.preventDefault()
    setEncima(false)
    if (!guardando) anadir([...evento.dataTransfer.files])
  }

  const hechas = filas.filter(f => f.estado === 'hecha').length
  const conError = filas.filter(f => f.estado === 'error').length

  return (
    <>
      <div><button className="btn" onClick={volver} disabled={guardando}>← Inicio</button></div>
      <h1>Subir documentos</h1>
      <p className="suave">Elige o arrastra los PDF. Rellena la ficha de cada uno; el resto lo hace la aplicación.</p>

      {errorOpciones && <p className="error" role="alert">{errorOpciones}</p>}

      <div
        className={`zona${encima ? ' encima' : ''}`}
        onDragOver={e => { e.preventDefault(); setEncima(true) }}
        onDragLeave={() => setEncima(false)}
        onDrop={soltar}
      >
        <b>Arrastra aquí los PDF</b>
        <span className="suave peq">o elígelos desde tu equipo. Como mucho 25 MB cada uno.</span>
        <label className={`btn prim${guardando || !opciones ? ' apagado' : ''}`}>
          Elegir archivos
          <input
            type="file" accept="application/pdf,.pdf" multiple hidden disabled={guardando || !opciones}
            onChange={e => { anadir([...(e.target.files ?? [])]); e.target.value = '' }}
          />
        </label>
      </div>

      {filas.length > 0 && opciones && (
        <section className="pila">
          <h2>{filas.length} {filas.length === 1 ? 'archivo' : 'archivos'}</h2>
          {filas.map(f => (
            <Ficha
              key={f.id} fila={f} opciones={opciones} esEmpresa={esEmpresa} bloqueada={guardando}
              cambiar={cambios => cambiar(f.id, cambios)} quitar={() => quitar(f.id)}
            />
          ))}

          {aviso && <p className="error" role="alert">{aviso}</p>}
          {!guardando && hechas > 0 && pendientes.length === 0 && (
            <p role="status"><b>{hechas === 1 ? 'Documento guardado' : `${hechas} documentos guardados`}</b> en el Libro y en el repositorio del edificio.</p>
          )}
          {!guardando && conError > 0 && (
            <p className="error" role="alert">
              {conError === 1 ? 'Un documento no se ha guardado' : `${conError} documentos no se han guardado`}.
              Revisa el motivo y pulsa Guardar otra vez: los que ya están no se duplican.
            </p>
          )}

          <div className="fila">
            {/* Cuando ya no queda nada por guardar, el botón sobra: solo queda empezar otra tanda. */}
            {(guardando || pendientes.length > 0) && (
              <button className="btn prim" onClick={guardar} disabled={guardando}>
                {guardando ? 'Guardando…' : pendientes.length === 1 ? 'Guardar 1 documento' : `Guardar ${pendientes.length} documentos`}
              </button>
            )}
            {!guardando && pendientes.length === 0 && <button className="btn prim" onClick={() => setFilas([])}>Subir más</button>}
          </div>
        </section>
      )}
    </>
  )
}

const ESTADO: Record<Fila['estado'], string> = {
  lista: '', subiendo: 'Subiendo…', hecha: 'Guardado', error: 'No se ha guardado',
}

/** La ficha de un archivo: título, tipo, fechas e instalaciones. */
function Ficha({ fila: f, opciones, esEmpresa, bloqueada, cambiar, quitar }: {
  fila: Fila
  opciones: Opciones
  esEmpresa: boolean
  bloqueada: boolean
  cambiar: (cambios: Partial<Fila>) => void
  quitar: () => void
}) {
  const cerrada = bloqueada || f.estado === 'hecha' || Boolean(f.rechazo)
  const marcar = (id: string, si: boolean) =>
    cambiar({ instalaciones: si ? [...f.instalaciones, id] : f.instalaciones.filter(x => x !== id) })

  return (
    <div className={`tarjeta ancha pila est-${f.rechazo ? 'rechazada' : f.estado}`}>
      <div className="fila" style={{ justifyContent: 'space-between' }}>
        <b className="nombre">{f.archivo.name}</b>
        <span className="fila">
          {ESTADO[f.estado] && <span className="peq">{ESTADO[f.estado]}</span>}
          {f.estado !== 'hecha' && <button className="btn" onClick={quitar} disabled={bloqueada}>Quitar</button>}
        </span>
      </div>

      {f.rechazo && <p className="error">{f.rechazo}</p>}
      {f.duplicado && f.estado !== 'hecha' && <p className="nota">{f.duplicado} Puedes quitarlo o guardarlo igualmente.</p>}
      {f.mensaje && <p className="error" role="alert">{f.mensaje}</p>}

      {!f.rechazo && (
        <>
          <div className="campos">
            <label className="campo">Título
              <input value={f.titulo} maxLength={200} disabled={cerrada} onChange={e => cambiar({ titulo: e.target.value })} />
            </label>
            <label className="campo">Tipo
              <select value={f.tipo} disabled={cerrada} onChange={e => cambiar({ tipo: e.target.value })}>
                <option value="">Elige uno</option>
                {opciones.tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </label>
            <label className="campo">Fecha del documento
              <input type="date" value={f.fecha} disabled={cerrada} onChange={e => cambiar({ fecha: e.target.value })} />
            </label>
            <label className="campo">Caduca (si caduca)
              <input type="date" value={f.caduca} min={f.fecha || undefined} disabled={cerrada} onChange={e => cambiar({ caduca: e.target.value })} />
            </label>
          </div>
          <fieldset className="pila" style={{ gap: 4 }} disabled={cerrada}>
            <legend className="suave peq">
              {esEmpresa ? '¿De qué instalación es? Marca al menos una.' : '¿De qué instalación es? Déjalo sin marcar si afecta a todo el edificio.'}
            </legend>
            <div className="marcas">
              {opciones.instalaciones.map(i => (
                <label key={i.id}>
                  <input type="checkbox" checked={f.instalaciones.includes(i.id)} onChange={e => marcar(i.id, e.target.checked)} />
                  {i.nombre}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}
    </div>
  )
}
