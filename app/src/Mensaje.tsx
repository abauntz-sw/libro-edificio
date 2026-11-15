import type { ReactNode } from 'react'

/** Una pantalla con un solo mensaje centrado: esperas, errores y avisos. */
export function Mensaje({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <main className="centro">
      <div className="tarjeta pila">
        <h1>{titulo}</h1>
        {children}
      </div>
    </main>
  )
}
