# Base de datos

Esquema de Supabase (PostgreSQL) del Libro del Edificio.

| Archivo | Qué hace |
|---|---|
| `migrations/20261106000000_esquema_inicial.sql` | Crea las tablas, las reglas y los permisos |
| `migrations/20261106000100_datos_comunes.sql` | Carga tipos y plantillas comunes a cualquier edificio |
| `migrations/20261114000000_mas_tipos_y_revisiones.sql` | Añade accesos y salidas de emergencia, y las revisiones de gas y cocina |
| `migrations/20261114000100_corrige_fuente_gas.sql` | Corrige la fuente de la revisión de gas, que citaba una orden foral derogada |
| `migrations/20261115000000_ruta_de_documento.sql` | Obliga a que cada ficha apunte a su propio documento, en `documentos/` |
| `migrations/20261115000100_ultimo_admin_con_caducidad.sql` | No deja el edificio sin administración por una fecha de caducidad |
| `migrations/20261116000000_exportar_indice.sql` | Prepara los CSV del índice para la exportación diaria. Solo los pide la función `exportar` |
| `migrations/20261116000100_documento_repetido.sql` | Un identificador que ya existe solo se da por bueno si es el mismo archivo |
| `migrations/20261116000200_permisos_cerrados_por_defecto.sql` | Hace que las tablas y funciones nuevas nazcan cerradas para la clave pública |
| `migrations/20261118000000_fotos_de_parte.sql` | Una foto de un parte solo apunta a su propio archivo, en `fotos/`. Las fotos se añaden hasta 7 días después de recibir el parte, y `recibido_en` lo pone la base de datos. Añade `puedo_adjuntar_foto` y `foto_fuera_de_plazo`, para la función de archivos |
| `migrations/20261123000000_nombres_legibles.sql` | Las rutas de los documentos y las fotos admiten el nombre legible, con la fecha y una descripción delante del identificador. Las de antes siguen valiendo |
| `seed.sql` | Carga un albergue ficticio. Nunca se usa en producción |
| `tests/comprobar.mjs` | Comprueba el esquema y los permisos de cada perfil |
| `config.toml` | Configuración de la CLI de Supabase |
| `functions/` | Funciones que se ejecutan en Supabase. Ver su [README](functions/README.md) |

## Probarlo sin cuenta

No hace falta Docker ni Supabase. Desde la raíz del repositorio:

```bash
npm install --no-save @electric-sql/pglite
node supabase/tests/comprobar.mjs
```

## CI

En cada Pull Request, y otra vez al entrar en `main`, GitHub ejecuta [`.github/workflows/base-de-datos.yml`](../.github/workflows/base-de-datos.yml):

- **Permisos y reglas:** ejecuta `comprobar.mjs`. Si una comprobación falla, el CI sale en rojo y dice cuál.
- **Migraciones:** aplica las migraciones y `seed.sql` con la CLI de Supabase, en el mismo Postgres que usa Supabase.

`config.toml` es la configuración de la CLI, creada con `supabase init`.

## Probarlo en Supabase

1. Crea un proyecto Free en [supabase.com](https://supabase.com/dashboard). Elige una región concreta de la UE, no la opción general «Europe».
2. Abre **SQL Editor** y ejecuta todas las migraciones de `supabase/migrations/`, por orden de nombre, y después `seed.sql`.
3. Abre **Table Editor** para ver las tablas, o ejecuta:

```sql
select clase, estado, titulo, fecha from avisos order by fecha;
select instalacion, falta from huecos order by instalacion;
```

Las fechas del ejemplo cuentan desde el día de carga, así que cualquier día salen los mismos cuatro avisos: dos vencidos y dos que vencen pronto.

Para repetir la carga, crea un proyecto nuevo o restablece el actual. `seed.sql` no se puede ejecutar dos veces.

## Poner al día un proyecto con la CLI

Así se aplican las migraciones nuevas de `main` a un proyecto que ya existe, como `libro-dev`, sin vaciarlo. Se usa la versión 3 de la CLI de Supabase. Desde la raíz del repositorio, con `main` al día:

```bash
npx -y supabase@3.1.0 login
npx -y supabase@3.1.0 link <referencia-del-proyecto>
npx -y supabase@3.1.0 db push --remote --dry-run
npx -y supabase@3.1.0 db push --remote
```

`--dry-run` solo enseña qué migraciones aplicaría, sin tocar nada. Míralo antes de aplicar.

**Ojo con `--remote`.** Desde la versión 3, las órdenes `db` trabajan por defecto con la base de datos del ordenador. Sin `--remote`, `db push` no toca el proyecto de Supabase. Con `--remote` va al proyecto enlazado con `link`. Las órdenes `functions` y `secrets` van siempre al proyecto.

**Cuándo hace falta `--include-all`.** `db push` se niega a aplicar una migración con fecha anterior a la última que ya tiene el proyecto. Pasa cuando dos ramas crean migraciones a la vez y entran en `main` en otro orden. Por ejemplo: `20261116000000_exportar_indice.sql` entró en `main` después de `20261116000100` y `20261116000200`, y `libro-dev` ya tenía esas dos. Con `--include-all` la aplica igualmente:

```bash
npx -y supabase@3.1.0 db push --remote --include-all --dry-run
npx -y supabase@3.1.0 db push --remote --include-all
```

Esa migración se aplica después de otras más nuevas. Antes de usarlo, comprueba que no dependa de que esas otras no estén.

Para ver qué tiene apuntado el proyecto: `npx -y supabase@3.1.0 migration list --remote`.

## Reglas

- **Clave de servicio:** salta todos los permisos. Va solo en los secretos de las funciones de Supabase, nunca en el navegador, el móvil ni el ordenador de la oficina.
- **Clave pública:** puede estar en la aplicación. Sin un usuario activo no da acceso a nada.
- **Cambios de tablas:** cada cambio es una migración nueva. No edites una que ya esté aplicada.
- **Permisos:** todo cambio de permisos lleva su comprobación en `tests/comprobar.mjs`.
- **Documentos:** se crean con `registrar_documento`, no con un `insert` directo. Su ruta es `documentos/AAAA/<fecha>_<tipo>_<descripción>_<id>.<extensión>`, o la de antes, `documentos/AAAA/<id>.<extensión>`. Siempre acaba en su propio identificador: una ficha no puede apuntar a otro archivo del repositorio.
- **Tablas y funciones nuevas:** nacen cerradas para la clave pública, y las funciones no las puede ejecutar nadie más que su dueño. Cada migración que cree una debe dar solo los permisos necesarios, por ejemplo `grant execute ... to authenticated`. Las tablas nuevas de `public` siguen abiertas por defecto para `authenticated`: la seguridad por filas manda. `comprobar.mjs` avisa si algo queda abierto a la clave pública.
- **Partes:** no se cambian ni se borran. Una corrección es un parte nuevo.
