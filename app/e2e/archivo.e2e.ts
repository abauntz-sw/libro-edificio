// Tarea 1.9 (issue #78): el Archivo y la Papelera.
import { readFile } from 'node:fs/promises'
import { expect, type Page, test } from '@playwright/test'
import { abrir, SupabaseFalso } from './supabase-falso.ts'

let supabase: SupabaseFalso

test.afterEach(() => {
  expect(supabase.desconocidas, 'peticiones que el Supabase de mentira no sabe contestar').toEqual([])
})

const lista = (page: Page) => page.getByRole('list', { name: 'Documentos' })
const titulos = (page: Page) => lista(page).locator('b').allInnerTexts()
const cuenta = (page: Page) => page.getByRole('status').filter({ hasText: /documentos?$/ })

test('la administración busca, organiza, descarga y manda a la papelera, y lo recupera', async ({ page, context }) => {
  supabase = new SupabaseFalso('admin')
  await supabase.instalar(context)
  await abrir(page)
  await page.getByRole('button', { name: 'Archivo' }).click()
  await page.getByRole('heading', { name: 'Archivo' }).waitFor()
  await expect(cuenta(page)).toHaveText('4 documentos')
  // Del más nuevo al más antiguo.
  expect(await titulos(page)).toEqual(['Revisión de la caldera', 'Revisión anual de extintores', 'Contrato de calefacción', 'Licencia de actividad'])

  // Sin acentos ni mayúsculas, y también por la instalación: la caldera es de «Calefacción y agua caliente».
  await page.getByLabel('Buscar documentos').fill('CALEFACCION')
  await expect(cuenta(page)).toHaveText('2 documentos')
  expect(await titulos(page)).toEqual(['Revisión de la caldera', 'Contrato de calefacción'])
  await page.getByLabel('Buscar documentos').fill('')

  // Por instalación, con «Edificio en general» para la licencia; por tipo; por año.
  const grupos = page.getByRole('group', { name: 'Grupos' })
  await expect(grupos.getByRole('button')).toHaveText([/^Todos\s*4$/, /^Calefacción y agua caliente\s*2$/, /^Protección contra incendios\s*1$/, /^Edificio en general\s*1$/])
  await grupos.getByRole('button', { name: /Edificio en general/ }).click()
  expect(await titulos(page)).toEqual(['Licencia de actividad'])
  await page.getByRole('group', { name: 'Organizar por' }).getByRole('button', { name: 'Tipo' }).click()
  await expect(grupos.getByRole('button')).toHaveText([/^Todos/, /^Certificado\s*2$/, /^Contrato de mantenimiento\s*1$/, /^Licencia\s*1$/])
  await page.getByRole('group', { name: 'Organizar por' }).getByRole('button', { name: 'Año' }).click()
  await expect(grupos.getByRole('button').last()).toHaveText(/^2021\s*1$/)
  await page.getByRole('group', { name: 'Organizar por' }).getByRole('button', { name: 'Instalación' }).click()

  // Los caducados y los que caducan en 90 días o menos, señalados.
  await page.getByRole('button', { name: 'Caducados o por caducar' }).click()
  expect(await titulos(page)).toEqual(['Revisión anual de extintores', 'Contrato de calefacción'])
  await expect(lista(page).getByText('Caduca en 40 días')).toBeVisible()
  await expect(lista(page).getByText('Caducado')).toBeVisible()
  await page.getByRole('button', { name: 'Todos', exact: true }).last().click()

  // La ficha y la descarga, con el nombre con el que se recibió.
  await lista(page).getByRole('button', { name: /Revisión de la caldera/ }).click()
  const ficha = page.getByRole('article', { name: 'Ficha de Revisión de la caldera' })
  await expect(ficha).toContainText('Calefacción y agua caliente')
  await expect(ficha).toContainText('Vigente')
  const [descarga] = await Promise.all([page.waitForEvent('download'), ficha.getByRole('button', { name: 'Descargar' }).click()])
  expect(descarga.suggestedFilename()).toBe('scan0015.pdf')
  expect((await readFile(await descarga.path())).toString()).toBe('%PDF-1.7 Revisión de la caldera')

  // A la papelera, con confirmación. Primero se arrepiente.
  await ficha.getByRole('button', { name: 'Eliminar' }).click()
  await ficha.getByRole('button', { name: 'No' }).click()
  expect(supabase.documentos.find(d => d.id === 'd-caldera')?.eliminado_en).toBeNull()
  await ficha.getByRole('button', { name: 'Eliminar' }).click()
  await ficha.getByRole('button', { name: 'Sí, a la papelera' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'está en la papelera' })).toBeVisible()
  await expect(cuenta(page)).toHaveText('3 documentos')
  await expect(ficha).toBeHidden()
  const borrado = supabase.documentos.find(d => d.id === 'd-caldera')!
  expect(borrado.eliminado_por).toBe('u-admin')
  expect(Date.parse(borrado.eliminado_en ?? '')).not.toBeNaN()

  // En la papelera, y se recupera.
  await page.getByRole('button', { name: '← Inicio' }).click()
  await page.getByRole('button', { name: 'Papelera' }).click()
  await page.getByRole('heading', { name: 'Papelera' }).waitFor()
  await expect(page.getByRole('list', { name: 'Documentos en la papelera' })).toContainText(/En la papelera desde el/)
  await page.getByRole('button', { name: 'Recuperar «Revisión de la caldera»' }).click()
  await expect(page.getByRole('status')).toHaveText('«Revisión de la caldera» vuelve a estar en el Archivo.')
  expect(borrado).toMatchObject({ eliminado_en: null, eliminado_por: null })

  await page.getByRole('button', { name: '← Inicio' }).click()
  await page.getByRole('button', { name: 'Papelera' }).click()
  await expect(page.getByText('La papelera está vacía.')).toBeVisible()
  await page.getByRole('button', { name: '← Inicio' }).click()
  await page.getByRole('button', { name: 'Archivo' }).click()
  await expect(cuenta(page)).toHaveText('4 documentos')
})

test('la guarda ve el Archivo y descarga, pero no manda nada a la papelera ni la ve', async ({ page, context }) => {
  supabase = new SupabaseFalso('guarda')
  await supabase.instalar(context)
  await abrir(page)
  await expect(page.getByRole('button', { name: 'Papelera' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Archivo' }).click()
  await lista(page).getByRole('button', { name: /Licencia de actividad/ }).click()
  const ficha = page.getByRole('article', { name: 'Ficha de Licencia de actividad' })
  await expect(ficha).toContainText('Todo el edificio')
  await expect(ficha).toContainText('No caduca')
  await expect(ficha.getByRole('button', { name: 'Descargar' })).toBeVisible()
  await expect(ficha.getByRole('button', { name: 'Eliminar' })).toHaveCount(0)
})

test('si el documento ya no se puede bajar, lo dice y no descarga nada', async ({ page, context }) => {
  supabase = new SupabaseFalso('admin')
  await supabase.instalar(context)
  await abrir(page)
  await page.getByRole('button', { name: 'Archivo' }).click()
  await lista(page).getByRole('button', { name: /Licencia de actividad/ }).click()
  // Mientras tanto, alguien lo ha mandado a la papelera: la función responde 404.
  supabase.documentos.find(d => d.id === 'd-licencia')!.eliminado_en = new Date().toISOString()
  await page.getByRole('article').getByRole('button', { name: 'Descargar' }).click()
  await expect(page.getByRole('alert')).toHaveText('No se encuentra ese documento.')
  expect(supabase.bajados).toEqual(['d-licencia'])
})
