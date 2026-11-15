import type { SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { Entrada } from './Entrada.tsx'
import { Inicio } from './Inicio.tsx'
import { Mensaje } from './Mensaje.tsx'

/** Decide qué pantalla toca: la de entrar o la del edificio. */
export function App({ supabase }: { supabase: SupabaseClient }) {
  // undefined: todavía no se sabe si hay sesión. null: no la hay.
  const [authId, setAuthId] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    // Supabase avisa al arrancar, al entrar y al salir.
    const { data } = supabase.auth.onAuthStateChange((_evento, sesion) => setAuthId(sesion?.user.id ?? null))
    return () => data.subscription.unsubscribe()
  }, [supabase])

  if (authId === undefined) return <Mensaje titulo="Libro del Edificio"><p className="suave">Comprobando la sesión…</p></Mensaje>
  if (authId === null) return <Entrada supabase={supabase} />
  return <Inicio supabase={supabase} authId={authId} />
}
