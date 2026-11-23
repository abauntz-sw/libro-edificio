// Una sola tabla de casos para nombres.ts.
// La pasan los tests de la función «archivos» (Deno) y los de las herramientas (Node).
// Si un caso sale distinto en uno de los dos, los nombres ya no coincidirían.

import type { DatosDocumento, DatosFoto } from './nombres.ts'

export const ID = '40d3432b-2292-42bd-8ed1-1299beb8df2a'

/** limpiar: texto de entrada → texto limpio. */
export const CASOS_LIMPIAR: [string, string][] = [
  ['Calefacción y agua caliente', 'calefaccion-y-agua-caliente'],
  ['Revisión nº 3 (caldera)', 'revision-no-3-caldera'],
  ['1ª planta', '1a-planta'],
  ['Año 2026: señalización', 'ano-2026-senalizacion'],
  ['ÁÉÍÓÚ Üü Çç', 'aeiou-uu-cc'],
  ['  --Hola__mundo--  ', 'hola-mundo'],
  ['contrato_calefaccion.pdf', 'contrato-calefaccion-pdf'],
  ['C:\\Docs\\a/b', 'c-docs-a-b'],
  ['50% «oferta» €', '50-oferta'],
  ['', ''],
  ['¿?¡!', ''],
]

/** cortar: texto limpio → como mucho 40 caracteres, en un guion si se puede. */
export const CASOS_CORTAR: [string, string][] = [
  ['corto', 'corto'],
  // 40 justos: no se corta.
  ['aaaaaaaaaa-bbbbbbbbbb-cccccccccc-ddddddd', 'aaaaaaaaaa-bbbbbbbbbb-cccccccccc-ddddddd'],
  // 41: se corta en el último guion.
  ['aaaaaaaaaa-bbbbbbbbbb-cccccccccc-dddddddd', 'aaaaaaaaaa-bbbbbbbbbb-cccccccccc'],
  // El guion justo en la posición 40 vale.
  ['aaaaaaaaaa-bbbbbbbbbb-cccccccccc-ddddddd-e', 'aaaaaaaaaa-bbbbbbbbbb-cccccccccc-ddddddd'],
  // Una sola palabra larga: se corta a 40.
  ['a'.repeat(50), 'a'.repeat(40)],
]

/** noDiceNada: título limpio → si no dice nada. */
export const CASOS_NO_DICE_NADA: [string, boolean][] = [
  ['', true],
  ['001', true],
  ['2026-03-10', true],
  ['escaneo001', true],
  ['scan', true],
  ['img-20260310-wa0003', true],
  ['documento-3', true],
  ['sin-titulo', true],
  ['copia-de-documento', false],
  ['whatsapp-image-2026-03-10-at-10-00-00', true],
  ['dsc-0042', true],
  ['revision-de-la-caldera', false],
  ['copia-del-contrato-de-gas', false],
  ['bt', false],
]

/** quitarTipo: [título limpio, tipo] → título sin el tipo del principio. */
export const CASOS_QUITAR_TIPO: [string, string, string][] = [
  ['certificado-de-revision-de-la-caldera', 'certificado', 'revision-de-la-caldera'],
  ['el-certificado-del-gas', 'certificado', 'gas'],
  ['acta-de-inspeccion-bt', 'acta-inspeccion', 'bt'],
  ['contrato-de-mantenimiento-de-ascensores', 'contrato-mantenimiento', 'ascensores'],
  ['certificado', 'certificado', ''],
  // No empieza por el tipo entero: no cambia.
  ['contrato-de-calefaccion', 'contrato-mantenimiento', 'contrato-de-calefaccion'],
  ['revision-de-la-caldera', 'certificado', 'revision-de-la-caldera'],
  ['certificados-de-extintores', 'certificado', 'certificados-de-extintores'],
  ['final-de-obra-de-la-reforma', 'certificado-final-obra', 'final-de-obra-de-la-reforma'],
]

const doc = (titulo: string, cambios: Partial<DatosDocumento> = {}): DatosDocumento =>
  ({ id: ID, fecha: '2026-11-21', tipo: 'certificado', titulo, instalaciones: [], extension: 'pdf', ...cambios })

/** rutaDocumento: datos → ruta completa. */
export const CASOS_DOCUMENTO: [string, DatosDocumento, string][] = [
  ['el título, sin el tipo',
    doc('Certificado de revisión de la caldera', { instalaciones: ['Caldera'] }),
    `documentos/2026/2026-11-21_certificado_revision-de-la-caldera_${ID}.pdf`],
  ['un título que no dice nada usa la instalación',
    doc('escaneo001', { instalaciones: ['Calefacción y agua caliente'] }),
    `documentos/2026/2026-11-21_certificado_calefaccion-y-agua-caliente_${ID}.pdf`],
  ['con varias instalaciones, la primera por nombre',
    doc('Scan', { instalaciones: ['Extintores', 'Caldera de gasóleo', 'Alumbrado de emergencia'] }),
    `documentos/2026/2026-11-21_certificado_alumbrado-de-emergencia_${ID}.pdf`],
  ['las instalaciones se ordenan ya limpias: la Á va con la a',
    doc('Documento 3', { instalaciones: ['Bomba', 'Ático'] }),
    `documentos/2026/2026-11-21_certificado_atico_${ID}.pdf`],
  ['solo el tipo, con instalación',
    doc('Certificado', { instalaciones: ['Extintores'] }),
    `documentos/2026/2026-11-21_certificado_extintores_${ID}.pdf`],
  ['sin título que valga ni instalación, sin descripción',
    doc('Sin título', { tipo: 'licencia' }),
    `documentos/2026/2026-11-21_licencia_${ID}.pdf`],
  ['el año de la carpeta es el de la fecha',
    doc('Licencia de actividad', { tipo: 'licencia', fecha: '2021-06-02' }),
    `documentos/2021/2021-06-02_licencia_actividad_${ID}.pdf`],
  ['otra extensión',
    doc('Contrato de calefacción', { tipo: 'contrato-mantenimiento', extension: 'docx' }),
    `documentos/2026/2026-11-21_contrato-mantenimiento_contrato-de-calefaccion_${ID}.docx`],
  ['un título largo se corta a 40 en un guion',
    doc('Informe de la inspección periódica de la instalación eléctrica de baja tensión', { tipo: 'informe' }),
    `documentos/2026/2026-11-21_informe_inspeccion-periodica-de-la-instalacion_${ID}.pdf`],
  ['acentos, eñes y símbolos',
    doc('Señalización nº 2 — «planta 1ª»', { tipo: 'plano' }),
    `documentos/2026/2026-11-21_plano_senalizacion-no-2-planta-1a_${ID}.pdf`],
]

/** rutaFoto: datos → ruta completa. */
export const CASOS_FOTO: [string, DatosFoto, string][] = [
  ['con la instalación del parte',
    { id: ID, fecha: '2025-12-30', instalacion: 'Extintores' },
    `fotos/2025/2025-12-30_extintores_${ID}.jpg`],
  ['la instalación también se limpia y se corta',
    { id: ID, fecha: '2026-01-02', instalacion: 'Calefacción, agua caliente sanitaria y depósito de gasóleo' },
    `fotos/2026/2026-01-02_calefaccion-agua-caliente-sanitaria-y_${ID}.jpg`],
  ['sin parte, sin instalación (#82)',
    { id: ID, fecha: '2026-03-10', instalacion: null },
    `fotos/2026/2026-03-10_${ID}.jpg`],
]
