-- Un parte no puede tener fecha futura (issue #94).
--
-- La fecha del parte la pone el móvil. Si su reloj está mal, por ejemplo en 2036, la revisión que cierra
-- pasa a tener su última fecha en 2036. Desde entonces ningún parte la mueve, porque actualizar_revision
-- solo la cambia con una fecha posterior a la última, y su próxima fecha queda tan lejos que nunca avisa.
--
-- Se admite hasta mañana: la base de datos trabaja en hora universal, y en España ya es mañana
-- desde las 23:00 o las 22:00. Los partes antiguos (#81) tienen fechas pasadas: no les afecta.
--
-- Va en un disparador y no en un check para que el motivo se entienda: la aplicación lo enseña tal cual.

create function interno.comprobar_fecha_parte() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.fecha > current_date + 1 then
    raise exception 'La fecha del parte (%) es posterior a hoy. Revisa la fecha del móvil y vuelve a registrarlo.', new.fecha
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger comprobar_fecha_parte before insert on public.partes
for each row execute function interno.comprobar_fecha_parte();
