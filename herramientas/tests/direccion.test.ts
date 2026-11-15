import { expect, test } from 'vitest'
import { comprobarRepositorio, repositorioDeGitHub } from '../src/direccion.ts'

test('saca organización/repositorio de las formas habituales de la dirección', () => {
  for (const direccion of [
    'https://github.com/org/edificio',
    'https://github.com/org/edificio.git',
    'https://github.com/org/edificio/',
    'https://github.com/org/edificio.git/',
    '  https://github.com/org/edificio  ',
    'https://usuario@github.com/org/edificio.git',
    'git@github.com:org/edificio.git',
    'ssh://git@github.com/org/edificio.git',
  ]) expect(repositorioDeGitHub(direccion), direccion).toBe('org/edificio')
})

test('una dirección que no es de GitHub no da repositorio', () => {
  expect(repositorioDeGitHub('https://gitlab.com/org/edificio.git')).toBeNull()
  expect(repositorioDeGitHub('https://github.com.otra.web/org/edificio')).toBeNull()
  expect(repositorioDeGitHub('https://github.com/org/edificio/tree/main')).toBeNull()
  expect(repositorioDeGitHub('C:\\repos\\edificio')).toBeNull()
})

test('deja cargar en el repositorio del edificio', () => {
  expect(() => comprobarRepositorio('https://github.com/org/edificio.git', 'org/edificio')).not.toThrow()
  expect(() => comprobarRepositorio('https://github.com/Org/Edificio', 'org/edificio')).not.toThrow()
})

test('para si el repositorio es otro, aunque acabe igual', () => {
  expect(() => comprobarRepositorio('https://github.com/org/otro.git', 'org/edificio')).toThrow(/el repositorio del edificio es org\/edificio/)
  // Antes valía porque solo se miraba el final.
  expect(() => comprobarRepositorio('https://github.com/otra-org/edificio.git', 'org/edificio')).toThrow(/No se ha escrito nada/)
})

test('para si el edificio no tiene apuntado su repositorio', () => {
  // Antes no salía ni el aviso: cualquier dirección acaba en un texto vacío.
  expect(() => comprobarRepositorio('https://github.com/org/edificio.git', '')).toThrow(/no tiene apuntado su repositorio/)
  expect(() => comprobarRepositorio('https://github.com/org/edificio.git', '  ')).toThrow(/no tiene apuntado su repositorio/)
})

test('para si la dirección no es de GitHub', () => {
  expect(() => comprobarRepositorio('C:\\repos\\edificio', 'org/edificio')).toThrow(/no es la dirección de un repositorio de GitHub/)
})
