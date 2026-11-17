import type { SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { agrupar, type Grupo, huecosCsv, leerHuecos, nombreCsv } from './huecos.ts'

type Carga =
  | { paso: 'cargando' }
  | { paso: 'listo'; grupos: Grupo[] }
  | { paso: 'error'; mensaje: string }

/** El informe de huecos: qué documentos faltan, agrupados por instalación, y su descarga en CSV. */
export function Huecos({ supabase, volver }: { supabase: SupabaseClient; volver: () => void }) {
  const [carga, setCarga] = useState<Carga>({ paso: 'cargando' })
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vigente = true
    leerHuecos(supabase).then(
      huecos => vigente && setCarga({ paso: 'listo', grupos: agrupar(huecos) }),
      (error: Error) => vigente && setCarga({
        paso: 'error',
        mensaje: navigator.onLine ? error.message : 'No hay conexión. Cuando vuelva, pulsa Reintentar.',
      }),
    )
    return () => { vigente = false }
  }, [supabase, intento])

  function reintentar() {
    setCarga({ paso: 'cargando' })
    setIntento(n => n + 1)
  }

  /** Crea el CSV en el navegador y lo descarga, sin pasar por ningún servidor. */
  function descargar(grupos: Grupo[]) {
    const archivo = new Blob([huecosCsv(grupos)], { type: 'text/csv;charset=utf-8' })
    const enlace = document.createElement('a')
    enlace.href = URL.createObjectURL(archivo)
    enlace.download = nombreCsv(new Date())
    enlace.click()
    // Se suelta un poco después: si se suelta en el acto, algún navegador corta la descarga.
    setTimeout(() => URL.revokeObjectURL(enlace.href), 1000)
  }

  return (
    <>
      <div><button className="btn" onClick={volver}>← Inicio</button></div>
      <h1>Documentos que faltan</h1>
      <p className="suave">
        Lo que pide la plantilla para cada tipo de instalación y todavía no está en el Libro.
        Un documento en la papelera no cuenta.
      </p>

      {carga.paso === 'cargando' && <p className="suave">Buscando huecos…</p>}

      {carga.paso === 'error' && (
        <>
          <p className="error" role="alert">{carga.mensaje}</p>
          <div><button className="btn prim" onClick={reintentar}>Reintentar</button></div>
        </>
      )}

      {carga.paso === 'listo' && carga.grupos.length === 0 && (
        <p><b>No falta ningún documento.</b> Cada instalación tiene todo lo que pide la plantilla.</p>
      )}

      {carga.paso === 'listo' && carga.grupos.length > 0 && (
        <>
          <div className="fila">
            <p>{resumen(carga.grupos)}</p>
            <button className="btn prim" onClick={() => descargar(carga.grupos)}>Descargar CSV</button>
          </div>
          <ul className="huecos">
            {carga.grupos.map(g => (
              <li key={g.instalacion}>
                <h2>{g.instalacion}</h2>
                <ul>{g.faltan.map(f => <li key={f}>{f}</li>)}</ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

/** «Faltan 7 documentos en 5 instalaciones», con singular y plural. */
function resumen(grupos: Grupo[]): string {
  const docs = grupos.reduce((n, g) => n + g.faltan.length, 0)
  const verbo = docs === 1 ? 'Falta' : 'Faltan'
  return `${verbo} ${docs} ${docs === 1 ? 'documento' : 'documentos'} en ${grupos.length} ${grupos.length === 1 ? 'instalación' : 'instalaciones'}.`
}
