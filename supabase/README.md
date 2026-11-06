# Base de datos

Esquema de Supabase (PostgreSQL) del Libro del Edificio.

| Archivo | Qué hace |
|---|---|
| `migrations/20261106000000_esquema_inicial.sql` | Crea las tablas, las reglas y los permisos |
| `migrations/20261106000100_datos_comunes.sql` | Carga tipos y plantillas comunes a cualquier edificio |
| `seed.sql` | Carga un albergue ficticio. Nunca se usa en producción |
| `tests/comprobar.mjs` | Comprueba el esquema y los permisos de cada perfil |

## Probarlo sin cuenta

No hace falta Docker ni Supabase. Desde la raíz del repositorio:

```bash
npm install --no-save @electric-sql/pglite
node supabase/tests/comprobar.mjs
```

## Probarlo en Supabase

1. Crea un proyecto Free en [supabase.com](https://supabase.com/dashboard). Elige una región concreta de la UE, no la opción general «Europe».
2. Abre **SQL Editor** y ejecuta, en este orden, las dos migraciones y `seed.sql`.
3. Abre **Table Editor** para ver las tablas, o ejecuta:

```sql
select clase, estado, titulo, fecha from avisos order by fecha;
select instalacion, falta from huecos order by instalacion;
```

Para repetir la carga, crea un proyecto nuevo o restablece el actual. `seed.sql` no se puede ejecutar dos veces.

## Reglas

- **Clave de servicio:** salta todos los permisos. Va solo en los secretos de las funciones de Supabase, nunca en el navegador, el móvil ni el ordenador de la oficina.
- **Clave pública:** puede estar en la aplicación. Sin un usuario activo no da acceso a nada.
- **Cambios de tablas:** cada cambio es una migración nueva. No edites una que ya esté aplicada.
- **Permisos:** todo cambio de permisos lleva su comprobación en `tests/comprobar.mjs`.
- **Documentos:** se crean con `registrar_documento`, no con un `insert` directo.
- **Partes:** no se cambian ni se borran. Una corrección es un parte nuevo.
