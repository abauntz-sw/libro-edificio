import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { buscarInstalaciones, comprobarListado, leerFecha, type Catalogo } from '../src/comprobar.ts'
import { leerCsv, type Fila } from '../src/csv.ts'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// El edificio ficticio de seed.sql.
const catalogo = (huellas: string[] = []): Catalogo => ({
  edificioId: 'bf8db03c-259a-54f2-8933-e6850777d963',
  tipos: ['proyecto', 'certificado-final-obra', 'licencia', 'boletin', 'certificado', 'acta-inspeccion',
    'contrato-mantenimiento', 'poliza-seguro', 'informe', 'manual', 'plano', 'factura', 'otro'],
  instalaciones: [
    { id: '38654cb2-7c0f-5844-8381-de200c6b36dc', nombre: 'Agua de consumo', tipo_id: 'agua-consumo' },
    { id: '17b0d1ce-27f1-5213-a55e-2c4f054f1276', nombre: 'Calefacción y agua caliente', tipo_id: 'calefaccion-acs' },
    { id: '6b41b002-871c-5df7-b85d-ace98b9d56af', nombre: 'Protección contra incendios', tipo_id: 'contraincendios' },
    { id: '01183e11-c189-5d34-8467-ed7316f3b9fb', nombre: 'Instalación eléctrica', tipo_id: 'electricidad' },
  ],
  huellas: new Set(huellas),
})

const fila = (cambios: Fila = {}): Fila => ({
  ruta_original: 'a/uno.pdf', nombre: 'uno.pdf', extension: 'pdf', tamano_mb: '0.001', fecha_modificacion: '2026-10-01',
  sha256: 'a'.repeat(64), duplicado_de: '', aviso: '',
  incluir: 'si', tipo: 'certificado', titulo: 'Un certificado', fecha: '2026-03-10', emisor: 'Empresa Ficticia',
  instalaciones: 'contraincendios', caduca: '2027-03-10',
  ...cambios,
})

const mensajes = (filas: Fila[], cat = catalogo()) => comprobarListado(filas, cat).errores.map(e => `${e.fila}: ${e.mensaje}`)

test('el listado de ejemplo da 12 documentos con las huellas de seed.sql y deja 3 filas fuera', async () => {
  const { filas } = leerCsv(await readFile(join(raiz, 'edificio-ejemplo-entrada', 'listado.csv'), 'utf8'))
  const { documentos, noIncluidas, yaCargadas, errores } = comprobarListado(filas, catalogo())

  expect(errores).toEqual([])
  expect(documentos).toHaveLength(12)
  expect(noIncluidas).toBe(3)
  expect(yaCargadas).toEqual([])

  const seed = await readFile(join(raiz, 'supabase', 'seed.sql'), 'utf8')
  const documentosDelSeed = seed.slice(seed.indexOf('insert into public.documentos'), seed.indexOf('insert into public.documento_instalaciones'))
  const huellasDelSeed = [...documentosDelSeed.matchAll(/'([a-f0-9]{64})'/g)].map(m => m[1])
  expect(huellasDelSeed).toHaveLength(12)
  expect(documentos.map(d => d.sha256).sort()).toEqual(huellasDelSeed.sort())
})

test('una fila correcta sale con su identificador, su ruta y sus instalaciones', () => {
  const { documentos } = comprobarListado([fila()], catalogo())
  expect(documentos).toHaveLength(1)
  const doc = documentos[0]
  expect(doc.fila).toBe(2)
  expect(doc.ruta).toBe(`documentos/2026/${doc.id}.pdf`)
  expect(doc.instalaciones).toEqual(['6b41b002-871c-5df7-b85d-ace98b9d56af'])
  expect(doc.caduca).toBe('2027-03-10')
})

test('solo se procesan las filas con «si»', () => {
  const filas = [fila({ incluir: 'no', tipo: 'inventado' }), fila({ incluir: '', sha256: 'b'.repeat(64) }), fila({ incluir: ' Sí ', sha256: 'c'.repeat(64) })]
  const { documentos, noIncluidas, errores } = comprobarListado(filas, catalogo())
  expect(errores).toEqual([])
  expect(noIncluidas).toBe(2)
  expect(documentos.map(d => d.fila)).toEqual([4])
})

test('muestra todos los errores juntos, con su número de fila', () => {
  const errores = mensajes([
    fila({ tipo: 'contrato' }),
    fila({ sha256: 'b'.repeat(64), fecha: '31/02/2026', titulo: '' }),
    fila({ sha256: 'c'.repeat(64), instalaciones: 'ascensor' }),
    fila({ sha256: 'd'.repeat(64), caduca: '2026-01-01' }),
    fila({ sha256: 'e'.repeat(64), incluir: 'x' }),
  ])
  expect(errores).toHaveLength(6)
  expect(errores[0]).toMatch(/^2: el tipo «contrato» no existe\. Valen: acta-inspeccion, /)
  expect(errores).toContain('3: falta el título')
  expect(errores).toContain('3: la fecha «31/02/2026» no vale. Escríbela como 2026-03-10')
  expect(errores[3]).toMatch(/^4: la instalación «ascensor» no existe en el edificio/)
  expect(errores).toContain('5: caduca antes de su propia fecha')
  expect(errores).toContain('6: incluir debe ser «si» o «no», y pone «x»')
})

test('con una fila errónea no sale ningún documento de esa fila', () => {
  const { documentos, errores } = comprobarListado([fila({ tipo: '' }), fila({ sha256: 'b'.repeat(64) })], catalogo())
  expect(errores).toEqual([{ fila: 2, mensaje: 'falta el tipo' }])
  expect(documentos.map(d => d.fila)).toEqual([3])
})

test('dos filas con «si» y el mismo archivo son un error', () => {
  expect(mensajes([fila(), fila({ ruta_original: 'b/copia.pdf' })]))
    .toEqual(['3: es el mismo archivo que el de la fila 2: deja solo uno con «si»'])
})

test('una huella ya registrada se salta y no es un error', () => {
  const { documentos, yaCargadas, errores } = comprobarListado([fila()], catalogo(['a'.repeat(64)]))
  expect(errores).toEqual([])
  expect(documentos).toEqual([])
  expect(yaCargadas).toEqual([{ fila: 2, titulo: 'Un certificado' }])
})

test('leerFecha admite año-mes-día y día/mes/año, y rechaza fechas que no existen', () => {
  expect(leerFecha('2026-03-10')).toBe('2026-03-10')
  expect(leerFecha('10/03/2026')).toBe('2026-03-10')
  expect(leerFecha('1/3/2026')).toBe('2026-03-01')
  expect(leerFecha('2026-02-30')).toBeNull()
  expect(leerFecha('marzo de 2026')).toBeNull()
})

test('las instalaciones se buscan por tipo o por nombre, y varias van separadas por comas', () => {
  const { instalaciones } = catalogo()
  expect(buscarInstalaciones('electricidad, Agua de consumo', instalaciones).ids)
    .toEqual(['01183e11-c189-5d34-8467-ed7316f3b9fb', '38654cb2-7c0f-5844-8381-de200c6b36dc'])
  expect(buscarInstalaciones('', instalaciones)).toEqual({ ids: [], errores: [] })

  const dos = [...instalaciones, { id: 'x', nombre: 'Cuadro del anexo', tipo_id: 'electricidad' }]
  expect(buscarInstalaciones('electricidad', dos).errores[0]).toMatch(/hay varias instalaciones de tipo «electricidad»/)
  expect(buscarInstalaciones('cuadro del anexo', dos).ids).toEqual(['x'])
})

test('no carga un original que ya pasó por preparar: hay que cargar los PDF que salieron', () => {
  const aviso = 'no es PDF; ya preparado: usa los PDF de «Escaneos 2026-11» (C:\Papel\Escaneos 2026-11)'
  expect(mensajes([fila({ aviso, extension: 'docx' })])).toEqual([
    '2: este archivo ya pasó por preparar: carga los PDF que salieron de él (lo dice la columna aviso), no este',
  ])
  // Sin «si» no estorba.
  expect(mensajes([fila({ aviso, incluir: '' })])).toEqual([])
})
