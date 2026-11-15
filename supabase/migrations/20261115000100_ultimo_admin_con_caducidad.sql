-- El edificio no se queda sin administración por una fecha de caducidad (issue #51).
--
-- Antes, la regla miraba el perfil y si la cuenta estaba activa, pero no acceso_caduca.
-- Si a la única persona administradora se le ponía una caducidad ya pasada, nadie podía
-- administrar el edificio. Y una administradora con el acceso caducado contaba como «otra».
--
-- Lo que no se puede impedir es que una caducidad futura llegue sola con el paso del tiempo.

create or replace function interno.proteger_ultimo_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  era_admin boolean := old.perfil = 'admin' and old.activo
    and (old.acceso_caduca is null or old.acceso_caduca >= current_date);
  sigue_siendo_admin boolean := tg_op = 'UPDATE' and new.perfil = 'admin' and new.activo
    and (new.acceso_caduca is null or new.acceso_caduca >= current_date);
begin
  if era_admin and not sigue_siendo_admin then
    perform 1 from public.edificios where id = old.edificio_id for update;
    if not exists (
      select 1 from public.usuarios u
      where u.edificio_id = old.edificio_id and u.perfil = 'admin' and u.activo
        and (u.acceso_caduca is null or u.acceso_caduca >= current_date)
        and u.id <> old.id
    ) then
      raise exception 'El edificio debe conservar al menos una persona administradora activa';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
