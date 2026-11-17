import { expect, test } from 'vitest'
import { avisoUnidadDeRed, leerNetUse } from '../src/red.ts'

// Lo que escribe `net use` en un Windows en español. Los nombres son ficticios.
const NET_USE = [
  'Se registrarán las nuevas conexiones.',
  '',
  'Estado       Local     Remoto                    Red',
  '',
  '-------------------------------------------------------------------------------',
  'OK           Z:        \\\\servidor\\documentos     Microsoft Windows Network',
  'Desconectado Y:        \\\\otro\\Archivo FNDME',
  '                                                Microsoft Windows Network',
  'OK                     \\\\servidor\\IPC$          Microsoft Windows Network',
  'Se ha completado el comando correctamente.',
].join('\r\n')

test('lee las letras de red de net use, también con espacios en el nombre y sin depender del idioma', () => {
  expect(leerNetUse(NET_USE)).toEqual(new Map([
    ['Z', '\\\\servidor\\documentos'],
    ['Y', '\\\\otro\\Archivo FNDME'],
  ]))
  expect(leerNetUse('No hay entradas en la lista.')).toEqual(new Map())
})

test('avisa de una ruta en una unidad de red y propone la dirección del servidor', () => {
  const unidades = leerNetUse(NET_USE)
  const aviso = avisoUnidadDeRed('Z:\\Mantenimiento\\Caldera', unidades)
  expect(aviso).toContain('una unidad de red')
  expect(aviso).toContain('Mejor escanea \\\\servidor\\documentos\\Mantenimiento\\Caldera')
  expect(avisoUnidadDeRed('z:/Mantenimiento', unidades)).toContain('\\\\servidor\\documentos\\Mantenimiento')
  expect(avisoUnidadDeRed('Z:\\', unidades)).toContain('Mejor escanea \\\\servidor\\documentos')
})

test('no avisa de un disco local ni de una dirección de red', () => {
  const unidades = leerNetUse(NET_USE)
  expect(avisoUnidadDeRed('C:\\Papel', unidades)).toBeUndefined()
  expect(avisoUnidadDeRed('\\\\servidor\\documentos\\Papel', unidades)).toBeUndefined()
  expect(avisoUnidadDeRed('/home/papel', unidades)).toBeUndefined()
})
