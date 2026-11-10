# Libro del Edificio

Instrucciones para Claude Code. Las lee al empezar cada sesión en este repositorio.

## Qué es

Aplicación para llevar el Libro del Edificio: documentos, instalaciones, revisiones obligatorias y partes de trabajo. El piloto es el Refugio de Belagua.

- Planes: `docs/PLAN-BELAGUA.md`, que manda sobre `docs/PLAN.md` donde difieran.
- Forma de trabajar: `docs/GUIA-INICIO.md`.
- Pantallas y comportamiento: el [prototipo](https://claude.ai/artifact/LwqrqTDTS3DDUBRMBEQQBT).
- Tareas: los issues de GitHub, en el orden de los milestones. El siguiente lleva la etiqueta `siguiente`.

## Cómo trabajar

- Escribe en español: código, comentarios, commits, PR e issues. Frases cortas y claras.
- Trabaja siempre en una rama y entra en `main` por Pull Request con `Closes #N`. `main` está protegida.
- Commits pequeños, con mensajes que digan qué cambia.
- Explica cada cambio para que la persona que trabaja contigo lo entienda antes de hacer commit. El proyecto también sirve para aprender.
- No cambies lo que no pide el issue. Si ves algo más, propónlo como comentario o issue nuevo.

## Base de datos (Supabase, PostgreSQL)

- Cada cambio de tablas va en una migración nueva en `supabase/migrations/`. No edites una que ya esté en `main`.
- Todo cambio de permisos (RLS) lleva su comprobación en `supabase/tests/comprobar.mjs`.
- Antes de abrir un PR que toque `supabase/`, ejecuta las comprobaciones y deben salir todas bien:

  ```bash
  npm install --no-save @electric-sql/pglite
  node supabase/tests/comprobar.mjs
  ```

- Los documentos se crean con `registrar_documento`, no con un `insert` directo.
- Los partes no se cambian ni se borran. Una corrección es un parte nuevo.
- Una periodicidad normativa sin fuente revisada va con `verificado = false`.

## Datos y claves

- Este repositorio es público. Nunca pongas datos reales del refugio (nombres, teléfonos, documentos, fotos) en código, tests, commits, issues ni en un proyecto Supabase de desarrollo. Usa siempre datos ficticios.
- Nunca pongas claves ni contraseñas en el código. La clave de servicio de Supabase solo va en los secretos de las funciones.
- El nombre del repositorio del edificio va en la configuración, no en el código.
