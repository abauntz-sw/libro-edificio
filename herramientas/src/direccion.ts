// Comprueba que la carga va al repositorio del edificio y no a otro.

/** Quita los «/» y el «.git» del final, que no cambian de qué repositorio se trata. */
const normalizar = (texto: string) => texto.trim().replace(/\/+$/, '').replace(/\.git$/i, '').replace(/\/+$/, '')

// https://github.com/org/repo, también con usuario delante de github.com, o git@github.com:org/repo.
const GITHUB = /^(?:https:\/\/(?:[^@/]+@)?github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/i

/** Saca «organización/repositorio» de la dirección de un repositorio de GitHub, o null si no es de GitHub. */
export function repositorioDeGitHub(direccion: string): string | null {
  return GITHUB.exec(normalizar(direccion))?.[1] ?? null
}

/**
 * Para la carga, sin escribir nada, si la dirección no es la del repositorio apuntado en el Libro para el edificio.
 * Compara la dirección entera: «otra-org/edificio» no vale aunque acabe igual que «org/edificio».
 */
export function comprobarRepositorio(direccion: string, delEdificio: string): void {
  const apuntado = normalizar(delEdificio)
  if (apuntado === '') {
    throw new Error('El edificio no tiene apuntado su repositorio en el Libro. Hay que apuntarlo antes de cargar. No se ha escrito nada.')
  }
  const destino = repositorioDeGitHub(direccion)
  if (destino === null) {
    throw new Error(`${direccion} no es la dirección de un repositorio de GitHub. La del edificio es https://github.com/${apuntado}. No se ha escrito nada.`)
  }
  // GitHub no distingue mayúsculas en los nombres.
  if (destino.toLowerCase() !== apuntado.toLowerCase()) {
    throw new Error(`Vas a subir a ${destino}, pero el repositorio del edificio es ${apuntado}. No se ha escrito nada.`)
  }
}
