-- Fotos de los partes (tarea 1.6, issue #16).
--
-- La función de archivos guarda cada foto en fotos/AAAA/<id>.jpg y la apunta en parte_fotos.
-- Hacen falta tres cosas:
--
-- 1. Que una foto solo pueda apuntar a su propio archivo, igual que los documentos (#51).
--    Si no, quien escribe un parte podría apuntar una «foto» al índice o a un documento ajeno,
--    y la función se lo entregaría al pedir la foto.
-- 2. Un plazo: las fotos se añaden hasta 7 días después de recibir el parte (decidido en el #75).
--    Los partes no se cambian, y añadir fotos meses después lo cambiaría, y también el índice exportado.
--    Cuenta desde recibido_en y no desde fecha: en el refugio no hay cobertura, el parte llega
--    cuando el móvil se conecta y las fotos van detrás.
--    Para que el plazo valga, recibido_en lo pone siempre la base de datos, no el móvil.
-- 3. Una pregunta para la función, puedo_adjuntar_foto, que hace antes de escribir en el repositorio.
--    La política de inserción de parte_fotos usa esa misma pregunta: así la regla está en un solo sitio
--    y no queda en el repositorio una foto que luego no se pueda apuntar.

alter table public.parte_fotos
  add constraint parte_fotos_ruta_de_foto
  check (ruta ~ ('^fotos/[0-9]{4}/' || id::text || '\.jpg$'));

-- Solo quien escribió el parte, y hasta 7 días después de recibirlo.
create function public.puedo_adjuntar_foto(p_parte uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.partes p
    where p.id = p_parte
      and p.edificio_id = interno.mi_edificio()
      and p.autor_id = interno.mi_id()
      and p.recibido_en > now() - interval '7 days'
  )
$$;

-- Para que la función pueda dar un mensaje claro. Solo dice «sí» a quien escribió el parte:
-- a los demás no les da pistas de qué partes existen ni cuándo llegaron.
create function public.foto_fuera_de_plazo(p_parte uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.partes p
    where p.id = p_parte
      and p.edificio_id = interno.mi_edificio()
      and p.autor_id = interno.mi_id()
      and p.recibido_en <= now() - interval '7 days'
  )
$$;

-- Desde el #63 las funciones nuevas nacen cerradas. Se dice igualmente, para que se lea aquí.
revoke all on function public.puedo_adjuntar_foto(uuid) from public, anon;
revoke all on function public.foto_fuera_de_plazo(uuid) from public, anon;
grant execute on function public.puedo_adjuntar_foto(uuid) to authenticated;
grant execute on function public.foto_fuera_de_plazo(uuid) to authenticated;

drop policy crear on public.parte_fotos;
create policy crear on public.parte_fotos for insert to authenticated
  with check (edificio_id = interno.mi_edificio() and public.puedo_adjuntar_foto(parte_id));

-- Igual que en el esquema inicial, más una línea: recibido_en es la hora de llegada,
-- la ponga o no el móvil. Los partes históricos, cargados sin usuario, guardan la suya.
create or replace function interno.completar_parte() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if interno.mi_id() is not null then
    new.edificio_id := interno.mi_edificio();
    new.autor_id    := interno.mi_id();
    new.autor_rol   := case interno.mi_perfil()
                         when 'admin' then 'administrador'
                         when 'guarda' then 'guarda'
                         else 'tecnico'
                       end;
    if interno.mi_perfil() = 'empresa' then
      new.empresa_id := interno.mi_contacto();
    end if;
    new.recibido_en := now();
  end if;
  return new;
end $$;
