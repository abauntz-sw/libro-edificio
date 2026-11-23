// Los nombres de los archivos, con la tabla de casos común (la misma que pasa la función «archivos», en Deno).
import { describe, expect, test } from 'vitest'
import { cortar, limpiar, noDiceNada, quitarTipo, rutaDocumento, rutaFoto } from '../../supabase/functions/_compartido/nombres.ts'
import {
  CASOS_CORTAR, CASOS_DOCUMENTO, CASOS_FOTO, CASOS_LIMPIAR, CASOS_NO_DICE_NADA, CASOS_QUITAR_TIPO,
} from '../../supabase/functions/_compartido/casos-nombres.ts'

describe('nombres de los archivos, igual que en la función', () => {
  test.each(CASOS_LIMPIAR)('limpiar(%j) = %j', (texto, limpio) => expect(limpiar(texto)).toBe(limpio))
  test.each(CASOS_CORTAR)('cortar(%j) = %j', (texto, cortado) => expect(cortar(texto)).toBe(cortado))
  test.each(CASOS_NO_DICE_NADA)('noDiceNada(%j) = %j', (texto, nada) => expect(noDiceNada(texto)).toBe(nada))
  test.each(CASOS_QUITAR_TIPO)('quitarTipo(%j, %j) = %j', (titulo, tipo, queda) => expect(quitarTipo(titulo, tipo)).toBe(queda))
  test.each(CASOS_DOCUMENTO)('documento: %s', (_caso, datos, ruta) => expect(rutaDocumento(datos)).toBe(ruta))
  test.each(CASOS_FOTO)('foto: %s', (_caso, datos, ruta) => expect(rutaFoto(datos)).toBe(ruta))
})
