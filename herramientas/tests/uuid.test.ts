import { expect, test } from 'vitest'
import { idDocumento, uuidV5 } from '../src/uuid.ts'

test('uuidV5 da el valor de referencia del estándar', () => {
  // Espacio de nombres DNS y «python.org»: el ejemplo de la documentación de Python.
  expect(uuidV5('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'python.org')).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d')
})

test('el mismo edificio y la misma huella dan siempre el mismo identificador', () => {
  const edificio = 'bf8db03c-259a-54f2-8933-e6850777d963'
  const huella = '84f400adfb7c1a48323e3219b3a9b6488bcfabbf094bbdef0ace5700c6b580c9'
  expect(idDocumento(edificio, huella)).toBe('45fa1c4e-6c6f-5062-99f1-326869366459')
  expect(idDocumento(edificio, huella)).toBe(idDocumento(edificio, huella))
})

test('otro edificio u otra huella dan otro identificador', () => {
  const huella = 'a'.repeat(64)
  const uno = idDocumento('bf8db03c-259a-54f2-8933-e6850777d963', huella)
  expect(idDocumento('11111111-1111-4111-8111-111111111111', huella)).not.toBe(uno)
  expect(idDocumento('bf8db03c-259a-54f2-8933-e6850777d963', 'b'.repeat(64))).not.toBe(uno)
})

test('rechaza un espacio que no es un UUID', () => {
  expect(() => uuidV5('edificio', 'x')).toThrow('No es un UUID')
})
