import { describe, expect, it } from 'vitest'
import { esClaveDeServicio, leerConfiguracion } from '../src/configuracion.ts'

/** Fabrica una clave antigua de mentira, con el rol que se le pida. No abre ningún proyecto. */
function claveAntigua(rol: string): string {
  return ['cabecera', btoa(JSON.stringify({ role: rol })), 'firma'].join('.')
}

const url = 'https://ejemplo.supabase.co'

describe('esClaveDeServicio', () => {
  it('reconoce la clave de servicio nueva', () => {
    expect(esClaveDeServicio('sb_secret_inventada')).toBe(true)
  })

  it('reconoce la clave de servicio antigua', () => {
    expect(esClaveDeServicio(claveAntigua('service_role'))).toBe(true)
  })

  it('deja pasar las claves públicas, nuevas y antiguas', () => {
    expect(esClaveDeServicio('sb_publishable_inventada')).toBe(false)
    expect(esClaveDeServicio(claveAntigua('anon'))).toBe(false)
  })

  it('no falla con un texto cualquiera', () => {
    expect(esClaveDeServicio('')).toBe(false)
    expect(esClaveDeServicio('a.b.c')).toBe(false)
  })
})

describe('leerConfiguracion', () => {
  it('devuelve la dirección y la clave, sin espacios sobrantes', () => {
    const env = { VITE_SUPABASE_URL: ` ${url} `, VITE_SUPABASE_CLAVE_PUBLICA: ' sb_publishable_inventada ' }
    expect(leerConfiguracion(env)).toEqual({ url, clavePublica: 'sb_publishable_inventada' })
  })

  it('avisa si falta la dirección o la clave', () => {
    expect(() => leerConfiguracion({})).toThrow('Falta')
    expect(() => leerConfiguracion({ VITE_SUPABASE_URL: url })).toThrow('Falta')
    expect(() => leerConfiguracion({ VITE_SUPABASE_URL: url, VITE_SUPABASE_CLAVE_PUBLICA: '  ' })).toThrow('Falta')
  })

  it('avisa si la dirección no es válida', () => {
    const env = { VITE_SUPABASE_URL: 'tu-proyecto', VITE_SUPABASE_CLAVE_PUBLICA: 'sb_publishable_inventada' }
    expect(() => leerConfiguracion(env)).toThrow('no es una dirección válida')
  })

  it('rechaza la clave de servicio', () => {
    const env = { VITE_SUPABASE_URL: url, VITE_SUPABASE_CLAVE_PUBLICA: 'sb_secret_inventada' }
    expect(() => leerConfiguracion(env)).toThrow('clave de servicio')
  })
})
