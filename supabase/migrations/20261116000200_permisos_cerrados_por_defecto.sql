-- Lo que se cree a partir de ahora nace cerrado para quien no ha iniciado sesión (idea de Txin en el #52).
--
-- Supabase da permiso a anon sobre cada tabla, vista, secuencia y función nueva del esquema public.
-- La primera migración se lo quitó a lo que había entonces, pero no a lo que venga después.
-- Con esto, una tabla nueva ya no queda abierta por olvidar su `revoke`.
-- La comprobación general de comprobar.mjs se queda como red de seguridad.
--
-- Solo afecta a lo que cree el rol postgres, que es quien aplica las migraciones.
-- No cambia nada de lo que ya existe.

alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on routines from anon;

-- PostgreSQL, además, deja ejecutar cada función nueva a todo el mundo (public), y anon es parte de
-- todo el mundo. Ese permiso viene de serie para todos los esquemas, y lo que se ajusta para un solo
-- esquema solo puede añadir permisos a lo de serie, no quitarlos. Por eso aquí no lleva `in schema`.
-- Cada función que deba usar la aplicación necesita su `grant execute ... to authenticated`,
-- como ya hacen las migraciones anteriores.
alter default privileges for role postgres revoke execute on routines from public;
