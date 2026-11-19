import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  BORRADOR_VACIO, type Borrador, type Certificado, clasificarFuncion, enviarParte, faltaEnParte, filaParte, formularioCertificado,
  hoyLocal, leerCertificado, puedeAdjuntarCertificado, type Revision, revisionesDe, sumarMeses, tiposDe, tituloCertificado,
} from '../src/parte.ts'

const guarda = 'c-guarda'
const calor = 'c-calor'
const revisiones: Revision[] = [
  { id: 'r1', instalacion_id: 'extintores', descripcion: 'Revisión por el titular', periodicidad_meses: 3, responsable_id: guarda, proxima: '2026-12-01' },
  { id: 'r2', instalacion_id: 'extintores', descripcion: 'Revisión anual', periodicidad_meses: 12, responsable_id: 'c-extintores', proxima: '2027-01-01' },
  { id: 'r3', instalacion_id: 'caldera', descripcion: 'Mantenimiento', periodicidad_meses: null, responsable_id: calor, proxima: null },
]
const conPeriodo = revisiones[0]
const sinPeriodo = revisiones[2]
const hoy = '2026-11-16'
const listo: Borrador = { ...BORRADOR_VACIO, instalacion: 'extintores', tipo: 'comprobacion', descripcion: 'Todo en orden' }

describe('tiposDe', () => {
  it('la guarda solo comprueba o avisa de una incidencia', () => {
    expect(tiposDe('guarda')).toEqual(['comprobacion', 'incidencia'])
  })
  it('una empresa no registra comprobaciones ni incidencias', () => {
    expect(tiposDe('empresa')).toEqual(['preventivo', 'correctivo', 'inspeccion', 'urgencia'])
  })
  it('la administración, todos; la consulta, ninguno', () => {
    expect(tiposDe('admin')).toHaveLength(6)
    expect(tiposDe('consulta')).toEqual([])
  })
})

describe('revisionesDe', () => {
  it('la guarda solo ve las revisiones a su cargo', () => {
    expect(revisionesDe(revisiones, 'extintores', 'guarda', guarda).map(r => r.id)).toEqual(['r1'])
  })
  it('la administración ve todas las de la instalación', () => {
    expect(revisionesDe(revisiones, 'extintores', 'admin', null).map(r => r.id)).toEqual(['r1', 'r2'])
  })
  it('sin ficha de contacto no ve ninguna', () => {
    expect(revisionesDe(revisiones, 'caldera', 'empresa', null)).toEqual([])
  })
})

describe('sumarMeses', () => {
  it('suma meses y pasa de año', () => {
    expect(sumarMeses('2026-11-16', 3)).toBe('2027-02-16')
    expect(sumarMeses('2026-11-16', 12)).toBe('2027-11-16')
  })
  it('como PostgreSQL: el 31 de enero más un mes es el último día de febrero', () => {
    expect(sumarMeses('2026-01-31', 1)).toBe('2026-02-28')
    expect(sumarMeses('2028-01-31', 1)).toBe('2028-02-29')
  })
})

describe('hoyLocal', () => {
  it('usa la fecha del aparato', () => {
    expect(hoyLocal(new Date(2026, 10, 16, 0, 30))).toBe('2026-11-16')
  })
})

describe('faltaEnParte', () => {
  it('pide dónde, qué y una frase', () => {
    expect(faltaEnParte(BORRADOR_VACIO, undefined, hoy)).toMatch(/Elige dónde/)
    expect(faltaEnParte({ ...listo, descripcion: '   ' }, undefined, hoy)).toMatch(/Elige dónde/)
  })
  it('un parte completo está listo', () => {
    expect(faltaEnParte(listo, conPeriodo, hoy)).toBeUndefined()
  })
  it('una revisión sin periodicidad pide una próxima fecha posterior a hoy', () => {
    expect(faltaEnParte(listo, sinPeriodo, hoy)).toMatch(/próxima fecha/)
    expect(faltaEnParte({ ...listo, proxima: hoy }, sinPeriodo, hoy)).toMatch(/próxima fecha/)
    expect(faltaEnParte({ ...listo, proxima: '2027-05-01' }, sinPeriodo, hoy)).toBeUndefined()
  })
})

describe('filaParte', () => {
  it('lleva el identificador del móvil, la fecha de hoy y la descripción sin espacios de más', () => {
    const fila = filaParte('id-1', { ...listo, descripcion: '  Todo en orden ' }, undefined, hoy)
    expect(fila).toEqual({
      id: 'id-1', instalacion_id: 'extintores', fecha: hoy, tipo: 'comprobacion', descripcion: 'Todo en orden',
      revision_id: null, proxima_revision: null, certificado_id: null,
    })
  })
  it('apunta el certificado, si lo lleva', () => {
    expect(filaParte('id-1', listo, undefined, hoy, 'c1').certificado_id).toBe('c1')
  })
  it('con periodicidad no manda la próxima fecha: la calcula la base de datos', () => {
    const fila = filaParte('id-1', { ...listo, revision: 'r1', proxima: '2030-01-01' }, conPeriodo, hoy)
    expect(fila.revision_id).toBe('r1')
    expect(fila.proxima_revision).toBeNull()
  })
  it('sin periodicidad manda la próxima fecha que ha puesto la persona', () => {
    expect(filaParte('id-1', { ...listo, proxima: '2027-05-01' }, sinPeriodo, hoy).proxima_revision).toBe('2027-05-01')
  })
})

const certificado: Certificado = {
  id: 'c1', archivo: new Blob(['%PDF-1.7 ficticio'], { type: 'application/pdf' }), nombre: 'revisión.pdf',
  titulo: 'Certificado: preventivo en Calefacción', fecha: hoy, instalacion: 'caldera',
}

/** Un error de la función como los de la librería: con la respuesta en `context`. */
const errorFuncion = (status: number, cuerpo?: object) =>
  ({ context: new Response(cuerpo ? JSON.stringify(cuerpo) : 'x', { status }) })

describe('certificado', () => {
  it('lo adjuntan la administración y las empresas; la guarda y la consulta, no', () => {
    expect(puedeAdjuntarCertificado('admin')).toBe(true)
    expect(puedeAdjuntarCertificado('empresa')).toBe(true)
    expect(puedeAdjuntarCertificado('guarda')).toBe(false)
    expect(puedeAdjuntarCertificado('consulta')).toBe(false)
  })
  it('su título dice qué se hizo y dónde, en 200 letras como mucho', () => {
    expect(tituloCertificado('correctivo', 'Calefacción')).toBe('Certificado: reparación en Calefacción')
    expect(tituloCertificado('preventivo', 'x'.repeat(300))).toHaveLength(200)
  })
  it('solo vale un PDF', async () => {
    expect(await leerCertificado(new File(['hola'], 'nota.txt'))).toEqual({ error: 'No es un PDF. Desde la web solo se suben PDF.' })
    const leido = await leerCertificado(new File(['%PDF-1.7 ficticio'], 'cert.pdf'))
    expect('copia' in leido && await leido.copia.text()).toBe('%PDF-1.7 ficticio')
  })
  it('se archiva como certificado de la instalación del parte', () => {
    const datos = formularioCertificado(certificado)
    expect([datos.get('id'), datos.get('tipo'), datos.get('fecha'), datos.getAll('instalaciones')])
      .toEqual(['c1', 'certificado', hoy, ['caldera']])
    expect((datos.get('archivo') as File).name).toBe('revisión.pdf')
  })
})

describe('clasificarFuncion', () => {
  it('sin respuesta es la red: se reintenta', async () => {
    expect(await clasificarFuncion(new Error('Failed to send a request'))).toEqual({ tipo: 'sin-conexion' })
  })
  it('la sesión y los fallos del servidor se reintentan', async () => {
    for (const status of [401, 408, 429, 500, 503]) expect((await clasificarFuncion(errorFuncion(status))).tipo).toBe('sin-conexion')
  })
  it('lo demás es un rechazo, con el motivo que da la función', async () => {
    expect(await clasificarFuncion(errorFuncion(403, { error: 'No tienes permiso para archivar este documento.' }))).toEqual({
      tipo: 'rechazado', motivo: 'El certificado no se ha podido archivar: No tienes permiso para archivar este documento.',
    })
    expect(await clasificarFuncion(errorFuncion(413))).toEqual({
      tipo: 'rechazado', motivo: 'El certificado no se ha podido archivar: la función respondió 413',
    })
  })
})

/** Un Supabase de mentira que apunta, en orden, qué le llega: el certificado y el parte. */
function supabaseDeMentira(errorCertificado?: object) {
  const llegadas: string[] = []
  const supabase = {
    functions: {
      invoke: async (_nombre: string, { body }: { body: FormData }) => {
        llegadas.push(`certificado ${body.get('id')}`)
        return { error: errorCertificado ?? null }
      },
    },
    from: () => ({
      upsert: (f: { id: string }) => ({
        abortSignal: async () => { llegadas.push(`parte ${f.id}`); return { error: null } },
      }),
    }),
  } as unknown as SupabaseClient
  return { supabase, llegadas }
}

describe('enviarParte', () => {
  const fila = filaParte('p1', listo, undefined, hoy, 'c1')
  it('envía primero el certificado y después el parte', async () => {
    const { supabase, llegadas } = supabaseDeMentira()
    expect(await enviarParte(supabase, fila, certificado)).toEqual({ tipo: 'enviado' })
    expect(llegadas).toEqual(['certificado c1', 'parte p1'])
  })
  it('si el certificado no llega, el parte tampoco se envía', async () => {
    const { supabase, llegadas } = supabaseDeMentira(errorFuncion(503))
    expect(await enviarParte(supabase, fila, certificado)).toEqual({ tipo: 'sin-conexion' })
    expect(llegadas).toEqual(['certificado c1'])
  })
  it('sin certificado, solo el parte', async () => {
    const { supabase, llegadas } = supabaseDeMentira()
    await enviarParte(supabase, filaParte('p2', listo, undefined, hoy))
    expect(llegadas).toEqual(['parte p2'])
  })
})
