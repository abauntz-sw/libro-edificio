import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  aPapelera, bajarDocumento, buscar, caducidad, type Catalogo, type Documento, EDIFICIO, enGrupo, grupos, hoy,
  leerDocumentos, pideAtencion, POR_TANDA, recuperar, sinAcentos, textoCaducidad,
} from '../src/archivo.ts'

// Un catálogo y unos documentos ficticios, como los del seed.
const catalogo: Catalogo = {
  tipos: new Map([['certificado', 'Certificado'], ['contrato-mantenimiento', 'Contrato de mantenimiento'], ['licencia', 'Licencia']]),
  instalaciones: new Map([['i-calor', 'Calefacción y agua caliente'], ['i-incendios', 'Protección contra incendios'], ['i-agua', 'Agua de consumo']]),
}

const doc = (id: string, cambios: Partial<Documento> = {}): Documento => ({
  id, tipo: 'certificado', titulo: `Documento ${id}`, fecha: '2026-03-10', emisor: '', caduca: null,
  nombreOriginal: `${id}.pdf`, instalaciones: [], eliminadoEn: null, ...cambios,
})

const documentos = [
  doc('a', { titulo: 'Revisión de la caldera', emisor: 'Calor Ficticio SL', instalaciones: ['i-calor'], fecha: '2025-11-02' }),
  doc('b', { titulo: 'Contrato de contraincendios', tipo: 'contrato-mantenimiento', instalaciones: ['i-incendios'], nombreOriginal: 'scan0012.pdf' }),
  doc('c', { titulo: 'Licencia de actividad', tipo: 'licencia', fecha: '2021-06-02' }),
  doc('d', { titulo: 'Certificado de la instalación', instalaciones: ['i-calor', 'i-incendios'] }),
]

describe('caducidad', () => {
  const dia = '2026-11-23'
  it('sin fecha de caducidad, no caduca', () => {
    expect(caducidad(null, dia)).toEqual({ estado: 'sin' })
  })
  it('caducado desde el día siguiente a su fecha', () => {
    expect(caducidad('2026-11-22', dia)).toEqual({ estado: 'caducado' })
    expect(caducidad('2026-11-23', dia)).toEqual({ estado: 'pronto', dias: 0 })
  })
  it('pronto si caduca en 90 días o menos; vigente si falta más', () => {
    expect(caducidad('2027-02-21', dia)).toEqual({ estado: 'pronto', dias: 90 })
    expect(caducidad('2027-02-22', dia)).toEqual({ estado: 'vigente' })
  })
  it('cuenta bien los días aunque cambie la hora (finales de marzo)', () => {
    expect(caducidad('2027-04-01', '2027-03-20')).toEqual({ estado: 'pronto', dias: 12 })
  })
  it('lo dice en palabras, con singular', () => {
    expect([{ estado: 'caducado' }, { estado: 'pronto', dias: 0 }, { estado: 'pronto', dias: 1 }, { estado: 'pronto', dias: 12 }]
      .map(c => textoCaducidad(c as never))).toEqual(['Caducado', 'Caduca hoy', 'Caduca mañana', 'Caduca en 12 días'])
  })
  it('pideAtencion: caducados y por caducar', () => {
    expect([null, '2026-01-01', '2026-12-01', '2028-01-01'].map(c => pideAtencion(doc('x', { caduca: c }), dia)))
      .toEqual([false, true, true, false])
  })
  it('hoy es la fecha de este aparato, no la de Greenwich', () => {
    expect(hoy(new Date(2026, 0, 5, 0, 30))).toBe('2026-01-05')
  })
})

describe('buscar', () => {
  const ids = (texto: string) => buscar(documentos, texto, catalogo).map(d => d.id)

  it('sin texto, salen todos', () => {
    expect(ids('  ')).toEqual(['a', 'b', 'c', 'd'])
  })
  it('sin distinguir acentos ni mayúsculas', () => {
    expect(ids('REVISION')).toEqual(['a'])
    expect(ids('calefacción')).toEqual(['a', 'd'])
    expect(sinAcentos('Pequeño ÁTICO')).toBe('pequeno atico')
  })
  it('busca en el título, el emisor, el nombre recibido, el tipo y la instalación', () => {
    expect(ids('ficticio')).toEqual(['a'])
    expect(ids('scan0012')).toEqual(['b'])
    expect(ids('licencia')).toEqual(['c'])
    expect(ids('mantenimiento')).toEqual(['b'])
    expect(ids('incendios')).toEqual(['b', 'd'])
  })
  it('con varias palabras, en cualquier orden, tienen que estar todas', () => {
    expect(ids('caldera revision')).toEqual(['a'])
    expect(ids('caldera licencia')).toEqual([])
  })
})

describe('grupos', () => {
  it('por instalación: todas, aunque no tengan documentos, y al final «Edificio en general»', () => {
    expect(grupos(documentos, 'instalacion', catalogo, false)).toEqual([
      { clave: 'i-agua', nombre: 'Agua de consumo', cuenta: 0 },
      { clave: 'i-calor', nombre: 'Calefacción y agua caliente', cuenta: 2 },
      { clave: 'i-incendios', nombre: 'Protección contra incendios', cuenta: 2 },
      { clave: EDIFICIO, nombre: 'Edificio en general', cuenta: 1 },
    ])
  })
  it('una empresa no tiene «Edificio en general»: no ve esos documentos', () => {
    expect(grupos(documentos, 'instalacion', catalogo, true).map(g => g.clave)).not.toContain(EDIFICIO)
  })
  it('por tipo, por orden alfabético; por año, del más nuevo al más antiguo', () => {
    expect(grupos(documentos, 'tipo', catalogo, false).map(g => [g.nombre, g.cuenta]))
      .toEqual([['Certificado', 2], ['Contrato de mantenimiento', 1], ['Licencia', 1]])
    expect(grupos(documentos, 'ano', catalogo, false).map(g => [g.nombre, g.cuenta]))
      .toEqual([['2026', 2], ['2025', 1], ['2021', 1]])
  })
  it('enGrupo: sin grupo, están todos', () => {
    expect(documentos.filter(d => enGrupo(d, 'ano', null))).toHaveLength(4)
    expect(documentos.filter(d => enGrupo(d, 'instalacion', EDIFICIO)).map(d => d.id)).toEqual(['c'])
  })
})

/** Un Supabase de mentira que apunta qué se le pide y contesta con filas inventadas. */
function supabaseFalso(total: number) {
  const pedidas: { filtro: string; desde: number; hasta: number }[] = []
  const cambios: { campos: Record<string, unknown>; id: string }[] = []
  let filasCambiadas = 1
  const consulta = () => {
    let filtro = ''
    const c = {
      select: () => c,
      is: (campo: string) => { filtro = `${campo} es nulo`; return c },
      not: (campo: string) => { filtro = `${campo} no es nulo`; return c },
      order: () => c,
      range: (desde: number, hasta: number) => {
        pedidas.push({ filtro, desde, hasta })
        const filas = Array.from({ length: Math.max(0, Math.min(hasta + 1, total) - desde) }, (_, k) => ({
          id: `d${desde + k}`, tipo_id: 'certificado', titulo: 'T', fecha: '2026-01-01', emisor: '', caduca: null,
          nombre_original: 'x.pdf', eliminado_en: null, documento_instalaciones: [{ instalacion_id: 'i-calor' }],
        }))
        return Promise.resolve({ data: filas, error: null })
      },
      update: (campos: Record<string, unknown>) => ({
        eq: (_campo: string, id: string) => { cambios.push({ campos, id }); return Promise.resolve({ error: null, count: filasCambiadas }) },
      }),
    }
    return c
  }
  const supabase = { from: () => consulta() } as unknown as SupabaseClient
  return { supabase, pedidas, cambios, sinPermiso: () => { filasCambiadas = 0 } }
}

describe('leer los documentos', () => {
  it('los pide por tandas hasta que llega una incompleta, y avisa con cada una', async () => {
    const { supabase, pedidas } = supabaseFalso(POR_TANDA + 20)
    const avisos: number[] = []
    const leidos = await leerDocumentos(supabase, false, hasta => avisos.push(hasta.length))
    expect(leidos).toHaveLength(POR_TANDA + 20)
    expect(avisos).toEqual([POR_TANDA, POR_TANDA + 20])
    expect(pedidas).toEqual([
      { filtro: 'eliminado_en es nulo', desde: 0, hasta: POR_TANDA - 1 },
      { filtro: 'eliminado_en es nulo', desde: POR_TANDA, hasta: 2 * POR_TANDA - 1 },
    ])
    expect(leidos[0]).toMatchObject({ id: 'd0', tipo: 'certificado', nombreOriginal: 'x.pdf', instalaciones: ['i-calor'] })
  })
  it('la papelera pide los que tienen fecha de borrado', async () => {
    const { supabase, pedidas } = supabaseFalso(3)
    expect(await leerDocumentos(supabase, true)).toHaveLength(3)
    expect(pedidas.map(p => p.filtro)).toEqual(['eliminado_en no es nulo'])
  })
})

describe('la papelera', () => {
  it('apunta cuándo y quién, y al recuperar lo deja vacío', async () => {
    const { supabase, cambios } = supabaseFalso(0)
    await aPapelera(supabase, 'doc-1', 'usuario-1')
    await recuperar(supabase, 'doc-1')
    expect(cambios[0].id).toBe('doc-1')
    expect(cambios[0].campos.eliminado_por).toBe('usuario-1')
    expect(Date.parse(String(cambios[0].campos.eliminado_en))).not.toBeNaN()
    expect(cambios[1].campos).toEqual({ eliminado_en: null, eliminado_por: null })
  })
  it('si la base de datos no cambia nada (sin permiso), lo dice', async () => {
    const { supabase, sinPermiso } = supabaseFalso(0)
    sinPermiso()
    await expect(aPapelera(supabase, 'doc-1', 'usuario-1')).rejects.toThrow('no tienes permiso')
  })
})

describe('bajar un documento', () => {
  const conFuncion = (contesta: () => Promise<{ data: unknown; error: unknown }>) => {
    const pedidas: unknown[][] = []
    const supabase = { functions: { invoke: (...datos: unknown[]) => { pedidas.push(datos); return contesta() } } } as unknown as SupabaseClient
    return { supabase, pedidas }
  }

  it('lo pide con GET a la función «archivos» y devuelve el PDF', async () => {
    const pdf = new Blob(['%PDF-1.7'], { type: 'application/pdf' })
    const { supabase, pedidas } = conFuncion(async () => ({ data: pdf, error: null }))
    expect(await bajarDocumento(supabase, 'doc 1')).toBe(pdf)
    expect(pedidas[0][0]).toBe('archivos?id=doc%201')
    expect(pedidas[0][1]).toMatchObject({ method: 'GET' })
  })
  it('cuenta lo que dice la función, o que no hay red, o que la sesión ha caducado', async () => {
    const con = (estado: number, cuerpo: unknown) => conFuncion(async () => ({ data: null, error: { context: new Response(JSON.stringify(cuerpo), { status: estado }) } })).supabase
    await expect(bajarDocumento(con(404, { error: 'No se encuentra ese documento.' }), 'x')).rejects.toThrow('No se encuentra ese documento.')
    await expect(bajarDocumento(con(401, {}), 'x')).rejects.toThrow('La sesión ha caducado')
    await expect(bajarDocumento(conFuncion(async () => ({ data: null, error: { context: undefined } })).supabase, 'x')).rejects.toThrow('No hay conexión')
    await expect(bajarDocumento(conFuncion(() => Promise.reject(new Error('red'))).supabase, 'x')).rejects.toThrow('No hay conexión')
  })
})
