-- Nombres legibles para los archivos del repositorio del edificio (issue #77).
--
-- Antes, un archivo se llamaba solo con su identificador: documentos/2026/<id>.pdf.
-- Ahora lleva delante la fecha, el tipo y una descripción corta, para que se entienda sin la aplicación:
--
--   documentos/AAAA/<fecha>_<tipo>_<descripción>_<id>.<extensión>   (la descripción puede faltar)
--   fotos/AAAA/<fecha>_<instalación>_<id>.jpg                       (la instalación puede faltar, para el #82)
--
-- El nombre lo monta supabase/functions/_compartido/nombres.ts. Aquí solo se comprueba su forma.
-- Lo importante no cambia: la ruta tiene que acabar en el identificador de esa misma fila,
-- y lo de delante solo puede llevar a-z, 0-9, guiones y los «_» que separan las partes.
-- Así no hay «/» ni «..», y una ficha o una foto sigue sin poder apuntar a otro archivo (#51 y #75).
--
-- Las rutas de antes, solo con el identificador, siguen valiendo: no se renombra nada.

alter table public.documentos
  drop constraint documentos_ruta_de_documento,
  add constraint documentos_ruta_de_documento
  check (ruta ~ ('^documentos/[0-9]{4}/([0-9]{4}-[0-9]{2}-[0-9]{2}_[a-z0-9-]+_([a-z0-9-]+_)?)?' || id::text || '\.[a-z0-9]+$'));

alter table public.parte_fotos
  drop constraint parte_fotos_ruta_de_foto,
  add constraint parte_fotos_ruta_de_foto
  check (ruta ~ ('^fotos/[0-9]{4}/([0-9]{4}-[0-9]{2}-[0-9]{2}_([a-z0-9-]+_)?)?' || id::text || '\.jpg$'));
