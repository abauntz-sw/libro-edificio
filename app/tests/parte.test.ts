import { describe, expect, it } from 'vitest'
import {
  BORRADOR_VACIO, type Borrador, faltaEnParte, filaParte, hoyLocal, type Revision, revisionesDe, sumarMeses, tiposDe,
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
      revision_id: null, proxima_revision: null,
    })
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
