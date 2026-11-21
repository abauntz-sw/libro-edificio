// Tarea 1.7: ningún parte se pierde por falta de cobertura, y ninguno llega dos veces.
import { expect, test } from '@playwright/test'
import { abrir, rellenarParte, SupabaseFalso } from './supabase-falso.ts'

let supabase: SupabaseFalso

test.beforeEach(async ({ context }) => {
  supabase = new SupabaseFalso()
  await supabase.instalar(context)
})

test.afterEach(() => {
  expect(supabase.desconocidas, 'peticiones que el Supabase de mentira no sabe contestar').toEqual([])
})

test('sin cobertura, el parte se guarda en el móvil y llega al reconectar, una sola vez', async ({ page }) => {
  await abrir(page)
  await page.getByRole('button', { name: 'Registrar parte' }).click()
  await page.getByRole('heading', { name: '¿Dónde?' }).waitFor()

  await supabase.red(false)
  await rellenarParte(page, 'Extintores en su sitio y con presión.')
  await page.getByRole('button', { name: 'Enviar parte' }).click()
  await expect(page.getByText(/Sin cobertura\. El parte queda guardado en este móvil/)).toBeVisible()
  expect(supabase.envios).toEqual([])

  await page.getByRole('button', { name: '← Inicio' }).click()
  await expect(page.getByText('1 parte sin enviar.')).toBeVisible()

  // Vuelve la cobertura: se envía solo, sin pulsar nada.
  await supabase.red(true)
  await expect(page.getByText('1 parte sin enviar.')).toBeHidden()
  expect(supabase.partes.size).toBe(1)
  const [parte] = supabase.partes.values()
  expect(parte).toMatchObject({ tipo: 'comprobacion', revision_id: 'r-extintores', descripcion: 'Extintores en su sitio y con presión.' })

  // Al volver a abrir la aplicación no se envía otra vez.
  await page.reload()
  await page.getByRole('heading', { name: 'Inicio' }).waitFor()
  await page.waitForTimeout(500)
  expect(supabase.envios).toHaveLength(1)
})

test('si se pierde la respuesta, reenviarlo no duplica el parte', async ({ page }) => {
  await abrir(page)
  await page.getByRole('button', { name: 'Registrar parte' }).click()
  await page.getByRole('heading', { name: '¿Dónde?' }).waitFor()

  // El parte llega al servidor, pero la respuesta se corta por el camino.
  supabase.modo = 'perder-respuesta'
  await rellenarParte(page, 'Revisados los extintores de la planta baja.')
  await page.getByRole('button', { name: 'Enviar parte' }).click()
  await expect(page.getByText(/Sin cobertura\. El parte queda guardado/)).toBeVisible()

  supabase.modo = 'aceptar'
  await page.getByRole('button', { name: '← Inicio' }).click()
  await page.getByRole('button', { name: 'Enviar ahora' }).click()
  await expect(page.getByText('1 parte sin enviar.')).toBeHidden()

  // Llegó dos veces, con el mismo identificador, y solo hay un parte.
  expect(supabase.envios).toHaveLength(2)
  expect(new Set(supabase.envios).size).toBe(1)
  expect(supabase.partes.size).toBe(1)
})

test('un parte rechazado se conserva con su motivo, también al volver a abrir', async ({ page }) => {
  await abrir(page)
  await page.getByRole('button', { name: 'Registrar parte' }).click()
  await page.getByRole('heading', { name: '¿Dónde?' }).waitFor()

  supabase.modo = 'rechazar'
  await rellenarParte(page, 'Parte que la base de datos no acepta.')
  await page.getByRole('button', { name: 'Enviar parte' }).click()
  await expect(page.getByRole('alert')).toContainText('No tienes permiso')

  await page.getByRole('button', { name: '← Inicio' }).click()
  await expect(page.getByText(/no aceptado/)).toBeVisible()
  await page.reload()
  await expect(page.getByText(/no aceptado/)).toBeVisible()
  await expect(page.getByText('«Parte que la base de datos no acepta.»')).toBeVisible()
  // No se reintenta solo: un rechazo no se arregla insistiendo.
  expect(supabase.envios).toHaveLength(1)

  page.once('dialog', dialogo => dialogo.accept())
  await page.getByRole('button', { name: 'Descartar' }).click()
  await expect(page.getByText(/no aceptado/)).toBeHidden()
})

test('sin cobertura, el certificado se guarda con el parte y llega antes que él, una sola vez', async ({ page, context }) => {
  // Este test entra como Administración: la guarda no adjunta certificados.
  supabase = new SupabaseFalso('admin')
  await context.unrouteAll()
  await supabase.instalar(context)
  await abrir(page)
  await page.getByRole('button', { name: 'Registrar parte' }).click()
  await page.getByRole('heading', { name: '¿Dónde?' }).waitFor()

  await supabase.red(false)
  await rellenarParte(page, 'Revisión con su certificado.')
  await page.locator('input[type=file]').setInputFiles({
    name: 'certificado extintores.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 certificado ficticio'),
  })
  await expect(page.getByText('Certificado: certificado extintores.pdf')).toBeVisible()
  await page.getByRole('button', { name: 'Enviar parte' }).click()
  await expect(page.getByText(/Sin cobertura\. El parte queda guardado en este móvil, con su certificado,/)).toBeVisible()
  expect(supabase.llegadas).toEqual([])

  // El certificado está guardado en el móvil, en IndexedDB, no solo en la memoria de la página.
  const guardado = await page.evaluate(() => new Promise<string>((resolver, fallar) => {
    const abierta = indexedDB.open('libro-edificio')
    abierta.onerror = () => fallar(abierta.error)
    abierta.onsuccess = () => {
      const lectura = abierta.result.transaction('partes').objectStore('partes').getAll()
      lectura.onsuccess = async () => resolver(await lectura.result[0].certificado.archivo.text())
    }
  }))
  expect(guardado).toBe('%PDF-1.7 certificado ficticio')

  await page.getByRole('button', { name: '← Inicio' }).click()
  await expect(page.getByText('1 parte sin enviar.')).toBeVisible()
  await supabase.red(true)
  await expect(page.getByText('1 parte sin enviar.')).toBeHidden()

  const [parte] = supabase.partes.values()
  const [[idCertificado, ficha]] = supabase.certificados.entries()
  expect(supabase.llegadas).toEqual([`certificado ${idCertificado}`, `parte ${parte.id}`])
  expect(parte.certificado_id).toBe(idCertificado)
  expect(ficha).toMatchObject({
    tipo: 'certificado', titulo: 'Certificado: comprobación en Protección contra incendios', instalaciones: 'i-incendios',
    nombre_archivo: 'certificado extintores.pdf', contenido: '%PDF-1.7 certificado ficticio',
  })
})

test('la guarda no ve el botón del certificado', async ({ page }) => {
  await abrir(page)
  await page.getByRole('button', { name: 'Registrar parte' }).click()
  await page.getByRole('heading', { name: '¿Dónde?' }).waitFor()
  await expect(page.getByText('Añadir certificado')).toHaveCount(0)
})

test('sin cobertura, el formulario se abre con lo de la última vez', async ({ page }) => {
  await abrir(page)
  await page.getByRole('button', { name: 'Registrar parte' }).click()
  await page.getByRole('heading', { name: '¿Dónde?' }).waitFor()
  await page.getByRole('button', { name: '← Inicio' }).click()

  await supabase.red(false)
  await page.getByRole('button', { name: 'Registrar parte' }).click()
  await expect(page.getByText(/Sin conexión\. Las instalaciones y revisiones son las de la última vez/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Protección contra incendios' })).toBeVisible()
})
