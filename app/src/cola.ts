// Partes sin enviar (tarea 1.7).
//
// En el refugio a menudo no hay cobertura. Por eso un parte se guarda primero en el móvil, en IndexedDB,
// y solo se borra de ahí cuando la base de datos lo ha aceptado. Si no hay red, se queda pendiente
// y se vuelve a intentar al abrir la aplicación, al volver la conexión y al volver a la pestaña.
//
// Reenviar nunca duplica: el identificador del parte lo crea el móvil, y la base de datos ignora
// un parte que ya tiene (`on conflict do nothing`). Así da igual si la respuesta se perdió por el camino.
//
// Si la base de datos rechaza un parte (por ejemplo, porque la revisión ya no está a cargo de esa persona),
// no se reintenta: se conserva con el motivo, para que la persona lo vea y decida.
//
// Un parte puede llevar un certificado y fotos, que pesan mucho más que el parte. Por eso, cada cosa
// que llega se quita de lo guardado: si la cobertura se corta a mitad, el siguiente intento
// solo envía lo que falta.

import type { Certificado, FilaParte, Foto, Llegada } from './parte.ts'

export interface Pendiente {
  /** El mismo identificador que el parte. */
  id: string
  /** Quién lo escribió. En un móvil compartido, cada persona solo envía los suyos. */
  authId: string
  fila: FilaParte
  /** El certificado, si lo lleva y todavía no ha llegado. Se envía antes que el parte. */
  certificado?: Certificado
  /** Las fotos que todavía no han llegado. Se envían después del parte. */
  fotos?: Foto[]
  /** Si el parte ya está en la base de datos. Entonces solo falta alguna foto. */
  parteLlegado?: boolean
  /** Cuándo se guardó, en hora universal. */
  guardado: string
  /** Si la base de datos lo ha rechazado, por qué. Un parte rechazado no se reintenta solo. */
  rechazo?: string
}

/** Dónde se guardan. En el navegador, IndexedDB; en los tests, la memoria. */
export interface Almacen {
  todos(): Promise<Pendiente[]>
  poner(pendiente: Pendiente): Promise<void>
  quitar(id: string): Promise<void>
}

/** Lo que pasa al enviar un parte. */
export type Resultado =
  /** Ha llegado. Si una foto se ha rechazado, el aviso lo dice: el parte está, pero sin esa foto. */
  | { tipo: 'enviado'; aviso?: string }
  /** No ha llegado, pero puede llegar más tarde: sin red, el servidor caído o la sesión por renovar. */
  | { tipo: 'sin-conexion' }
  /** La base de datos no lo acepta. Reintentar no lo arreglaría. */
  | { tipo: 'rechazado'; motivo: string }

/**
 * Envía un parte con lo que lleva. Avisa con `llega` de cada cosa que llega.
 * Con `parteLlegado`, el parte ya está en la base de datos y solo se envían las fotos.
 */
export type Enviar = (
  fila: FilaParte, certificado?: Certificado, fotos?: Foto[], llega?: (l: Llegada) => Promise<void>, parteLlegado?: boolean,
) => Promise<Resultado>

/** Error de Supabase, con lo que interesa aquí. */
export interface ErrorSupabase {
  code?: string
  message: string
}

/**
 * Decide si un error de Supabase es pasajero o definitivo.
 *
 * Sin código, el error viene de la red: la petición no llegó o no volvió. Los códigos de PostgreSQL
 * de conexión (08), de concurrencia (40), de recursos (53) y de parada (57) también son pasajeros, igual
 * que los de PostgREST de la sesión (PGRST3xx), porque la sesión se renueva sola al volver la red.
 * El resto, como 42501 (sin permiso) o 23xxx (datos que no valen), es un rechazo.
 */
export function clasificar(error: ErrorSupabase): Resultado {
  const codigo = error.code ?? ''
  if (codigo === '' || /^(08|40|53|57)/.test(codigo) || /^PGRST3/.test(codigo)) return { tipo: 'sin-conexion' }
  if (codigo === '42501') {
    return { tipo: 'rechazado', motivo: 'No tienes permiso para registrar este parte. Puede que la revisión ya no esté a tu cargo o que tu acceso haya caducado.' }
  }
  return { tipo: 'rechazado', motivo: `La base de datos no lo acepta: ${error.message}` }
}

/** Cuántos partes quedan de una persona: los que esperan red y los rechazados. */
export interface Recuento {
  pendientes: number
  rechazados: Pendiente[]
}

/**
 * La cola de partes de este móvil.
 * Solo hay un envío a la vez: si se pide otro mientras tanto, espera al que está en marcha.
 */
export class Cola {
  private enMarcha: Promise<void> | null = null
  private oyentes = new Set<() => void>()

  private almacen: Almacen
  private enviar: Enviar
  private ahora: () => Date

  constructor(almacen: Almacen, enviar: Enviar, ahora = () => new Date()) {
    this.almacen = almacen
    this.enviar = enviar
    this.ahora = ahora
  }

  /** Avisa cuando cambia algo, para poner al día lo que se ve. Devuelve cómo dejar de escuchar. */
  escuchar(oyente: () => void): () => void {
    this.oyentes.add(oyente)
    return () => { this.oyentes.delete(oyente) }
  }

  private avisar() {
    for (const oyente of this.oyentes) oyente()
  }

  /**
   * Guarda el parte en el móvil y lo intenta enviar.
   * Si guardarlo falla (sin espacio, modo privado), lo envía igualmente: mejor eso que perderlo.
   */
  async registrar(authId: string, fila: FilaParte, certificado?: Certificado, fotos: Foto[] = []): Promise<Resultado> {
    const pendiente: Pendiente = {
      id: fila.id, authId, fila, certificado, fotos: fotos.length > 0 ? fotos : undefined, guardado: this.ahora().toISOString(),
    }
    let guardado = true
    try {
      await this.almacen.poner(pendiente)
    } catch {
      guardado = false
    }
    this.avisar()
    await this.enMarcha
    const resultado = await this.intentar(pendiente, guardado)
    if (resultado.tipo === 'sin-conexion' && !guardado) {
      // Sin red y sin poder guardarlo: la persona tiene que saberlo para no irse creyendo que está.
      return { tipo: 'rechazado', motivo: 'No hay conexión y este móvil no deja guardar el parte. Copia lo que has escrito y envíalo cuando haya cobertura.' }
    }
    this.avisar()
    return resultado
  }

  /**
   * Envía un pendiente y deja lo guardado como corresponde: lo quita si ha llegado entero,
   * le pone el motivo si se ha rechazado algo, y si se corta la red, deja solo lo que falta.
   */
  private async intentar(p: Pendiente, guardado = true): Promise<Resultado> {
    let actual = p
    const llega = async (l: Llegada) => {
      if (l.que === 'certificado') actual = { ...actual, certificado: undefined }
      else if (l.que === 'parte') actual = { ...actual, parteLlegado: true }
      else actual = { ...actual, fotos: actual.fotos?.filter(f => f.id !== l.id) }
      // Si no se puede apuntar, no pasa nada: en el siguiente intento se reenvía, y no se duplica.
      if (guardado) await this.almacen.poner(actual).catch(() => {})
    }
    const resultado = await this.enviar(p.fila, p.certificado, p.fotos, llega, p.parteLlegado)
    if (!guardado) return resultado
    if (resultado.tipo === 'enviado' && !resultado.aviso) await this.almacen.quitar(p.id)
    else if (resultado.tipo === 'enviado') await this.almacen.poner({ ...actual, rechazo: resultado.aviso })
    else if (resultado.tipo === 'rechazado') await this.almacen.poner({ ...actual, rechazo: resultado.motivo })
    return resultado
  }

  /** Envía los pendientes de esa persona, del más antiguo al más nuevo. Para al primer fallo de red. */
  reintentar(authId: string): Promise<void> {
    this.enMarcha ??= this.vaciar(authId).finally(() => { this.enMarcha = null; this.avisar() })
    return this.enMarcha
  }

  private async vaciar(authId: string) {
    const todos = await this.almacen.todos()
    const suyos = todos.filter(p => p.authId === authId && !p.rechazo).sort((a, b) => a.guardado.localeCompare(b.guardado))
    for (const p of suyos) {
      const resultado = await this.intentar(p)
      if (resultado.tipo === 'sin-conexion') return
      this.avisar()
    }
  }

  async recuento(authId: string): Promise<Recuento> {
    const suyos = (await this.almacen.todos()).filter(p => p.authId === authId)
    return { pendientes: suyos.filter(p => !p.rechazo).length, rechazados: suyos.filter(p => p.rechazo) }
  }

  /** Borra un parte rechazado, cuando la persona lo decide. */
  async descartar(id: string): Promise<void> {
    await this.almacen.quitar(id)
    this.avisar()
  }
}

/** Un almacén en memoria, para los tests. */
export function almacenEnMemoria(): Almacen & { datos: Map<string, Pendiente> } {
  const datos = new Map<string, Pendiente>()
  return {
    datos,
    todos: async () => [...datos.values()].map(p => structuredClone(p)),
    poner: async p => { datos.set(p.id, structuredClone(p)) },
    quitar: async id => { datos.delete(id) },
  }
}

/** El almacén del navegador: una base de datos IndexedDB con una sola tabla, `partes`. */
export function almacenIndexedDB(nombre = 'libro-edificio'): Almacen {
  let abierta: Promise<IDBDatabase> | null = null
  const abrir = () => abierta ??= new Promise<IDBDatabase>((resolver, fallar) => {
    const peticion = indexedDB.open(nombre, 1)
    peticion.onupgradeneeded = () => { peticion.result.createObjectStore('partes', { keyPath: 'id' }) }
    peticion.onsuccess = () => resolver(peticion.result)
    peticion.onerror = () => { abierta = null; fallar(peticion.error) }
  })

  async function operar<T>(modo: IDBTransactionMode, hacer: (tabla: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await abrir()
    return new Promise<T>((resolver, fallar) => {
      const transaccion = db.transaction('partes', modo)
      const peticion = hacer(transaccion.objectStore('partes'))
      // Se da por hecho al terminar la transacción, no la petición: así está escrito de verdad.
      transaccion.oncomplete = () => resolver(peticion.result)
      transaccion.onerror = () => fallar(transaccion.error)
      transaccion.onabort = () => fallar(transaccion.error)
    })
  }

  return {
    todos: () => operar('readonly', tabla => tabla.getAll() as IDBRequest<Pendiente[]>),
    poner: async p => { await operar('readwrite', tabla => tabla.put(p)) },
    quitar: async id => { await operar('readwrite', tabla => tabla.delete(id)) },
  }
}

/**
 * Pide al navegador que no borre lo guardado aunque falte espacio o la web no se use en días.
 * Importa sobre todo en iPhone. Si el navegador no lo concede, todo funciona igual, con menos garantía.
 */
export async function pedirAlmacenPersistente(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    return (await navigator.storage.persisted()) || (await navigator.storage.persist())
  } catch {
    return false
  }
}
