import { useState } from 'react'
import type { Cola, Recuento } from './cola.ts'

const fecha = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })

/**
 * Cuántos partes quedan en este móvil sin llegar, y los que la base de datos ha rechazado, con su motivo.
 * No enseña nada si no queda ninguno.
 */
export function Pendientes({ cola, authId, recuento }: { cola: Cola; authId: string; recuento: Recuento }) {
  const [enviando, setEnviando] = useState(false)
  const { pendientes, rechazados } = recuento
  if (pendientes === 0 && rechazados.length === 0) return null

  async function enviarAhora() {
    setEnviando(true)
    await cola.reintentar(authId)
    setEnviando(false)
  }

  return (
    <section className="aviso-cola pila" aria-live="polite">
      {pendientes > 0 && (
        <div className="fila" style={{ justifyContent: 'space-between' }}>
          <span>
            <b>{pendientes === 1 ? '1 parte sin enviar' : `${pendientes} partes sin enviar`}.</b>{' '}
            <span className="suave">Está guardado en este móvil. Se enviará solo cuando haya conexión.</span>
          </span>
          <button className="btn" onClick={enviarAhora} disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar ahora'}</button>
        </div>
      )}
      {rechazados.map(p => (
        <div key={p.id} className="pila" style={{ gap: 4 }}>
          <b className="error">Parte del {fecha(p.fila.fecha)} no aceptado</b>
          <span className="peq">«{p.fila.descripcion}»</span>
          <span className="peq">{p.rechazo}</span>
          <div>
            <button className="btn" onClick={() => {
              if (confirm('¿Borrar este parte del móvil? No se podrá recuperar.')) cola.descartar(p.id)
            }}>Descartar</button>
          </div>
        </div>
      ))}
    </section>
  )
}
