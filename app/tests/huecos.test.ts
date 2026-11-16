import { describe, expect, it } from 'vitest'
import { agrupar, campoCsv, huecosCsv, nombreCsv } from '../src/huecos.ts'

// Los huecos del albergue ficticio, en el orden en que podría darlos la base de datos.
const albergue = [
  { instalacion: 'Saneamiento', falta: 'Informe' },
  { instalacion: 'Agua de consumo', falta: 'Certificado' },
  { instalacion: 'Saneamiento', falta: 'Contrato de mantenimiento' },
  { instalacion: 'Calefacción y agua caliente', falta: 'Certificado' },
]

describe('agrupar', () => {
  it('junta los huecos de cada instalación, por orden alfabético', () => {
    expect(agrupar(albergue)).toEqual([
      { instalacion: 'Agua de consumo', faltan: ['Certificado'] },
      { instalacion: 'Calefacción y agua caliente', faltan: ['Certificado'] },
      { instalacion: 'Saneamiento', faltan: ['Contrato de mantenimiento', 'Informe'] },
    ])
  })

  it('ordena como en español: las tildes no mandan al final', () => {
    const grupos = agrupar([{ instalacion: 'Zona', falta: 'x' }, { instalacion: 'Ático', falta: 'x' }])
    expect(grupos.map(g => g.instalacion)).toEqual(['Ático', 'Zona'])
  })

  it('sin huecos, no hay grupos', () => {
    expect(agrupar([])).toEqual([])
  })
})

describe('campoCsv', () => {
  it('deja tal cual un texto normal', () => {
    expect(campoCsv('Calefacción')).toBe('Calefacción')
  })

  it('pone entre comillas lo que lleva punto y coma o comillas', () => {
    expect(campoCsv('Agua; fría')).toBe('"Agua; fría"')
    expect(campoCsv('Sala "grande"')).toBe('"Sala ""grande"""')
  })

  it('pone un apóstrofo delante de lo que Excel tomaría por una fórmula', () => {
    for (const inicio of ['=', '+', '-', '@']) expect(campoCsv(`${inicio}1+1`)).toBe(`'${inicio}1+1`)
  })
})

describe('huecosCsv', () => {
  it('lleva la marca BOM, la cabecera y una fila por hueco, con saltos de Windows', () => {
    expect(huecosCsv(agrupar(albergue))).toBe(
      '﻿instalacion;falta\r\n' +
      'Agua de consumo;Certificado\r\n' +
      'Calefacción y agua caliente;Certificado\r\n' +
      'Saneamiento;Contrato de mantenimiento\r\n' +
      'Saneamiento;Informe\r\n',
    )
  })

  it('sin huecos, solo la cabecera', () => {
    expect(huecosCsv([])).toBe('﻿instalacion;falta\r\n')
  })
})

describe('nombreCsv', () => {
  it('lleva la fecha del día', () => {
    expect(nombreCsv(new Date(2026, 0, 5))).toBe('huecos-2026-01-05.csv')
  })
})
