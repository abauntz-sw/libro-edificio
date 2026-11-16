// Unidades de red de Windows: una letra, como Z:, que apunta a una carpeta de un servidor.
//
// La letra la elige cada ordenador: la misma carpeta puede ser Z: en uno y Y: en otro.
// Como el listado guarda rutas completas, una ruta con letra de red puede no valer en otro equipo.
// La dirección \\servidor\carpeta, en cambio, es la misma en todos.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const ejecutar = promisify(execFile)

/**
 * Lee lo que escribe `net use`: una línea por unidad, con el estado, la letra, la dirección y la red.
 * Las cabeceras cambian con el idioma de Windows, así que solo se buscan una letra y la dirección que la sigue.
 * Las columnas van separadas por dos o más espacios; así un nombre con un espacio dentro sigue entero.
 * Con un estado largo, como «Desconectado», entre el estado y la letra queda un solo espacio.
 */
export function leerNetUse(texto: string): Map<string, string> {
  const unidades = new Map<string, string>()
  for (const linea of texto.split(/\r?\n/)) {
    const columnas = linea.trim().split(/\s{2,}/)
    const i = columnas.findIndex(c => /(?:^|\s)[A-Za-z]:$/.test(c))
    if (i >= 0 && columnas[i + 1]?.startsWith('\\\\')) unidades.set(columnas[i].at(-2)!.toUpperCase(), columnas[i + 1])
  }
  return unidades
}

/** Las unidades de red de este equipo. Fuera de Windows, o si `net use` falla, ninguna. */
export async function unidadesDeRed(): Promise<Map<string, string>> {
  if (process.platform !== 'win32') return new Map()
  try {
    const { stdout } = await ejecutar('net', ['use'], { windowsHide: true })
    return leerNetUse(stdout)
  } catch {
    return new Map()
  }
}

/** Si la ruta empieza por una letra de red, el aviso con la dirección que conviene usar. Si no, nada. */
export function avisoUnidadDeRed(ruta: string, unidades: Map<string, string>): string | undefined {
  const letra = /^([A-Za-z]):(?:[\\/]|$)/.exec(ruta)?.[1]?.toUpperCase()
  const direccion = letra ? unidades.get(letra) : undefined
  if (!direccion) return undefined
  const resto = ruta.slice(2).replace(/^[\\/]+/, '').replaceAll('/', '\\')
  const mejor = resto ? `${direccion}\\${resto}` : direccion
  return `${ruta} está en ${letra}:, una unidad de red. La letra puede cambiar de un ordenador a otro, ` +
    `y el listado guarda la ruta completa. Mejor escanea ${mejor}`
}
