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

function ok(cond, texto) {
  total++
  if (!cond) fallos++
  console.log(`${cond ? 'ok   ' : 'FALLO'} ${texto}`)
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

console.log('\nSin sesión')
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
  ok(await falla(() => archivar('99999999-9999-4999-8999-999999999992', [extintores])), 'empresa no archiva en otra instalación')
})
await como('calor', async () => ok(await falla(() => archivar('99999999-9999-4999-8999-999999999993', [])), 'empresa no archiva sin instalación'))
await como('calor', async () => ok(await falla(() => archivar('99999999-9999-4999-8999-999999999995', null)), 'empresa no archiva con la lista vacía'))
await como('guarda', async () => ok(await falla(() => archivar('99999999-9999-4999-8999-999999999994', [extintores])), 'guarda no archiva'))
await como('guarda', async () => ok(await falla(() => db.query(`insert into public.documentos (edificio_id,tipo_id,titulo,fecha,ruta,nombre_original,sha256) values ('${edificio}','otro','x','2026-01-01','r','n',repeat('a',64))`)), 'nadie inserta documentos directamente'))
const doc = await id('documentos', 'titulo', 'Revisión anual de extintores 2026')
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
    'documento pronto: Póliza de seguro 2026',
    'revision vencido: Mantenimiento de generadores y equipos',
    'revision pronto: Revisión de extintores y equipos por el titular',
  ]
  for (const e of esperados) ok(av.includes(e), `aviso ${e}`)
  ok(av.length === esperados.length, `no hay más avisos que esos (${av.length})`)
  const hu = await filas('select instalacion, falta from public.huecos')
  ok(hu.length > 0, `documentos que faltan: ${hu.length}`)
})

console.log(`\n${total - fallos} de ${total} comprobaciones correctas`)
await db.close()
process.exit(fallos ? 1 : 0)
