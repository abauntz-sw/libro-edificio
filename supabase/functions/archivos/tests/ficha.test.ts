import { assertEquals, assertThrows } from '@std/assert'
import { ErrorHttp, esFecha, esPdf, esRutaDeDocumento, leerFicha, rutaDocumento, sha256 } from '../ficha.ts'

const ID = '99999999-9999-4999-8999-999999999991'
const INSTALACION = '11111111-2222-4333-8444-555555555555'

function formulario(campos: Record<string, string | string[]>): FormData {
  const datos = new FormData()
  for (const [campo, valor] of Object.entries(campos)) {
    for (const uno of [valor].flat()) datos.append(campo, uno)
  }
  return datos
}

const completa = { id: ID, tipo: 'certificado', titulo: 'Revisión de prueba', fecha: '2026-03-10' }

Deno.test('lee una ficha completa', () => {
  const ficha = leerFicha(
    formulario({ ...completa, emisor: ' Calor Ficticio SL ', caduca: '2027-03-10', instalaciones: [INSTALACION, INSTALACION] }),
    'C:\\carpeta\\revisión caldera.pdf',
  )
  assertEquals(ficha, {
    id: ID,
    tipo: 'certificado',
    titulo: 'Revisión de prueba',
    fecha: '2026-03-10',
    emisor: 'Calor Ficticio SL',
    caduca: '2027-03-10',
    instalaciones: [INSTALACION],
    nombreOriginal: 'revisión caldera.pdf',
  })
})

Deno.test('lo que no es obligatorio puede faltar', () => {
  const ficha = leerFicha(formulario(completa), 'a.pdf')
  assertEquals([ficha.emisor, ficha.caduca, ficha.instalaciones], ['', null, []])
})

Deno.test('dice todos los fallos juntos', () => {
  const error = assertThrows(
    () => leerFicha(formulario({ id: 'no-es-un-uuid', fecha: '2026-02-31', instalaciones: 'caldera' }), 'a.pdf'),
    ErrorHttp,
  )
  assertEquals(error.estado, 400)
  for (const fallo of ['identificador', 'falta el tipo', 'falta el título', '«2026-02-31» no vale', 'instalación']) {
    assertEquals(error.message.includes(fallo), true, `falta el aviso de: ${fallo}`)
  }
})

Deno.test('no deja que caduque antes de su fecha', () => {
  const error = assertThrows(() => leerFicha(formulario({ ...completa, caduca: '2026-03-09' }), 'a.pdf'), ErrorHttp)
  assertEquals(error.message.includes('caduca antes'), true)
})

Deno.test('esFecha solo acepta fechas que existen', () => {
  assertEquals(['2026-03-10', '2024-02-29'].map(esFecha), [true, true])
  assertEquals(['2026-02-29', '10/03/2026', '2026-3-10', ''].map(esFecha), [false, false, false, false])
})

Deno.test('la ruta es la misma que usa la herramienta de carga local', () => {
  assertEquals(rutaDocumento(ID, '2021-06-30'), `documentos/2021/${ID}.pdf`)
})

Deno.test('esRutaDeDocumento solo acepta la ruta de ese mismo documento', () => {
  assertEquals(esRutaDeDocumento(`documentos/2021/${ID}.pdf`, ID), true)
  // La herramienta de carga local también guarda otros formatos.
  assertEquals(esRutaDeDocumento(`documentos/2021/${ID}.docx`, ID), true)

  assertEquals(esRutaDeDocumento('indice/documentos.csv', ID), false)
  assertEquals(esRutaDeDocumento('README.md', ID), false)
  assertEquals(esRutaDeDocumento(`fotos/2026/${ID}.jpg`, ID), false)
  assertEquals(esRutaDeDocumento(`documentos/2021/${INSTALACION}.pdf`, ID), false, 'la de otro documento')
  assertEquals(esRutaDeDocumento(`documentos/2021/../../indice/${ID}.pdf`, ID), false)
  assertEquals(esRutaDeDocumento(`documentos/2021/${ID}.pdf/x`, ID), false)
  assertEquals(esRutaDeDocumento(`documentos/2021/${ID}`, ID), false, 'sin extensión')
})

Deno.test('esPdf mira cómo empieza el archivo, no su nombre', () => {
  const texto = (letras: string) => new TextEncoder().encode(letras)
  assertEquals(esPdf(texto('%PDF-1.7 ficticio')), true)
  assertEquals(esPdf(texto('<html>')), false)
  assertEquals(esPdf(texto('%PD')), false)
})

Deno.test('sha256 da el valor de referencia', async () => {
  assertEquals(await sha256(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})
