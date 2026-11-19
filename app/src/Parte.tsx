import type { SupabaseClient } from '@supabase/supabase-js'
import { type ChangeEvent, useEffect, useState } from 'react'
import type { Acceso } from './acceso.ts'
import type { Cola } from './cola.ts'
import {
  BORRADOR_VACIO, type Borrador, type Certificado, faltaEnParte, filaParte, hoyLocal, type Instalacion, leerCertificado,
  leerDatosParte, NOMBRE_TIPO, puedeAdjuntarCertificado, type Revision, revisionesDe, sumarMeses, tiposDe, tituloCertificado,
} from './parte.ts'
import { CLAVE, conRecuerdo } from './recuerdo.ts'

const fecha = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })

/** El certificado elegido: su copia, o por qué no vale. */
interface Elegido {
  id: string
  nombre: string
  copia?: Blob
  error?: string
}

/**
 * Registrar parte: dónde, si cierra una revisión, qué se ha hecho y una frase. Pensado para el móvil.
 * La administración y las empresas pueden adjuntar un certificado en PDF.
 * Funciona sin cobertura: el parte, con su certificado, se guarda en el móvil y la cola lo envía cuando hay red.
 */
export function Parte({ supabase, authId, acceso, cola, volver }: {
  supabase: SupabaseClient
  authId: string
  acceso: Acceso
  cola: Cola
  volver: () => void
}) {
  const [datos, setDatos] = useState<{ instalaciones: Instalacion[]; revisiones: Revision[] } | null>(null)
  const [deMemoria, setDeMemoria] = useState(false)
  const [errorDatos, setErrorDatos] = useState('')
  const [b, setB] = useState<Borrador>(BORRADOR_VACIO)
  // El identificador se crea al empezar el parte. Si el envío falla y se repite, es el mismo: no se duplica.
  const [id, setId] = useState(() => crypto.randomUUID())
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState('')
  const [intento, setIntento] = useState(0)
  const [cert, setCert] = useState<Elegido | null>(null)

  useEffect(() => {
    let vigente = true
    conRecuerdo(CLAVE.parte(authId), () => leerDatosParte(supabase)).then(
      r => { if (vigente) { setDatos(r.datos); setDeMemoria(r.deMemoria) } },
      (e: Error) => vigente && setErrorDatos(navigator.onLine ? e.message : 'No hay conexión, y este móvil todavía no tiene guardadas tus instalaciones. Ábrelo una vez con cobertura.'),
    )
    return () => { vigente = false }
  }, [supabase, authId, intento])

  const hoy = hoyLocal()
  const tipos = tiposDe(acceso.perfil)
  const revs = datos && b.instalacion ? revisionesDe(datos.revisiones, b.instalacion, acceso.perfil, acceso.contactoId) : []
  const revision = revs.find(r => r.id === b.revision)

  function cambiar(cambios: Partial<Borrador>) {
    setB(previo => ({ ...previo, ...cambios }))
    setAviso('')
    setEnviado('')
  }

  async function elegirCertificado(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    // Se vacía para poder volver a elegir el mismo archivo después de quitarlo.
    e.target.value = ''
    if (!archivo) return
    setAviso('')
    setEnviado('')
    const leido = await leerCertificado(archivo)
    // Un identificador nuevo para cada archivo elegido. Si el envío se repite, es el mismo: no se duplica.
    setCert({ id: crypto.randomUUID(), nombre: archivo.name, ...leido })
  }

  async function enviar() {
    const falta = faltaEnParte(b, revision, hoy)
    if (falta) { setAviso(falta); return }
    if (cert?.error) { setAviso(`${cert.error} Quita el certificado o elige otro.`); return }
    const instalacion = datos?.instalaciones.find(i => i.id === b.instalacion)?.nombre ?? ''
    const certificado: Certificado | undefined = cert?.copia && b.tipo
      ? { id: cert.id, archivo: cert.copia, nombre: cert.nombre, titulo: tituloCertificado(b.tipo, instalacion), fecha: hoy, instalacion: b.instalacion }
      : undefined
    setEnviando(true)
    const resultado = await cola.registrar(authId, filaParte(id, b, revision, hoy, certificado?.id ?? null), certificado)
    setEnviando(false)
    // Rechazado: se queda en el formulario para corregirlo. Con el mismo identificador, no se duplica.
    if (resultado.tipo === 'rechazado') { setAviso(resultado.motivo); return }
    const conCertificado = certificado ? ', con su certificado,' : ''
    if (resultado.tipo === 'sin-conexion') {
      setEnviado(`Sin cobertura. El parte queda guardado en este móvil${conCertificado} y se enviará solo cuando vuelva la conexión.`)
    } else {
      const enviadoCon = certificado ? 'Parte enviado, con su certificado.' : 'Parte enviado.'
      setEnviado(revision ? `${enviadoCon} La revisión «${revision.descripcion}» queda hecha hoy.` : enviadoCon)
    }
    setB(BORRADOR_VACIO)
    setCert(null)
    setId(crypto.randomUUID())
  }

  return (
    <div className="movil">
      <div><button className="btn" onClick={volver} disabled={enviando}>← Inicio</button></div>
      <h1>Registrar parte</h1>

      {errorDatos && (
        <>
          <p className="error" role="alert">{errorDatos}</p>
          <div><button className="btn prim" onClick={() => { setErrorDatos(''); setIntento(n => n + 1) }}>Reintentar</button></div>
        </>
      )}
      {!datos && !errorDatos && <p className="suave">Cargando…</p>}

      {deMemoria && <p className="sin-red" role="status">Sin conexión. Las instalaciones y revisiones son las de la última vez que hubo red.</p>}
      {enviado && <p className="hecho" role="status">{enviado}</p>}

      {datos && (
        <>
          <section className="pila">
            <h2>¿Dónde?</h2>
            {datos.instalaciones.length === 0 && <p className="suave">No tienes ninguna instalación a tu cargo.</p>}
            <div className="opciones">
              {datos.instalaciones.map(i => (
                <button key={i.id} className="btn" aria-pressed={b.instalacion === i.id}
                  onClick={() => cambiar({ instalacion: i.id, revision: '', proxima: '' })}>{i.nombre}</button>
              ))}
            </div>
          </section>

          {revs.length > 0 && (
            <section className="pila">
              <h2>¿Corresponde a una revisión prevista?</h2>
              <div className="pila" style={{ gap: 8 }}>
                {revs.map(r => (
                  <button key={r.id} className="btn izq" aria-pressed={b.revision === r.id}
                    onClick={() => cambiar({ revision: r.id, proxima: '', tipo: b.tipo || tipos[0] })}>
                    {r.descripcion}<br />
                    <span className="peq suave">{r.proxima ? `Prevista: ${fecha(r.proxima)}` : 'Sin fecha prevista'}</span>
                  </button>
                ))}
                <button className="btn izq" aria-pressed={b.revision === ''} onClick={() => cambiar({ revision: '', proxima: '' })}>
                  No, es otra intervención
                </button>
              </div>
              {revision && revision.periodicidad_meses !== null && (
                <p className="suave peq">La próxima revisión pasará al {fecha(sumarMeses(hoy, revision.periodicidad_meses))}.</p>
              )}
              {revision && revision.periodicidad_meses === null && (
                <label className="campo">Próxima fecha de esta revisión
                  <input type="date" min={hoy} value={b.proxima} onChange={e => cambiar({ proxima: e.target.value })} />
                </label>
              )}
            </section>
          )}

          <section className="pila">
            <h2>¿Qué has hecho?</h2>
            <div className="opciones">
              {tipos.map(t => (
                <button key={t} className="btn" aria-pressed={b.tipo === t} onClick={() => cambiar({ tipo: t })}>{NOMBRE_TIPO[t]}</button>
              ))}
            </div>
          </section>

          <label className="campo">Cuéntalo en una frase
            <textarea value={b.descripcion} onChange={e => cambiar({ descripcion: e.target.value })} />
          </label>

          {puedeAdjuntarCertificado(acceso.perfil) && (
            <div className="pila" style={{ gap: 4 }}>
              <div className="fila">
                <label className="btn" style={{ cursor: 'pointer' }}>
                  {cert ? `Certificado: ${cert.nombre}` : 'Añadir certificado'}
                  <input type="file" accept="application/pdf,.pdf" hidden onChange={elegirCertificado} disabled={enviando} />
                </label>
                {cert && <button className="btn" onClick={() => setCert(null)} disabled={enviando}>Quitar</button>}
              </div>
              {cert?.error && <p className="error peq">{cert.error}</p>}
              {cert?.copia && <p className="suave peq">Se guardará en el Archivo como certificado de esta instalación.</p>}
            </div>
          )}

          {aviso && <p className="error" role="alert">{aviso}</p>}
          <button className="btn prim grande" onClick={enviar} disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar parte'}</button>
          <p className="suave peq">Las fotos llegarán en un paso siguiente.</p>
        </>
      )}
    </div>
  )
}
