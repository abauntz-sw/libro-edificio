// Comprueba el esquema y los permisos en un PostgreSQL en memoria, sin Docker ni cuenta.
//   npm install --no-save @electric-sql/pglite
//   node supabase/tests/comprobar.mjs
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const base = join(dirname(fileURLToPath(import.meta.url)), '..')
const db = new PGlite()
let fallos = 0, total = 0
const fallidas = []

function ok(cond, texto) {
  total++
  if (!cond) { fallos++; fallidas.push(texto) }
  console.log(`${cond ? 'ok   ' : 'FALLO'} ${texto}`)
  // En GitHub Actions, la línea ::error:: aparece destacada en el resumen del PR.
  if (!cond && process.env.GITHUB_ACTIONS) console.log(`::error title=Comprobación fallida::${texto}`)
}

// Lo que Supabase ya trae de serie.
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select (nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub')::uuid $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on routines to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`)

for (const f of readdirSync(join(base, 'migrations')).sort()) {
  await db.exec(readFileSync(join(base, 'migrations', f), 'utf8'))
}
await db.exec(readFileSync(join(base, 'seed.sql'), 'utf8'))

const cuentas = {
  admin: '11111111-1111-4111-8111-111111111111',
  consulta: '22222222-2222-4222-8222-222222222222',
  guarda: '33333333-3333-4333-8333-333333333333',
  calor: '44444444-4444-4444-8444-444444444444',
  extintores: '55555555-5555-4555-8555-555555555555',
  aguas: '66666666-6666-4666-8666-666666666666',
  otro: '77777777-7777-4777-8777-777777777777',
}
for (const id of Object.values(cuentas)) await db.query('insert into auth.users values ($1)', [id])
const enlazar = (nombre, id) => db.query('update public.usuarios set auth_id = $1 where nombre = $2', [id, nombre])
await enlazar('Administración de Ejemplo', cuentas.admin)
await enlazar('Vocal de Ejemplo', cuentas.consulta)
await enlazar('Guarda de Ejemplo', cuentas.guarda)
await enlazar('Calor Ficticio SL', cuentas.calor)
await enlazar('Extintores Ficticios SL', cuentas.extintores)
await enlazar('Aguas Ficticias SL', cuentas.aguas)

// Ejecuta como una persona conectada y deshace al terminar, salvo que se pida guardar.
async function como(cuenta, fn, { guardar = false } = {}) {
  await db.exec('begin')
  try {
    if (cuenta === 'anon') await db.exec('set local role anon')
    else {
      const claims = JSON.stringify({ sub: cuentas[cuenta], role: 'authenticated' }).replace(/'/g, "''")
      await db.exec(`set local request.jwt.claims = '${claims}'; set local role authenticated`)
    }
    return await fn()
  } finally {
    await db.exec(guardar ? 'commit' : 'rollback')
  }
}
const filas = async (sql, p) => (await db.query(sql, p)).rows
const cuenta = async (sql, p) => Number((await filas(`select count(*) as n from (${sql}) x`, p))[0].n)
// Un error aborta la transacción: el punto de guardado evita que los siguientes
// «fallen» solo por eso y den una comprobación por buena sin serlo.
async function falla(fn) {
  await db.exec('savepoint prueba')
  try { await fn(); await db.exec('release savepoint prueba'); return false }
  catch { await db.exec('rollback to savepoint prueba'); return true }
}

// Fechas relativas a hoy, como en seed.sql, para que las comprobaciones valgan cualquier día.
const dia = async (desde_hoy = '0 days') =>
  (await filas('select (current_date + $1::interval)::date::text as d', [desde_hoy]))[0].d
const hoy = await dia()

const id = async (tabla, campo, valor) => (await filas(`select id from public.${tabla} where ${campo} = $1`, [valor]))[0].id
const calefaccion = await id('instalaciones', 'tipo_id', 'calefaccion-acs')
const extintores = await id('instalaciones', 'tipo_id', 'contraincendios')
const revGuarda = await id('revisiones', 'descripcion', 'Revisión de extintores y equipos por el titular')
const revAnual = await id('revisiones', 'descripcion', 'Revisión anual por empresa mantenedora')
const revCaldera = await id('revisiones', 'descripcion', 'Mantenimiento de generadores y equipos')
const edificio = (await filas('select id from public.edificios'))[0].id
const parte = (cols, vals, p) => db.query(
  `insert into public.partes (edificio_id, instalacion_id, fecha, tipo, descripcion, ${cols.join(',')})
   values ($1, $2, $3, $4, $5, ${vals})`, p)
const parteSimple = (inst, tipo, fecha = hoy, rev = null, prox = null) => db.query(
  `insert into public.partes (edificio_id, instalacion_id, fecha, tipo, descripcion, revision_id, proxima_revision)
   values ($1, $2, $3, $4, 'Prueba', $5, $6)`, [edificio, inst, fecha, tipo, rev, prox])

console.log('\nCarga')
ok(await cuenta('select 1 from public.instalaciones') === 6, '6 instalaciones')
ok(await cuenta('select 1 from public.documentos') === 12, '12 documentos')
// Las fechas del ejemplo cuentan desde hoy: un año escrito a mano dejaría de cuadrar con ellas.
ok(await cuenta(`select 1 from public.documentos
  where titulo ~ '\\m(19|20)\\d\\d\\M' or nombre_original ~ '\\m(19|20)\\d\\d\\M'`) === 0,
  'ningún título ni nombre de archivo del ejemplo lleva un año')
ok(await cuenta('select 1 from public.partes') === 20, '20 partes')
ok(await cuenta('select 1 from public.revisiones') === 4, '4 revisiones')
ok((await filas(`select count(*) n from public.plantilla_revisiones where verificado`))[0].n == 0, 'ninguna periodicidad figura como verificada')
ok(await cuenta(`select 1 from public.revisiones r
  where r.ultima = (select max(p.fecha) from public.partes p where p.revision_id = r.id)`) === 4,
  'cada revisión toma la fecha de su último parte')
ok(await cuenta(`select 1 from public.revisiones r join public.partes p on p.revision_id = r.id
  where r.id = $1 and r.proxima = (p.fecha + interval '12 months')::date`, [revAnual]) === 1,
  'la revisión anual vence un año después de su parte')
const sinRls = await filas(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`)
ok(sinRls.length === 0, 'todas las tablas tienen seguridad por filas')
ok(await cuenta(`select 1 from public.plantilla_revisiones where btrim(fuente) = ''`) === 0, 'toda periodicidad lleva su fuente')
ok(await cuenta(`select 1 from public.plantilla_revisiones where fuente like '%425/2009%'`) === 0, 'ninguna fuente cita la Orden Foral 425/2009, que está derogada')
ok(await cuenta(`select 1 from public.plantilla_revisiones where tipo_instalacion_id = 'gas' and periodicidad_meses = 60 and fuente like '%apartados 4.1 y 4.2%' and not verificado`) === 1, 'la revisión de gas cita sus apartados y sigue sin verificar')

console.log('\nSin sesión')
// Supabase da permiso a anon sobre cada tabla y función nueva. La primera migración se los quita,
// pero solo a lo que había entonces. Esto avisa si una migración futura deja algo abierto.
const abiertoAAnon = (await filas(`
  select c.relname as nombre from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
    and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
      or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))
  union all
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'interno') and has_function_privilege('anon', p.oid, 'execute')`)).map(f => f.nombre)
ok(abiertoAAnon.length === 0, `anon no tiene permiso sobre ninguna tabla ni función${abiertoAAnon.length ? `: ${abiertoAAnon.join(', ')}` : ''}`)
// Lo que cree una migración futura nace cerrado, aunque olvide su `revoke`. Se crea y se deshace.
await db.exec('begin')
try {
  await db.exec(`
    create table public.prueba_nueva (id int);
    create view public.prueba_vista as select 1 as x;
    create sequence public.prueba_contador;
    create function public.prueba_funcion() returns int language sql as 'select 1';
    create function interno.prueba_interna() returns int language sql as 'select 1';`)
  const [n] = await filas(`select
    has_table_privilege('anon', 'public.prueba_nueva', 'select, insert, update, delete') as tabla,
    has_table_privilege('anon', 'public.prueba_vista', 'select') as vista,
    has_sequence_privilege('anon', 'public.prueba_contador', 'usage, select, update') as secuencia,
    has_function_privilege('anon', 'public.prueba_funcion()', 'execute') as funcion,
    has_function_privilege('anon', 'interno.prueba_interna()', 'execute') as interna`)
  ok(!n.tabla && !n.vista, 'una tabla o vista nueva nace cerrada para anon')
  ok(!n.secuencia, 'una secuencia nueva nace cerrada para anon')
  ok(!n.funcion && !n.interna, 'una función nueva nace cerrada para anon, en public y en interno')
} finally {
  await db.exec('rollback')
}
await como('anon', async () => {
  for (const t of ['edificios', 'usuarios', 'documentos', 'partes', 'codigos_acceso', 'avisos']) {
    ok(await falla(() => filas(`select * from public.${t}`)), `anon no puede leer ${t}`)
  }
  ok(await falla(() => filas(`select public.registrar_documento(gen_random_uuid(),'otro','x','2026-01-01','','r','n',repeat('a',64),'{}')`)), 'anon no puede archivar')
})

console.log('\nCuenta sin ficha en el edificio')
await como('otro', async () => {
  ok(await cuenta('select 1 from public.documentos') === 0, 'no ve documentos')
  ok(await cuenta('select 1 from public.tipos_documento') === 0, 'no ve tipos')
})

console.log('\nLectura por perfil')
await como('admin', async () => {
  ok(await cuenta('select 1 from public.documentos') === 12, 'admin ve 12 documentos')
  ok(await cuenta('select 1 from public.usuarios') === 6, 'admin ve 6 usuarios')
  ok(await cuenta('select 1 from public.actividad') > 0, 'admin ve la actividad')
})
await como('consulta', async () => {
  ok(await cuenta('select 1 from public.documentos') === 12, 'consulta ve 12 documentos')
  ok(await cuenta('select 1 from public.usuarios') === 1, 'consulta solo ve su ficha')
  ok(await cuenta('select 1 from public.actividad') === 0, 'consulta no ve la actividad')
  ok(await falla(() => db.query(`update public.instalaciones set nombre = 'x'`)) === false
     && await cuenta(`select 1 from public.instalaciones where nombre = 'x'`) === 0, 'consulta no cambia instalaciones')
  ok(await falla(() => parteSimple(calefaccion, 'preventivo')), 'consulta no registra partes')
})
await como('guarda', async () => {
  ok(await cuenta('select 1 from public.documentos') === 12, 'guarda ve 12 documentos')
  ok(await cuenta('select 1 from public.contactos') === 5, 'guarda ve los contactos')
  ok(await falla(() => filas('select * from public.codigos_acceso')), 'guarda no lee códigos')
})
await como('calor', async () => {
  ok(await cuenta('select 1 from public.instalaciones') === 1, 'empresa ve solo su instalación')
  const docs = await cuenta('select 1 from public.documentos')
  ok(docs > 0 && docs < 12, `empresa ve solo sus documentos (${docs})`)
  ok(await cuenta('select 1 from public.contactos') === 1, 'empresa no ve otros contactos')
  ok(await cuenta('select 1 from public.partes where instalacion_id <> $1', [calefaccion]) === 0, 'empresa no ve partes ajenos')
  ok(await cuenta('select 1 from public.avisos where clase = $1 and referencia_id <> $2', ['revision', revCaldera]) === 0, 'avisos filtrados para la empresa')
})
// La función de archivos hace esta consulta antes de entregar un documento.
const docCalefaccion = 'e4996b97-8d6e-5a5a-892c-2239c6bd3c94'
const veDocumento = () => cuenta('select ruta from public.documentos where id = $1', [docCalefaccion])
await como('calor', async () => ok(await veDocumento() === 1, 'empresa ve por su identificador un documento de su instalación'))
await como('aguas', async () => ok(await veDocumento() === 0, 'empresa no ve un documento ajeno aunque conozca su identificador'))

console.log('\nAccesos cerrados')
await como('extintores', async () => ok(await cuenta('select 1 from public.instalaciones') === 0, 'código caducado no ve nada'))
await como('aguas', async () => ok(await cuenta('select 1 from public.instalaciones') === 0, 'usuario desactivado no ve nada'))

console.log('\nPartes')
await como('calor', async () => {
  await parteSimple(calefaccion, 'preventivo')
  const p = (await filas(`select autor_rol, autor_id, empresa_id from public.partes where descripcion = 'Prueba'`))[0]
  ok(p.autor_rol === 'tecnico' && p.autor_id && p.empresa_id, 'autor y empresa los pone la base de datos')
  ok(await falla(() => parteSimple(extintores, 'preventivo')), 'empresa no registra en una instalación ajena')
})
await como('calor', async () => ok(await falla(() => parteSimple(calefaccion, 'comprobacion')), 'empresa no registra comprobaciones'))
await como('guarda', async () => ok(await falla(() => parteSimple(extintores, 'preventivo')), 'guarda no registra preventivos'))
await como('guarda', async () => {
  await parteSimple(extintores, 'comprobacion', hoy, revGuarda)
})
await como('guarda', async () => ok(await falla(() => parteSimple(extintores, 'comprobacion', hoy, revAnual)), 'guarda no cierra revisiones de otro responsable'))
await como('guarda', async () => ok(await falla(() => parteSimple(calefaccion, 'comprobacion', hoy, revGuarda)), 'la revisión debe ser de esa instalación'))
await como('admin', async () => {
  const proxima = async rev => (await filas('select proxima::text as d from public.revisiones where id = $1', [rev]))[0].d
  const enUnAno = await dia('12 months')
  await parteSimple(extintores, 'preventivo', hoy, revAnual)
  const p1 = await proxima(revAnual)
  ok(p1 === enUnAno, `una revisión periódica pasa a ${p1}`)
  await parteSimple(extintores, 'preventivo', await dia('-1 month'), revAnual)
  ok(await proxima(revAnual) === enUnAno, 'un parte atrasado no retrocede la revisión')
  const indicada = await dia('11 months')
  await parteSimple(calefaccion, 'preventivo', hoy, revCaldera, indicada)
  ok(await proxima(revCaldera) === indicada, 'sin periodicidad usa la fecha indicada')
})
await como('guarda', async () => {
  const ident = '88888888-8888-4888-8888-888888888888'
  const envio = `insert into public.partes (id, edificio_id, instalacion_id, fecha, tipo, descripcion)
    values ('${ident}', '${edificio}', '${extintores}', '${hoy}', 'comprobacion', 'Reenvío') on conflict (id) do nothing`
  await db.query(envio); await db.query(envio)
  ok(await cuenta(`select 1 from public.partes where id = '${ident}'`) === 1, 'reenviar un parte no lo duplica')
  ok(await falla(() => db.query(`update public.partes set descripcion = 'x'`)), 'un parte no se cambia')
  ok(await falla(() => db.query(`delete from public.partes`)), 'un parte no se borra')
})

console.log('\nDocumentos')
const archivar = (i, inst) => filas(`select public.registrar_documento(
  $1, 'certificado', 'Prueba', '2026-11-06', 'Emisor', $2, 'a.pdf', repeat('a', 64), $3::uuid[]) as id`,
  [i, `documentos/2026/${i}.pdf`, inst])
const d1 = '99999999-9999-4999-8999-999999999991'
await como('calor', async () => {
  await archivar(d1, [calefaccion])
  ok(await cuenta('select 1 from public.documentos where id = $1', [d1]) === 1, 'empresa archiva en su instalación')
  await archivar(d1, [calefaccion])
  ok(await cuenta('select 1 from public.documento_instalaciones where documento_id = $1', [d1]) === 1, 'repetir no duplica los enlaces')
  // El mismo identificador con otra huella es otro archivo: no se da por bueno.
  ok(await falla(() => filas(`select public.registrar_documento(
    $1, 'certificado', 'Otra', '2026-11-06', 'Emisor', $2, 'b.pdf', repeat('b', 64), $3::uuid[])`,
    [d1, `documentos/2026/${d1}.pdf`, [calefaccion]])), 'un identificador repetido con otra huella no vale')
  ok((await filas('select titulo from public.documentos where id = $1', [d1]))[0].titulo === 'Prueba', 'la ficha de antes no cambia')
  ok(await falla(() => archivar('99999999-9999-4999-8999-999999999992', [extintores])), 'empresa no archiva en otra instalación')
})
await como('calor', async () => ok(await falla(() => archivar('99999999-9999-4999-8999-999999999993', [])), 'empresa no archiva sin instalación'))
await como('calor', async () => ok(await falla(() => archivar('99999999-9999-4999-8999-999999999995', null)), 'empresa no archiva con la lista vacía'))
await como('guarda', async () => ok(await falla(() => archivar('99999999-9999-4999-8999-999999999994', [extintores])), 'guarda no archiva'))
await como('guarda', async () => ok(await falla(() => db.query(`insert into public.documentos (edificio_id,tipo_id,titulo,fecha,ruta,nombre_original,sha256) values ('${edificio}','otro','x','2026-01-01','r','n',repeat('a',64))`)), 'nadie inserta documentos directamente'))
// Una ficha solo apunta a su propio documento. Si no, la función de archivos entregaría otro archivo del repositorio.
const d6 = '99999999-9999-4999-8999-999999999996'
const archivarEn = ruta => filas(`select public.registrar_documento(
  $1, 'certificado', 'Prueba', '2026-11-06', 'Emisor', $2, 'a.pdf', repeat('a', 64), $3::uuid[]) as id`,
  [d6, ruta, [calefaccion]])
for (const ruta of [
  'indice/documentos.csv', 'README.md', `fotos/2026/${d6}.jpg`, `documentos/2026/${d1}.pdf`, `documentos/2026/../../indice/${d6}.pdf`,
  // Con el nombre legible (#77): lo de delante del identificador tiene una forma fija.
  `documentos/2026/2026-11-06_certificado_${d1}.pdf`, `documentos/2026/certificado_${d6}.pdf`,
  `documentos/2026/2026-11-06_Certificado_${d6}.pdf`, `documentos/2026/2026-11-06_certificado_../../indice_${d6}.pdf`,
  `documentos/2026/2026-11-06_a_b_c_${d6}.pdf`,
]) {
  await como('calor', async () => ok(await falla(() => archivarEn(ruta)), `empresa no archiva una ficha con la ruta ${ruta}`))
}
await como('calor', async () => {
  await archivarEn(`documentos/2026/${d6}.docx`)
  ok(await cuenta('select 1 from public.documentos where id = $1', [d6]) === 1, 'se archiva un documento que no es PDF')
})
// El nombre legible (#77), con y sin descripción. Cada uno con su identificador: si uno fallara, no arrastraría al otro.
for (const [d, nombre] of [
  ['99999999-9999-4999-8999-999999999997', 'certificado_revision-de-la-caldera_'],
  ['99999999-9999-4999-8999-999999999998', 'certificado_'],
]) {
  await como('calor', async () => {
    await filas(`select public.registrar_documento(
      $1, 'certificado', 'Prueba', '2026-11-06', 'Emisor', $2, 'a.pdf', repeat('a', 64), $3::uuid[]) as id`,
      [d, `documentos/2026/2026-11-06_${nombre}${d}.pdf`, [calefaccion]])
    ok(await cuenta('select 1 from public.documentos where id = $1', [d]) === 1, `se archiva con el nombre legible 2026-11-06_${nombre}<id>.pdf`)
  })
}
const doc = await id('documentos', 'titulo', 'Revisión anual de extintores')
await como('admin', async () => {
  await db.query('update public.documentos set eliminado_en = now() where id = $1', [doc])
  ok(await cuenta('select 1 from public.documentos where eliminado_en is not null') === 1, 'admin ve la papelera')
  ok(await cuenta(`select 1 from public.actividad where accion = 'papelera'`) === 1, 'la papelera queda anotada')
  ok(await falla(() => db.query(`update public.documentos set ruta = 'otra' where id = $1`, [doc])), 'la ruta no se cambia')
  ok(await falla(() => db.query('delete from public.documentos where id = $1', [doc])), 'un documento no se borra desde la aplicación')
}, { guardar: true })
await como('guarda', async () => ok(await cuenta('select 1 from public.documentos') === 11, 'lo eliminado desaparece para el resto'))
await como('admin', async () => { await db.query('update public.documentos set eliminado_en = null where id = $1', [doc]) }, { guardar: true })

await como('admin', async () => {
  ok(await falla(() => db.query(`update public.edificios set repositorio = 'otra/org'`)), 'el repositorio no se cambia')
  await parteSimple(extintores, 'preventivo', hoy, revAnual)
  await db.query('delete from public.revisiones where id = $1', [revAnual])
  ok(await cuenta(`select 1 from public.partes where descripcion = 'Prueba' and revision_id is null`) === 1, 'borrar una revisión conserva sus partes')
})

console.log('\nUsuarios')
await como('admin', async () => {
  ok(await falla(() => db.query(`update public.usuarios set activo = false where perfil = 'admin'`)), 'no se puede dejar el edificio sin administración')
})
// Una caducidad pasada deja sin acceso igual que desactivar la cuenta.
await como('admin', async () => {
  ok(await falla(() => db.query(`update public.usuarios set acceso_caduca = current_date - 1 where perfil = 'admin'`)),
    'la última persona administradora no se queda con el acceso caducado')
})
await como('admin', async () => {
  await db.query(`insert into public.usuarios (edificio_id, nombre, perfil, acceso_caduca)
    values ($1, 'Administración caducada', 'admin', current_date - 1)`, [edificio])
  ok(await falla(() => db.query(`update public.usuarios set activo = false where nombre = 'Administración de Ejemplo'`)),
    'una administradora con el acceso caducado no cuenta como otra')
})
await como('admin', async () => {
  await db.query(`insert into public.usuarios (edificio_id, nombre, perfil) values ($1, 'Otra administración', 'admin')`, [edificio])
  ok(!await falla(() => db.query(`update public.usuarios set acceso_caduca = current_date - 1 where nombre = 'Administración de Ejemplo'`)),
    'con otra administradora en vigor, sí se puede poner caducidad')
})
await como('admin', async () => ok(await falla(() => db.query(`update public.usuarios set auth_id = null where perfil = 'guarda'`)), 'no se cambia el enlace de la sesión'))
await como('guarda', async () => {
  await db.query(`update public.usuarios set perfil = 'admin' where perfil = 'guarda'`).catch(() => {})
  ok(await cuenta(`select 1 from public.usuarios where perfil = 'admin'`) === 0, 'guarda no se hace administrador')
})

console.log('\nDos edificios')
await db.exec(`
  insert into public.edificios (id, nombre, tipo, municipio, provincia, repositorio)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Otro', 'otro', 'M', 'P', 'ejemplo/otro');
  insert into public.instalaciones (id, edificio_id, nombre, tipo_id, estado)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Otra', 'gas', 'activa');
  insert into public.tipos_documento (id, edificio_id, nombre)
    values ('propio-otro', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Propio');
`)
await como('admin', async () => {
  ok(await cuenta('select 1 from public.instalaciones where edificio_id = $1', ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']) === 0, 'no ve otro edificio')
  ok(await cuenta('select 1 from public.tipos_documento where id = $1', ['propio-otro']) === 0, 'no ve tipos de otro edificio')
  ok(await falla(() => parteSimple('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'preventivo')), 'no registra en otro edificio')
})
await como('admin', async () => ok(await falla(() => db.query(`update public.documentos set tipo_id = 'propio-otro' where id = $1`, [doc])), 'no usa tipos de otro edificio'))
await como('admin', async () => ok(await falla(() => db.query(`insert into public.instalaciones (edificio_id, nombre, tipo_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','x','gas')`)), 'no crea datos en otro edificio'))

console.log('\nConsultas preparadas')
await como('admin', async () => {
  const av = (await filas('select clase, estado, titulo from public.avisos'))
    .map(a => `${a.clase} ${a.estado}: ${a.titulo}`)
  const esperados = [
    'documento vencido: Contrato de calefacción',
    'documento pronto: Póliza de seguro',
    'revision vencido: Mantenimiento de generadores y equipos',
    'revision pronto: Revisión de extintores y equipos por el titular',
  ]
  for (const e of esperados) ok(av.includes(e), `aviso ${e}`)
  ok(av.length === esperados.length, `no hay más avisos que esos (${av.length})`)
})

console.log('\nHuecos')
const huecos = async () => (await filas('select instalacion, falta from public.huecos order by 1, 2'))
  .map(h => `${h.instalacion}: ${h.falta}`)
const huecosEsperados = [
  'Agua de consumo: Certificado',
  'Calefacción y agua caliente: Certificado',
  'Cubierta y fachada: Informe',
  'Instalación eléctrica: Contrato de mantenimiento',
  'Protección contra incendios: Acta de inspección',
  'Saneamiento: Contrato de mantenimiento',
  'Saneamiento: Informe',
]
await como('admin', async () => {
  const hu = await huecos()
  ok(hu.join('|') === huecosEsperados.join('|'), `el albergue tiene los ${huecosEsperados.length} huecos esperados (${hu.length})`)

  // Un documento en la papelera ya no cubre su hueco. Al recuperarlo, vuelve a cubrirlo.
  const inspeccion = await id('documentos', 'titulo', 'Inspección de baja tensión')
  const nuevo = 'Instalación eléctrica: Acta de inspección'
  await db.query('update public.documentos set eliminado_en = now() where id = $1', [inspeccion])
  ok((await huecos()).includes(nuevo), 'un documento en la papelera vuelve a contar como hueco')
  await db.query('update public.documentos set eliminado_en = null where id = $1', [inspeccion])
  ok(!(await huecos()).includes(nuevo), 'al recuperarlo deja de ser un hueco')
})

console.log('\nExportación del índice')
// Como la función «exportar», con la clave de servicio. Deshace al terminar.
async function comoServicio(fn) {
  await db.exec('begin')
  try { await db.exec('set local role service_role'); return await fn() }
  finally { await db.exec('rollback') }
}
const exportar = async () => Object.fromEntries((await filas('select archivo, contenido from public.exportar_indice($1)', [edificio]))
  .map(f => [f.archivo, f.contenido]))
const lineas = texto => texto.split('\r\n').slice(0, -1)

await como('admin', async () => ok(await falla(() => exportar()), 'la administración no puede llamar a exportar_indice'))
await como('anon', async () => ok(await falla(() => exportar()), 'sin sesión no se puede llamar a exportar_indice'))
await comoServicio(async () => {
  const indice = await exportar()
  ok(Object.keys(indice).sort().join() === 'indice/documentos.csv,indice/instalaciones.csv,indice/partes.csv,indice/revisiones.csv',
    'exporta los cuatro CSV a indice/')
  // La marca BOM se mira dentro de la base de datos: al pasar a JavaScript, PGlite la quita del principio.
  for (const archivo of Object.keys(indice)) {
    const plantilla = readFileSync(join(base, '..', 'plantilla-edificio', archivo), 'utf8').replace(/^﻿/, '')
    ok(indice[archivo].replace(/^﻿/, '').startsWith(plantilla), `${archivo} lleva la cabecera de la plantilla, con \\r\\n`)
  }
  ok(await cuenta(`select 1 from public.exportar_indice($1) where left(contenido, 1) = chr(65279) and right(contenido, 2) = e'\\r\\n'`, [edificio]) === 4,
    'los cuatro llevan la marca BOM, para Excel, y acaban en salto de línea')
  ok(lineas(indice['indice/documentos.csv']).length === 13, 'documentos.csv: cabecera y 12 documentos')
  ok(lineas(indice['indice/instalaciones.csv']).length === 7, 'instalaciones.csv: cabecera y 6 instalaciones')
  ok(lineas(indice['indice/revisiones.csv']).length === 5, 'revisiones.csv: cabecera y 4 revisiones')
  ok(lineas(indice['indice/partes.csv']).length === 21, 'partes.csv: cabecera y 20 partes')
  ok(!indice['indice/instalaciones.csv'].includes('\r\nOtra;'), 'no lleva las instalaciones de otro edificio')
  ok(JSON.stringify(await exportar()) === JSON.stringify(indice), 'dos exportaciones seguidas salen iguales: sin cambios, no hay commit')

  await db.query(`update public.documentos set eliminado_en = now() where id = $1`, [doc])
  ok(lineas((await exportar())['indice/documentos.csv']).length === 12, 'un documento en la papelera no sale en el índice')

  await db.query(`update public.instalaciones set notas = 'Llave en la caja; la "pequeña"' where id = $1`, [calefaccion])
  await db.query(`update public.instalaciones set marca = '=HIPERVINCULO("x")' where id = $1`, [extintores])
  const inst = (await exportar())['indice/instalaciones.csv']
  ok(inst.includes(';"Llave en la caja; la ""pequeña"""\r\n'), 'un texto con punto y coma o comillas va entre comillas')
  ok(inst.includes(`;"'=HIPERVINCULO(""x"")";`), 'un texto que empieza por = lleva un apóstrofo delante, para que Excel no lo tome por fórmula')
})

console.log('\nFotos de los partes')
// Va al final porque guarda un parte: antes cambiaría los recuentos de la exportación.
const parteConFotos = '88888888-8888-4888-8888-888888888801'
const foto1 = '88888888-8888-4888-8888-888888888811'
const foto2 = '88888888-8888-4888-8888-888888888812'
const rutaFoto = f => `fotos/2026/${f}.jpg`
const ponerFoto = (f, ruta = rutaFoto(f), p = parteConFotos) => db.query(
  `insert into public.parte_fotos (id, edificio_id, parte_id, ruta, sha256) values ($1, $2, $3, $4, repeat('c', 64))`,
  [f, edificio, p, ruta])
const puedoAdjuntar = async (p = parteConFotos) => (await filas('select public.puedo_adjuntar_foto($1) as si', [p]))[0].si

await como('guarda', async () => {
  await db.query(`insert into public.partes (id, edificio_id, instalacion_id, fecha, tipo, descripcion)
    values ($1, $2, $3, $4, 'comprobacion', 'Con fotos')`, [parteConFotos, edificio, extintores, hoy])
  ok(await puedoAdjuntar() === true, 'quien escribió el parte puede adjuntarle fotos')
  await ponerFoto(foto1)
  ok(await cuenta('select 1 from public.parte_fotos where id = $1', [foto1]) === 1, 'y la foto queda apuntada')
  // El nombre legible (#77), con la instalación y sin ella (fotos sin parte, #82).
  for (const [f, nombre] of [['88888888-8888-4888-8888-888888888813', `${hoy}_extintores_`], ['88888888-8888-4888-8888-888888888814', `${hoy}_`]]) {
    await ponerFoto(f, `fotos/2026/${nombre}${f}.jpg`)
    ok(await cuenta('select 1 from public.parte_fotos where id = $1', [f]) === 1, `una foto se apunta con el nombre legible ${nombre.replace(hoy, '<fecha>')}<id>.jpg`)
  }
}, { guardar: true })
await como('guarda', async () => {
  // Cada caso con su propio identificador: si uno entrara por error, no haría fallar a los siguientes.
  const rutas = [
    f => rutaFoto(foto1),
    f => 'indice/partes.csv',
    f => `documentos/2026/${f}.pdf`,
    f => `fotos/2026/${f}.png`,
    f => `fotos/2026/../${f}.jpg`,
    f => `fotos/2026/2026-11-06_extintores_${foto1}.jpg`,
    f => `fotos/2026/extintores_${f}.jpg`,
    f => `fotos/2026/2026-11-06_a_b_${f}.jpg`,
  ]
  for (const [i, ruta] of rutas.entries()) {
    const f = `88888888-8888-4888-8888-88888888882${i}`
    ok(await falla(() => ponerFoto(f, ruta(f))), `una foto no apunta a ${ruta('<id>')}`)
  }
  ok(await puedoAdjuntar('88888888-8888-4888-8888-888888888899') === false, 'no se adjuntan fotos a un parte que no existe')
  ok(await falla(() => db.query('update public.parte_fotos set ruta = $1', [rutaFoto(foto2)])), 'una foto no se cambia')
  ok(await falla(() => db.query('delete from public.parte_fotos')), 'una foto no se borra')
})
for (const quien of ['admin', 'consulta', 'calor']) {
  await como(quien, async () => {
    ok(await puedoAdjuntar() === false, `${quien} no adjunta fotos a un parte que no es suyo`)
    ok(await falla(() => ponerFoto(foto2)), `${quien} no puede apuntar una foto en un parte ajeno`)
  })
}
await como('anon', async () => ok(await falla(() => puedoAdjuntar()), 'sin sesión no se puede preguntar puedo_adjuntar_foto'))

// El plazo: 7 días desde que se recibió el parte.
const parteViejo = '88888888-8888-4888-8888-888888888802'
const parteReciente = '88888888-8888-4888-8888-888888888803'
const fueraDePlazo = async p => (await filas('select public.foto_fuera_de_plazo($1) as si', [p]))[0].si
await como('guarda', async () => {
  // El móvil intenta poner su propia hora de llegada, muy lejos en el futuro.
  await db.query(`insert into public.partes (id, edificio_id, instalacion_id, fecha, tipo, descripcion, recibido_en)
    values ($1, $2, $3, $4, 'comprobacion', 'Parte que se envejece', now() + interval '1 year'),
           ($5, $2, $3, $4, 'comprobacion', 'Parte reciente', now())`, [parteViejo, edificio, extintores, hoy, parteReciente])
  ok(await cuenta(`select 1 from public.partes where id = $1 and recibido_en <= now()`, [parteViejo]) === 1,
    'recibido_en lo pone la base de datos, no el móvil')
}, { guardar: true })
// Sin sesión, como quien prepara la prueba: se cambia la hora de llegada para simular el paso del tiempo.
await db.query(`update public.partes set recibido_en = now() - interval '8 days' where id = $1`, [parteViejo])
await db.query(`update public.partes set recibido_en = now() - interval '6 days' where id = $1`, [parteReciente])
await como('guarda', async () => {
  ok(await puedoAdjuntar(parteViejo) === false, 'a un parte recibido hace 8 días no se le añaden fotos')
  ok(await falla(() => ponerFoto('88888888-8888-4888-8888-888888888831', undefined, parteViejo)),
    'y la tabla tampoco deja apuntar la foto')
  ok(await fueraDePlazo(parteViejo) === true, 'quien lo escribió sabe que es por el plazo')
  ok(await fueraDePlazo(parteReciente) === false, 'un parte en plazo no está fuera de plazo')
  ok(await puedoAdjuntar(parteReciente) === true, 'a uno recibido hace 6 días, sí')
  ok(!(await falla(() => ponerFoto('88888888-8888-4888-8888-888888888832', undefined, parteReciente))),
    'y la foto queda apuntada')
})
for (const quien of ['admin', 'consulta', 'calor']) {
  await como(quien, async () => ok(await fueraDePlazo(parteViejo) === false, `a ${quien} no se le dice nada del plazo de un parte ajeno`))
}
await como('anon', async () => ok(await falla(() => fueraDePlazo(parteViejo)), 'sin sesión no se puede preguntar foto_fuera_de_plazo'))
await como('admin', async () => {
  // La administración tampoco puede alargar el plazo: no tiene permiso para cambiar partes.
  ok(await falla(() => db.query(`update public.partes set recibido_en = now() where id = $1`, [parteViejo])),
    'nadie con sesión cambia la hora de llegada de un parte')
})
await como('admin', async () => ok(await cuenta('select 1 from public.parte_fotos where id = $1', [foto1]) === 1, 'la administración ve la foto'))
await como('calor', async () => ok(await cuenta('select 1 from public.parte_fotos where id = $1', [foto1]) === 0, 'una empresa no ve la foto de una instalación ajena'))

console.log(`\n${total - fallos} de ${total} comprobaciones correctas`)
if (fallos) console.log(`\nHan fallado:\n${fallidas.map(t => `- ${t}`).join('\n')}`)
await db.close()
process.exit(fallos ? 1 : 0)
