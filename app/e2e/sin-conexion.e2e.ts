// Tarea 1.7: ningún parte se pierde por falta de cobertura, y ninguno llega dos veces.
import { expect, type Page, test } from '@playwright/test'
import { abrir, medidasJpeg, rellenarParte, SupabaseFalso } from './supabase-falso.ts'

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
  await page.locator('input[accept*=pdf]').setInputFiles({
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

/**
 * Una foto grande, de 3000 × 2000 píxeles, en JPEG de alta calidad, como la de la cámara de un móvil.
 * La dibuja el propio navegador y la devuelve en base64: como lista de números tardaría mucho en llegar al test.
 */
async function fotoGrande(pagina: Page): Promise<Buffer> {
  const base64 = await pagina.evaluate(async () => {
    const lienzo = document.createElement('canvas')
    lienzo.width = 3000
    lienzo.height = 2000
    const contexto = lienzo.getContext('2d')!
    const degradado = contexto.createLinearGradient(0, 0, 3000, 2000)
    degradado.addColorStop(0, '#1d5c4d')
    degradado.addColorStop(1, '#eef1f2')
    contexto.fillStyle = degradado
    contexto.fillRect(0, 0, 3000, 2000)
    return lienzo.toDataURL('image/jpeg', 0.95).split(',')[1]
  })
  return Buffer.from(base64, 'base64')
}

test('la guarda añade fotos sin cobertura: se comprimen, se guardan y llegan después del parte, una vez cada una', async ({ page }) => {
  await abrir(page)
  await page.getByRole('button', { name: 'Registrar parte' }).click()
  await page.getByRole('heading', { name: '¿Dónde?' }).waitFor()
  const grande = await fotoGrande(page)
  const fotos = page.getByRole('list', { name: 'Fotos del parte' }).getByRole('listitem')

  await supabase.red(false)
  await rellenarParte(page, 'Extintor del pasillo con el precinto roto.')
  // Una foto buena y un archivo que no es una foto: la segunda no entra, y se dice por qué.
  await page.locator('input[accept="image/*"]').setInputFiles([
    { name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: grande },
    { name: 'roto.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('esto no es una foto') },
  ])
  await expect(page.getByRole('alert')).toContainText('«roto.jpg»: No se ha podido leer esa foto.')
  await expect(fotos).toHaveCount(1)
  await page.locator('input[accept="image/*"]').setInputFiles({ name: 'IMG_0002.jpg', mimeType: 'image/jpeg', buffer: grande })
  await expect(fotos).toHaveCount(2)

  // Se puede quitar una y volver a ponerla.
  await page.getByRole('button', { name: 'Quitar la foto IMG_0002.jpg' }).click()
  await expect(fotos).toHaveCount(1)
  await page.locator('input[accept="image/*"]').setInputFiles({ name: 'IMG_0002.jpg', mimeType: 'image/jpeg', buffer: grande })
  await expect(fotos).toHaveCount(2)

  await page.getByRole('button', { name: 'Enviar parte' }).click()
  await expect(page.getByText(/Sin cobertura\. El parte queda guardado en este móvil, con 2 fotos,/)).toBeVisible()
  await expect(fotos).toHaveCount(0)
  expect(supabase.llegadas).toEqual([])

  // Las dos fotos están guardadas en el móvil, en IndexedDB, ya en JPEG: no solo en la memoria de la página.
  const guardadas = await page.evaluate(() => new Promise<string[]>((resolver, fallar) => {
    const abierta = indexedDB.open('libro-edificio')
    abierta.onerror = () => fallar(abierta.error)
    abierta.onsuccess = () => {
      const lectura = abierta.result.transaction('partes').objectStore('partes').getAll()
      lectura.onsuccess = () => resolver(lectura.result[0].fotos.map((f: { archivo: Blob }) => f.archivo.type))
    }
  }))
  expect(guardadas).toEqual(['image/jpeg', 'image/jpeg'])

  await page.getByRole('button', { name: '← Inicio' }).click()
  await expect(page.getByText('1 parte sin enviar.')).toBeVisible()
  await supabase.red(true)
  await expect(page.getByText('1 parte sin enviar.')).toBeHidden()

  // Primero el parte, después sus dos fotos, cada cosa una vez.
  const [parte] = supabase.partes.values()
  const ids = [...supabase.fotos.keys()]
  expect(ids).toHaveLength(2)
  expect(supabase.llegadas).toEqual([`parte ${parte.id}`, `foto ${ids[0]}`, `foto ${ids[1]}`])
  for (const { parte: suParte, bytes } of supabase.fotos.values()) {
    expect(suParte).toBe(parte.id)
    // Llega en JPEG, reducida a 1600 píxeles por el lado largo y con mucho menos peso.
    expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff])
    expect(medidasJpeg(bytes)).toEqual({ ancho: 1600, alto: 1067 })
    expect(bytes.length).toBeLessThan(1024 * 1024)
  }
})

test('si una foto no se acepta, el parte llega igual y el aviso se queda en Inicio', async ({ page }) => {
  await abrir(page)
  await page.getByRole('button', { name: 'Registrar parte' }).click()
  await page.getByRole('heading', { name: '¿Dónde?' }).waitFor()
  const grande = await fotoGrande(page)

  supabase.modoFotos = 'fuera-de-plazo'
  await rellenarParte(page, 'Parte con una foto que no se acepta.')
  await page.locator('input[accept="image/*"]').setInputFiles({ name: 'IMG_0003.jpg', mimeType: 'image/jpeg', buffer: grande })
  await expect(page.getByRole('list', { name: 'Fotos del parte' }).getByRole('listitem')).toHaveCount(1)
  await page.getByRole('button', { name: 'Enviar parte' }).click()
  await expect(page.getByText(/^Parte enviado\. La revisión/)).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('El parte ha llegado, pero una foto no se ha podido añadir: Ese parte se recibió hace más de 7 días')
  expect(supabase.partes.size).toBe(1)

  await page.getByRole('button', { name: '← Inicio' }).click()
  await expect(page.getByText(/faltan fotos/)).toBeVisible()
  await page.reload()
  await expect(page.getByText(/faltan fotos/)).toBeVisible()
  // No se reintenta solo.
  expect(supabase.llegadas.filter(l => l.startsWith('foto'))).toHaveLength(1)
})

/**
 * Una foto de 4000 × 3000 hecha con el móvil de pie: se guarda tumbada y el EXIF dice que hay que girarla
 * 90° a la derecha (orientación 6). La mitad izquierda es roja y la derecha azul: ya girada, arriba es roja.
 */
async function fotoDePie(pagina: Page): Promise<Buffer> {
  const base64 = await pagina.evaluate(async () => {
    const lienzo = document.createElement('canvas')
    lienzo.width = 4000
    lienzo.height = 3000
    const contexto = lienzo.getContext('2d')!
    contexto.fillStyle = '#f00'
    contexto.fillRect(0, 0, 2000, 3000)
    contexto.fillStyle = '#00f'
    contexto.fillRect(2000, 0, 2000, 3000)
    const jpeg = new Uint8Array(await (await new Promise<Blob>(r => lienzo.toBlob(b => r(b!), 'image/jpeg', 0.9))).arrayBuffer())
    // El bloque EXIF, con una sola etiqueta: Orientation (0x0112) = 6.
    const tiff = [0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0]
    const cuerpo = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]
    const conExif = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, cuerpo.length + 2, ...cuerpo, ...jpeg.slice(2)])
    let texto = ''
    for (const byte of conExif) texto += String.fromCharCode(byte)
    return btoa(texto)
  })
  return Buffer.from(base64, 'base64')
}

test('una foto hecha de pie se abre ya reducida y llega derecha', async ({ page }) => {
  // Se apunta qué pide la app al navegador: tiene que pedir la foto ya reducida, no entera.
  await page.addInitScript(() => {
    const original = window.createImageBitmap.bind(window)
    const pedidas: unknown[] = []
    Object.assign(window, { pedidas })
    window.createImageBitmap = ((fuente: ImageBitmapSource, ...resto: unknown[]) => {
      pedidas.push(resto.at(-1) ?? null)
      return (original as (...a: unknown[]) => Promise<ImageBitmap>)(fuente, ...resto)
    }) as typeof window.createImageBitmap
  })
  await abrir(page)
  await page.getByRole('button', { name: 'Registrar parte' }).click()
  await page.getByRole('heading', { name: '¿Dónde?' }).waitFor()
  const dePie = await fotoDePie(page)

  await rellenarParte(page, 'Foto del extintor, hecha de pie.')
  await page.locator('input[accept="image/*"]').setInputFiles({ name: 'IMG_0004.jpg', mimeType: 'image/jpeg', buffer: dePie })
  await expect(page.getByRole('list', { name: 'Fotos del parte' }).getByRole('listitem')).toHaveCount(1)
  // Las medidas ya giradas: 1200 de ancho y 1600 de alto.
  const pedidas = await page.evaluate(() => (window as unknown as { pedidas: unknown[] }).pedidas)
  expect(pedidas).toContainEqual({ resizeWidth: 1200, resizeHeight: 1600, resizeQuality: 'high' })

  await page.getByRole('button', { name: 'Enviar parte' }).click()
  await expect(page.getByText(/^Parte enviado, con una foto\./)).toBeVisible()
  const [{ bytes }] = supabase.fotos.values()
  expect(medidasJpeg(bytes)).toEqual({ ancho: 1200, alto: 1600 })
  // Derecha: arriba roja y abajo azul. Si no se hubiera girado, saldría roja a la izquierda.
  const colores = await page.evaluate(async base64 => {
    const datos = Uint8Array.from(atob(base64), letra => letra.charCodeAt(0))
    const mapa = await createImageBitmap(new Blob([datos], { type: 'image/jpeg' }))
    const lienzo = new OffscreenCanvas(mapa.width, mapa.height)
    const contexto = lienzo.getContext('2d')!
    contexto.drawImage(mapa, 0, 0)
    const color = (x: number, y: number) => {
      const [r, , b] = contexto.getImageData(x, y, 1, 1).data
      return r > 128 && b < 128 ? 'rojo' : b > 128 && r < 128 ? 'azul' : 'otro'
    }
    return { arriba: color(600, 400), abajo: color(600, 1200) }
  }, bytes.toString('base64'))
  expect(colores).toEqual({ arriba: 'rojo', abajo: 'azul' })
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
