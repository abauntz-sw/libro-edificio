-- Fotos de los partes (tarea 1.6, issue #16).
--
-- La función de archivos guarda cada foto en fotos/AAAA/<id>.jpg y la apunta en parte_fotos.
-- Hacen falta dos cosas:
--
-- 1. Que una foto solo pueda apuntar a su propio archivo, igual que los documentos (#51).
--    Si no, quien escribe un parte podría apuntar una «foto» al índice o a un documento ajeno,
--    y la función se lo entregaría al pedir la foto.
-- 2. Una pregunta para la función, puedo_adjuntar_foto, que hace antes de escribir en el repositorio.
--    Es la misma regla que ya pone la política de inserción de parte_fotos: solo quien escribió el parte.
--    Así no queda en el repositorio una foto que luego no se pueda apuntar.

alter table public.parte_fotos
  add constraint parte_fotos_ruta_de_foto
  check (ruta ~ ('^fotos/[0-9]{4}/' || id::text || '\.jpg$'));

create function public.puedo_adjuntar_foto(p_parte uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.partes p
    where p.id = p_parte
      and p.edificio_id = interno.mi_edificio()
      and p.autor_id = interno.mi_id()
  )
$$;

-- Desde el #63 las funciones nuevas nacen cerradas. Se dice igualmente, para que se lea aquí.
revoke all on function public.puedo_adjuntar_foto(uuid) from public, anon;
grant execute on function public.puedo_adjuntar_foto(uuid) to authenticated;
