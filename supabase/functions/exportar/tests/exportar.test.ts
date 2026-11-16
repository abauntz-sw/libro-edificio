import { assertEquals } from '@std/assert'
import type { Cambio, Repositorio } from '../../archivos/github.ts'
import { atender } from '../exportar.ts'
import type { Libro } from '../exportar.ts'

const CLAVE = 'sb_secret_de_prueba'

const libroDeMentira: Libro = {
  edificios: () => Promise.resolve([
    { id: 'e1', nombre: 'Albergue Ficticio', repositorio: 'ficticia/albergue' },
    { id: 'e2', nombre: 'Refugio Ficticio', repositorio: 'ficticia/refugio' },
  ]),
  indice: edificio => Promise.resolve([
    { archivo: 'indice/documentos.csv', contenido: `﻿ruta\r\n${edificio}\r\n` },
    { archivo: 'indice/partes.csv', contenido: '﻿fecha\r\n' },
  ]),
}

/** Un repositorio de mentira que apunta lo que se le pide. Puede fallar con un repositorio concreto. */
function repositorioDeMentira(falla = '') {
  const pedidos: { repositorio: string; rutas: string[]; mensaje: string; primero: string }[] = []
  const repositorio: Repositorio = {
    actualizar(repositorio, archivos, mensaje): Promise<Cambio> {
      if (repositorio === falla) return Promise.reject(new Error('La GitHub App no está instalada en el repositorio del edificio'))
      pedidos.push({
        repositorio, mensaje, rutas: [...archivos.keys()],
        primero: new TextDecoder('utf-8', { ignoreBOM: true }).decode(archivos.get('indice/documentos.csv')),
      })
      return Promise.resolve({ commit: `commit-${repositorio}`, cambiados: [...archivos.keys()] })
    },
  }
  return { repositorio, pedidos }
}

const peticion = (cabeceras: Record<string, string> = { apikey: CLAVE }, method = 'POST') =>
  new Request('http://localhost/exportar', { method, headers: cabeceras })
const piezas = (repositorio: Repositorio) => ({ claveSecreta: CLAVE, libro: libroDeMentira, repositorio, hoy: () => '2026-11-16' })

Deno.test('sin la clave secreta no exporta nada', async () => {
  const { repositorio, pedidos } = repositorioDeMentira()
  const intentos: Record<string, string>[] = [{}, { apikey: 'sb_publishable_cualquiera' }, { Authorization: `Bearer ${CLAVE}` }]
  for (const cabeceras of intentos) {
    const respuesta = await atender(peticion(cabeceras), piezas(repositorio))
    assertEquals(respuesta.status, 401)
  }
  assertEquals(pedidos, [])
})

Deno.test('si la clave de la función está vacía, no deja pasar a nadie', async () => {
  const { repositorio } = repositorioDeMentira()
  const respuesta = await atender(peticion({ apikey: '' }), { ...piezas(repositorio), claveSecreta: '' })
  assertEquals(respuesta.status, 401)
})

Deno.test('solo con POST', async () => {
  const { repositorio } = repositorioDeMentira()
  assertEquals((await atender(peticion({ apikey: CLAVE }, 'GET'), piezas(repositorio))).status, 405)
})

Deno.test('exporta cada edificio a su repositorio, con la fecha en el mensaje', async () => {
  const { repositorio, pedidos } = repositorioDeMentira()
  const respuesta = await atender(peticion(), piezas(repositorio))

  assertEquals(respuesta.status, 200)
  assertEquals(pedidos.map(p => p.repositorio), ['ficticia/albergue', 'ficticia/refugio'])
  assertEquals(pedidos[0].rutas, ['indice/documentos.csv', 'indice/partes.csv'])
  assertEquals(pedidos[0].mensaje, 'Actualiza el índice (2026-11-16)')
  // La marca BOM llega al archivo: sin ella, Excel no lee bien las tildes.
  assertEquals(pedidos[1].primero, '﻿ruta\r\ne2\r\n')
  const { resultados } = await respuesta.json()
  assertEquals(resultados[0], {
    edificio: 'Albergue Ficticio', commit: 'commit-ficticia/albergue', cambiados: ['indice/documentos.csv', 'indice/partes.csv'],
  })
})

Deno.test('si un edificio falla, sigue con los demás y responde con error', async () => {
  const { repositorio, pedidos } = repositorioDeMentira('ficticia/albergue')
  const respuesta = await atender(peticion(), piezas(repositorio))

  assertEquals(respuesta.status, 500)
  assertEquals(pedidos.map(p => p.repositorio), ['ficticia/refugio'])
  const { resultados } = await respuesta.json()
  assertEquals(resultados[0], {
    edificio: 'Albergue Ficticio', error: 'La GitHub App no está instalada en el repositorio del edificio',
  })
})
