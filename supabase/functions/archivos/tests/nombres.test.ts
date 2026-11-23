// Los nombres de los archivos, con la tabla de casos común (la misma que pasan las herramientas, en Node).
import { assertEquals } from '@std/assert'
import { cortar, limpiar, noDiceNada, quitarTipo, rutaDocumento, rutaFoto } from '../../_compartido/nombres.ts'
import {
  CASOS_CORTAR, CASOS_DOCUMENTO, CASOS_FOTO, CASOS_LIMPIAR, CASOS_NO_DICE_NADA, CASOS_QUITAR_TIPO,
} from '../../_compartido/casos-nombres.ts'

Deno.test('limpiar deja solo a-z, 0-9 y guiones', () => {
  for (const [texto, limpio] of CASOS_LIMPIAR) assertEquals(limpiar(texto), limpio, texto)
})

Deno.test('cortar deja como mucho 40 caracteres, en un guion', () => {
  for (const [texto, cortado] of CASOS_CORTAR) assertEquals(cortar(texto), cortado, texto)
})

Deno.test('noDiceNada reconoce los nombres de escáner y de móvil', () => {
  for (const [texto, nada] of CASOS_NO_DICE_NADA) assertEquals(noDiceNada(texto), nada, texto)
})

Deno.test('quitarTipo quita el tipo del principio del título', () => {
  for (const [titulo, tipo, queda] of CASOS_QUITAR_TIPO) assertEquals(quitarTipo(titulo, tipo), queda, titulo)
})

Deno.test('rutaDocumento: <fecha>_<tipo>_<descripción>_<id>.<extensión>', () => {
  for (const [caso, datos, ruta] of CASOS_DOCUMENTO) assertEquals(rutaDocumento(datos), ruta, caso)
})

Deno.test('rutaFoto: <fecha>_<instalación>_<id>.jpg', () => {
  for (const [caso, datos, ruta] of CASOS_FOTO) assertEquals(rutaFoto(datos), ruta, caso)
})
