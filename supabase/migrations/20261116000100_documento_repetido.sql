-- Un identificador que ya existe solo vale si es el mismo archivo (idea de la revisión del #52).
--
-- registrar_documento no duplica nada si se repite con el mismo identificador. Así un reintento
-- con mala cobertura, o una carga cortada a medias, se puede repetir sin miedo.
--
-- Pero antes respondía bien sin mirar nada más. Alguien podía crear primero una ficha con el
-- identificador que luego calcularía «importar», y «importar» daría su carga por buena con los
-- datos de esa otra ficha. Ahora, si el identificador ya existe, la huella tiene que coincidir.
-- Si no coincide, es otro archivo, y la función se para con un error.
--
-- Solo cambia el caso del identificador repetido. Lo demás es igual que en el esquema inicial.

create or replace function public.registrar_documento(
  p_id uuid, p_tipo text, p_titulo text, p_fecha date, p_emisor text, p_ruta text,
  p_nombre_original text, p_sha256 text, p_instalaciones uuid[],
  p_caduca date default null, p_tamano_bytes bigint default null, p_commit_sha text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  edificio uuid := interno.mi_edificio();
  insertados integer;
  huella_previa text;
begin
  if edificio is null or not public.puedo_archivar(p_instalaciones) then
    raise exception 'No tienes permiso para archivar este documento' using errcode = '42501';
  end if;

  insert into public.documentos (
    id, edificio_id, tipo_id, titulo, fecha, emisor, caduca, ruta,
    nombre_original, sha256, tamano_bytes, commit_sha, subido_por
  ) values (
    p_id, edificio, p_tipo, p_titulo, p_fecha, coalesce(p_emisor, ''), p_caduca, p_ruta,
    p_nombre_original, p_sha256, p_tamano_bytes, p_commit_sha, interno.mi_id()
  ) on conflict (id) do nothing;

  get diagnostics insertados = row_count;
  if insertados = 0 then
    select d.sha256 into huella_previa
    from public.documentos d where d.id = p_id and d.edificio_id = edificio;
    if not found then
      raise exception 'Identificador de documento no válido' using errcode = '42501';
    end if;
    -- El mismo identificador con otro archivo no es un reintento: es otro documento.
    if huella_previa is distinct from p_sha256 then
      raise exception 'Ya hay otro documento con ese identificador' using errcode = '23505';
    end if;
    return p_id;
  end if;

  insert into public.documento_instalaciones (edificio_id, documento_id, instalacion_id)
  select edificio, p_id, x.id from unnest(p_instalaciones) as x(id);

  return p_id;
end $$;
