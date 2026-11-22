import { describe, expect, it } from 'vitest'
import { almacenEnMemoria, clasificar, Cola, type Resultado } from '../src/cola.ts'
import type { Certificado, FilaParte, Foto } from '../src/parte.ts'
import { conRecuerdo } from '../src/recuerdo.ts'

const fila = (id: string, fecha = '2026-11-16'): FilaParte => ({
  id, instalacion_id: 'i1', fecha, tipo: 'comprobacion', descripcion: `Parte ${id}`, revision_id: null, proxima_revision: null,
  certificado_id: null,
})

/** Un servidor de mentira: responde lo que se le diga y apunta qué recibe. */
function servidor(respuestas: Resultado[] = []) {
  const recibidos: string[] = []
  let porDefecto: Resultado = { tipo: 'enviado' }
  return {
    recibidos,
    caer: () => { porDefecto = { tipo: 'sin-conexion' } },
    volver: () => { porDefecto = { tipo: 'enviado' } },
    enviar: async (f: FilaParte) => { recibidos.push(f.id); return respuestas.shift() ?? porDefecto },
  }
}

describe('clasificar', () => {
  it('sin código es la red: se reintenta', () => {
    expect(clasificar({ message: 'TypeError: Failed to fetch' })).toEqual({ tipo: 'sin-conexion' })
    expect(clasificar({ code: '', message: 'AbortError' })).toEqual({ tipo: 'sin-conexion' })
  })
  it('la sesión caducada se reintenta: se renueva sola al volver la red', () => {
    expect(clasificar({ code: 'PGRST303', message: 'JWT expired' }).tipo).toBe('sin-conexion')
  })
  it('los fallos pasajeros de PostgreSQL se reintentan', () => {
    for (const code of ['08006', '40001', '53300', '57014']) expect(clasificar({ code, message: '' }).tipo).toBe('sin-conexion')
  })
  it('sin permiso es un rechazo, con un motivo que se entiende', () => {
    const r = clasificar({ code: '42501', message: 'new row violates row-level security policy' })
    expect(r.tipo).toBe('rechazado')
    expect(r.tipo === 'rechazado' && r.motivo).toMatch(/No tienes permiso/)
  })
  it('un dato que no vale es un rechazo', () => {
    expect(clasificar({ code: '23514', message: 'check' }).tipo).toBe('rechazado')
    expect(clasificar({ code: 'P0001', message: 'La revisión no es tuya' }).tipo).toBe('rechazado')
  })
})

describe('Cola', () => {
  it('sin red, guarda el certificado con el parte y los envía juntos al volver la conexión', async () => {
    const almacen = almacenEnMemoria()
    const certificado: Certificado = {
      id: 'c1', archivo: new Blob(['%PDF-1.7 ficticio']), nombre: 'cert.pdf', titulo: 'Certificado', fecha: '2026-11-16', instalacion: 'i1',
    }
    const recibidos: (string | undefined)[] = []
    let hayRed = false
    const cola = new Cola(almacen, async (_f, c) => {
      if (!hayRed) return { tipo: 'sin-conexion' }
      recibidos.push(await c?.archivo.text())
      return { tipo: 'enviado' }
    })
    expect(await cola.registrar('ana', { ...fila('p1'), certificado_id: 'c1' }, certificado)).toEqual({ tipo: 'sin-conexion' })
    expect(almacen.datos.get('p1')?.certificado?.nombre).toBe('cert.pdf')
    hayRed = true
    await cola.reintentar('ana')
    expect(recibidos).toEqual(['%PDF-1.7 ficticio'])
    expect(almacen.datos.size).toBe(0)
  })

  it('si se corta la red a mitad, el siguiente intento solo envía lo que falta', async () => {
    const almacen = almacenEnMemoria()
    const certificado: Certificado = {
      id: 'c1', archivo: new Blob(['%PDF-1.7 ficticio']), nombre: 'cert.pdf', titulo: 'Certificado', fecha: '2026-11-16', instalacion: 'i1',
    }
    const fotos: Foto[] = ['f1', 'f2', 'f3'].map(id => ({ id, archivo: new Blob(['jpeg']), nombre: `${id}.jpg` }))
    const intentos: string[][] = []
    let red = 3
    // Llega el certificado, el parte y la primera foto, y se corta. Después llega todo.
    const cola = new Cola(almacen, async (_f, c, fs = [], llega = async () => {}) => {
      const enviado: string[] = []
      intentos.push(enviado)
      const paso = async (que: string, l: Parameters<typeof llega>[0]) => {
        if (red-- <= 0) return false
        enviado.push(que)
        await llega(l)
        return true
      }
      if (c && !(await paso('certificado', { que: 'certificado' }))) return { tipo: 'sin-conexion' }
      if (!(await paso('parte', { que: 'parte' }))) return { tipo: 'sin-conexion' }
      for (const f of fs) if (!(await paso(f.id, { que: 'foto', id: f.id }))) return { tipo: 'sin-conexion' }
      return { tipo: 'enviado' }
    })
    expect(await cola.registrar('ana', { ...fila('p1'), certificado_id: 'c1' }, certificado, fotos)).toEqual({ tipo: 'sin-conexion' })
    const guardado = almacen.datos.get('p1')
    expect(guardado?.certificado).toBeUndefined()
    expect(guardado?.parteLlegado).toBe(true)
    expect(guardado?.fotos?.map(f => f.id)).toEqual(['f2', 'f3'])

    red = 100
    await cola.reintentar('ana')
    // El certificado y la primera foto no se repiten. El parte sí, que no pesa y no se duplica.
    expect(intentos).toEqual([['certificado', 'parte', 'f1'], ['parte', 'f2', 'f3']])
    expect(almacen.datos.size).toBe(0)
  })

  it('si el parte llega pero una foto se rechaza, se queda con el aviso y la foto que falta', async () => {
    const almacen = almacenEnMemoria()
    const fotos: Foto[] = ['f1', 'f2'].map(id => ({ id, archivo: new Blob(['jpeg']), nombre: `${id}.jpg` }))
    const cola = new Cola(almacen, async (_f, _c, _fs, llega = async () => {}) => {
      await llega({ que: 'parte' })
      await llega({ que: 'foto', id: 'f2' })
      return { tipo: 'enviado', aviso: 'El parte ha llegado, pero una foto no.' }
    })
    expect(await cola.registrar('ana', fila('p1'), undefined, fotos)).toEqual({ tipo: 'enviado', aviso: 'El parte ha llegado, pero una foto no.' })
    const { pendientes, rechazados } = await cola.recuento('ana')
    expect(pendientes).toBe(0)
    expect(rechazados.map(p => [p.parteLlegado, p.rechazo, p.fotos?.map(f => f.id)]))
      .toEqual([[true, 'El parte ha llegado, pero una foto no.', ['f1']]])
  })

  it('con red, envía el parte y no lo deja en el móvil', async () => {
    const almacen = almacenEnMemoria(), s = servidor()
    const cola = new Cola(almacen, s.enviar)
    expect(await cola.registrar('ana', fila('p1'))).toEqual({ tipo: 'enviado' })
    expect(s.recibidos).toEqual(['p1'])
    expect(almacen.datos.size).toBe(0)
  })

  it('sin red, lo guarda y lo envía al volver la conexión, una sola vez', async () => {
    const almacen = almacenEnMemoria(), s = servidor()
    const cola = new Cola(almacen, s.enviar)
    s.caer()
    expect(await cola.registrar('ana', fila('p1'))).toEqual({ tipo: 'sin-conexion' })
    expect(await cola.recuento('ana')).toEqual({ pendientes: 1, rechazados: [] })
    await cola.reintentar('ana')
    expect(almacen.datos.size).toBe(1)
    s.volver()
    await cola.reintentar('ana')
    await cola.reintentar('ana')
    expect(almacen.datos.size).toBe(0)
    // Un intento al registrar, uno sin red y uno bueno. Después ya no queda nada que enviar.
    expect(s.recibidos).toEqual(['p1', 'p1', 'p1'])
  })

  it('envía del más antiguo al más nuevo y para al primer fallo de red', async () => {
    const almacen = almacenEnMemoria()
    let minuto = 0
    const reloj = () => new Date(Date.UTC(2026, 10, 16, 10, minuto++))
    const s = servidor()
    const cola = new Cola(almacen, s.enviar, reloj)
    s.caer()
    for (const id of ['a', 'b', 'c']) await cola.registrar('ana', fila(id))
    s.recibidos.length = 0
    const respuestas: Resultado[] = [{ tipo: 'enviado' }, { tipo: 'sin-conexion' }]
    const cola2 = new Cola(almacen, async f => { s.recibidos.push(f.id); return respuestas.shift() ?? { tipo: 'enviado' } })
    await cola2.reintentar('ana')
    expect(s.recibidos).toEqual(['a', 'b'])
    expect([...almacen.datos.keys()].sort()).toEqual(['b', 'c'])
  })

  it('un rechazo se conserva con su motivo y no se reintenta solo', async () => {
    const almacen = almacenEnMemoria()
    const s = servidor([{ tipo: 'rechazado', motivo: 'No es tuya' }])
    const cola = new Cola(almacen, s.enviar)
    expect(await cola.registrar('ana', fila('p1'))).toEqual({ tipo: 'rechazado', motivo: 'No es tuya' })
    await cola.reintentar('ana')
    expect(s.recibidos).toEqual(['p1'])
    const { pendientes, rechazados } = await cola.recuento('ana')
    expect(pendientes).toBe(0)
    expect(rechazados.map(p => p.rechazo)).toEqual(['No es tuya'])
    await cola.descartar('p1')
    expect(almacen.datos.size).toBe(0)
  })

  it('un rechazo al reintentar también se conserva', async () => {
    const almacen = almacenEnMemoria()
    const s = servidor([{ tipo: 'sin-conexion' }, { tipo: 'rechazado', motivo: 'Acceso caducado' }])
    const cola = new Cola(almacen, s.enviar)
    await cola.registrar('ana', fila('p1'))
    await cola.reintentar('ana')
    expect((await cola.recuento('ana')).rechazados[0].rechazo).toBe('Acceso caducado')
  })

  it('en un móvil compartido, cada persona solo envía los suyos', async () => {
    const almacen = almacenEnMemoria(), s = servidor()
    const cola = new Cola(almacen, s.enviar)
    s.caer()
    await cola.registrar('ana', fila('de-ana'))
    await cola.registrar('luis', fila('de-luis'))
    s.volver()
    s.recibidos.length = 0
    await cola.reintentar('luis')
    expect(s.recibidos).toEqual(['de-luis'])
    expect(await cola.recuento('ana')).toEqual({ pendientes: 1, rechazados: [] })
  })

  it('dos reintentos a la vez no envían dos veces', async () => {
    const almacen = almacenEnMemoria(), s = servidor()
    const cola = new Cola(almacen, s.enviar)
    s.caer()
    await cola.registrar('ana', fila('p1'))
    s.volver()
    s.recibidos.length = 0
    await Promise.all([cola.reintentar('ana'), cola.reintentar('ana'), cola.reintentar('ana')])
    expect(s.recibidos).toEqual(['p1'])
  })

  it('si el móvil no deja guardar y no hay red, lo dice en vez de perderlo en silencio', async () => {
    const s = servidor()
    s.caer()
    const roto = { todos: async () => [], poner: async () => { throw new Error('QuotaExceeded') }, quitar: async () => {} }
    const r = await new Cola(roto, s.enviar).registrar('ana', fila('p1'))
    expect(r.tipo).toBe('rechazado')
    expect(r.tipo === 'rechazado' && r.motivo).toMatch(/no deja guardar/)
  })

  it('si el móvil no deja guardar pero hay red, lo envía igualmente', async () => {
    const s = servidor()
    const roto = { todos: async () => [], poner: async () => { throw new Error('QuotaExceeded') }, quitar: async () => {} }
    expect(await new Cola(roto, s.enviar).registrar('ana', fila('p1'))).toEqual({ tipo: 'enviado' })
  })

  it('avisa a quien escucha cuando cambia algo', async () => {
    const cola = new Cola(almacenEnMemoria(), servidor().enviar)
    let avisos = 0
    const dejar = cola.escuchar(() => avisos++)
    await cola.registrar('ana', fila('p1'))
    expect(avisos).toBeGreaterThan(0)
    dejar()
    const antes = avisos
    await cola.registrar('ana', fila('p2'))
    expect(avisos).toBe(antes)
  })
})

describe('conRecuerdo', () => {
  const almacen = () => {
    const datos = new Map<string, string>()
    return { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => { datos.set(k, v) } }
  }

  it('con red, lee y lo guarda', async () => {
    const a = almacen()
    expect(await conRecuerdo('k', async () => ({ n: 1 }), a)).toEqual({ datos: { n: 1 }, deMemoria: false })
    expect(a.getItem('k')).toBe('{"n":1}')
  })
  it('sin red, devuelve lo de la última vez y lo dice', async () => {
    const a = almacen()
    await conRecuerdo('k', async () => ({ n: 1 }), a)
    expect(await conRecuerdo('k', async () => { throw new Error('sin red') }, a)).toEqual({ datos: { n: 1 }, deMemoria: true })
  })
  it('si el móvil sabe que no hay red, no espera a la lectura', async () => {
    const a = almacen()
    await conRecuerdo('k', async () => ({ n: 1 }), a)
    let leido = false
    const r = await conRecuerdo('k', async () => { leido = true; return { n: 2 } }, a, () => false)
    expect(r).toEqual({ datos: { n: 1 }, deMemoria: true })
    expect(leido).toBe(false)
  })
  it('sin red y sin nada guardado, lo intenta igualmente', async () => {
    expect(await conRecuerdo('k', async () => ({ n: 2 }), almacen(), () => false)).toEqual({ datos: { n: 2 }, deMemoria: false })
  })
  it('sin red y sin nada guardado, deja pasar el error', async () => {
    await expect(conRecuerdo('k', async () => { throw new Error('sin red') }, almacen())).rejects.toThrow('sin red')
  })
  it('una respuesta vacía también se guarda: si quitan el acceso, no vale la de antes', async () => {
    const a = almacen()
    await conRecuerdo('k', async () => ({ n: 1 }), a)
    await conRecuerdo('k', async () => null, a)
    expect(await conRecuerdo('k', async () => { throw new Error('sin red') }, a)).toEqual({ datos: null, deMemoria: true })
  })
})
