-- Libro del Edificio: esquema inicial para Supabase (PostgreSQL 15 o superior).
--
-- Guarda las fichas: edificios, instalaciones, documentos, revisiones, partes y usuarios.
-- Los archivos están en el repositorio privado de cada edificio; aquí solo se guarda su ruta.
-- Cada tabla lleva seguridad por filas: la clave pública de Supabase no da acceso a nada
-- sin un usuario activo del edificio.

create schema if not exists interno;

-- ---------------------------------------------------------------------------
-- Datos comunes a cualquier edificio
-- ---------------------------------------------------------------------------

create table public.tipos_instalacion (
  id     text primary key,
  nombre text not null unique
);

-- Los tipos de serie tienen edificio_id nulo. Cada edificio puede añadir los suyos.
create table public.edificios (
  id                   uuid primary key default gen_random_uuid(),
  nombre               text not null,
  tipo                 text not null check (tipo in ('residencial', 'alojamiento-colectivo', 'equipamiento', 'otro')),
  via                  text,
  municipio            text not null,
  provincia            text not null,
  codigo_postal        text check (codigo_postal ~ '^[0-9]{5}$'),
  referencia_catastral text,
  ano_construccion     integer,
  ano_ultima_reforma   integer,
  capacidad_personas   integer check (capacidad_personas >= 0),
  propiedad            text,
  gestion              text,
  temporada_apertura   text,
  temporada_cierre     text,
  repositorio          text not null unique,   -- p. ej. organizacion/repo; no es un secreto
  notas                text,
  creado_en            timestamptz not null default now()
);

create table public.tipos_documento (
  id          text primary key default gen_random_uuid()::text,
  edificio_id uuid references public.edificios (id) on delete cascade,
  nombre      text not null,
  unique nulls not distinct (edificio_id, nombre)
);

create table public.plantilla_revisiones (
  id                 uuid primary key default gen_random_uuid(),
  tipo_instalacion_id text not null references public.tipos_instalacion (id),
  descripcion        text not null,
  periodicidad_meses integer check (periodicidad_meses > 0),
  responsable        text not null check (responsable in ('titular', 'guarda', 'empresa-mantenedora', 'organismo-de-control')),
  fuente             text not null default 'pendiente',
  verificado         boolean not null default false,
  unique (tipo_instalacion_id, descripcion)
);

create table public.plantilla_documentos (
  tipo_instalacion_id text not null references public.tipos_instalacion (id),
  tipo_documento_id   text not null references public.tipos_documento (id),
  primary key (tipo_instalacion_id, tipo_documento_id)
);

-- ---------------------------------------------------------------------------
-- Datos de cada edificio
-- ---------------------------------------------------------------------------
-- Las claves compuestas con edificio_id impiden enlazar datos de dos edificios.

create table public.contactos (
  id          uuid primary key default gen_random_uuid(),
  edificio_id uuid not null references public.edificios (id) on delete restrict,
  tipo        text not null check (tipo in ('empresa', 'persona')),
  nombre      text not null,
  rol         text not null check (rol in ('mantenedora', 'guarda', 'administrador', 'redactor', 'otro')),
  telefono    text,
  email       text,
  unique (edificio_id, id)
);

create table public.usuarios (
  id            uuid primary key default gen_random_uuid(),
  edificio_id   uuid not null references public.edificios (id) on delete restrict,
  auth_id       uuid unique references auth.users (id) on delete set null,
  nombre        text not null,
  email         text,
  perfil        text not null check (perfil in ('admin', 'consulta', 'guarda', 'empresa')),
  contacto_id   uuid,
  acceso_caduca date,
  activo        boolean not null default true,
  ultimo_acceso timestamptz,
  unique (edificio_id, id),
  foreign key (edificio_id, contacto_id) references public.contactos (edificio_id, id) on delete restrict,
  check (perfil not in ('guarda', 'empresa') or contacto_id is not null)
);
create unique index usuarios_email_unico on public.usuarios (edificio_id, lower(email));

-- Solo la función de acceso, con la clave de servicio, usa esta tabla.
create table public.codigos_acceso (
  usuario_id      uuid primary key references public.usuarios (id) on delete cascade,
  hash            text not null,
  intentos        integer not null default 0,
  bloqueado_hasta timestamptz
);

create table public.instalaciones (
  id              uuid primary key default gen_random_uuid(),
  edificio_id     uuid not null references public.edificios (id) on delete restrict,
  nombre          text not null,
  tipo_id         text not null references public.tipos_instalacion (id),
  estado          text not null default 'por-confirmar'
                  check (estado in ('por-confirmar', 'activa', 'fuera-de-servicio', 'no-aplica')),
  ubicacion       text,
  marca           text,
  modelo          text,
  numero_serie    text,
  ano_instalacion integer,
  empresa_id      uuid,
  notas           text,
  unique (edificio_id, id),
  unique (edificio_id, nombre),
  foreign key (edificio_id, empresa_id) references public.contactos (edificio_id, id) on delete restrict
);
create index instalaciones_empresa on public.instalaciones (empresa_id);

create table public.documentos (
  id              uuid primary key default gen_random_uuid(),
  edificio_id     uuid not null references public.edificios (id) on delete restrict,
  tipo_id         text not null references public.tipos_documento (id),
  titulo          text not null,
  fecha           date not null,
  emisor          text not null default '',
  caduca          date,
  ruta            text not null,   -- ruta dentro del repositorio del edificio
  nombre_original text not null,
  sha256          text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  tamano_bytes    bigint check (tamano_bytes >= 0),
  commit_sha      text,
  subido_por      uuid,
  subido_en       timestamptz not null default now(),
  eliminado_en    timestamptz,     -- con fecha, está en la papelera
  eliminado_por   uuid,
  unique (edificio_id, id),
  unique (edificio_id, ruta),
  foreign key (edificio_id, subido_por) references public.usuarios (edificio_id, id) on delete restrict,
  foreign key (edificio_id, eliminado_por) references public.usuarios (edificio_id, id) on delete restrict,
  check (caduca is null or caduca >= fecha)
);
create index documentos_huella on public.documentos (edificio_id, sha256);   -- avisa de duplicados
create index documentos_caducidad on public.documentos (edificio_id, caduca) where eliminado_en is null;

create table public.documento_instalaciones (
  edificio_id    uuid not null,
  documento_id   uuid not null,
  instalacion_id uuid not null,
  primary key (documento_id, instalacion_id),
  foreign key (edificio_id, documento_id) references public.documentos (edificio_id, id) on delete cascade,
  foreign key (edificio_id, instalacion_id) references public.instalaciones (edificio_id, id) on delete restrict
);
create index documento_instalaciones_inst on public.documento_instalaciones (instalacion_id);

create table public.revisiones (
  id                 uuid primary key default gen_random_uuid(),
  edificio_id        uuid not null,
  instalacion_id     uuid not null,
  descripcion        text not null,
  periodicidad_meses integer check (periodicidad_meses > 0),   -- nulo: por definir
  responsable_id     uuid,
  ultima             date,
  proxima            date,
  fuente             text not null default 'pendiente',
  verificado         boolean not null default false,
  unique (edificio_id, instalacion_id, id),
  foreign key (edificio_id, instalacion_id) references public.instalaciones (edificio_id, id) on delete cascade,
  foreign key (edificio_id, responsable_id) references public.contactos (edificio_id, id) on delete restrict
);
create index revisiones_proxima on public.revisiones (edificio_id, proxima);

-- Los partes solo se añaden. El identificador lo crea el móvil, así reenviar un parte
-- tras perder la cobertura no lo duplica.
create table public.partes (
  id               uuid primary key default gen_random_uuid(),
  edificio_id      uuid not null,
  instalacion_id   uuid not null,
  fecha            date not null,
  tipo             text not null check (tipo in ('preventivo', 'correctivo', 'inspeccion', 'urgencia', 'comprobacion', 'incidencia')),
  autor_rol        text not null check (autor_rol in ('administrador', 'guarda', 'tecnico')),
  autor_id         uuid,            -- nulo en partes históricos cargados sin usuario
  empresa_id       uuid,
  tecnico          text,            -- nombre de quien lo hace; las empresas comparten código
  descripcion      text not null check (btrim(descripcion) <> ''),
  horas            numeric(6, 2) check (horas >= 0),
  materiales       text[] not null default '{}',
  revision_id      uuid,
  proxima_revision date,            -- solo para revisiones sin periodicidad
  certificado_id   uuid,
  firma_ruta       text,
  recibido_en      timestamptz not null default now(),
  unique (edificio_id, id),
  foreign key (edificio_id, instalacion_id) references public.instalaciones (edificio_id, id) on delete restrict,
  foreign key (edificio_id, autor_id) references public.usuarios (edificio_id, id) on delete restrict,
  foreign key (edificio_id, empresa_id) references public.contactos (edificio_id, id) on delete restrict,
  foreign key (edificio_id, instalacion_id, revision_id)
    references public.revisiones (edificio_id, instalacion_id, id) on delete set null (revision_id),
  foreign key (edificio_id, certificado_id) references public.documentos (edificio_id, id) on delete restrict
);
create index partes_instalacion on public.partes (instalacion_id, fecha desc);
create index partes_edificio on public.partes (edificio_id, fecha desc);

create table public.parte_fotos (
  id          uuid primary key default gen_random_uuid(),
  edificio_id uuid not null,
  parte_id    uuid not null,
  ruta        text not null,
  sha256      text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  unique (edificio_id, ruta),
  foreign key (edificio_id, parte_id) references public.partes (edificio_id, id) on delete restrict
);
create index parte_fotos_parte on public.parte_fotos (parte_id);

-- Quién cambió qué. Guarda los nombres de los campos, no sus valores.
create table public.actividad (
  id          bigint generated always as identity primary key,
  edificio_id uuid,
  tabla       text not null,
  fila_id     text not null,
  accion      text not null,
  campos      text[] not null default '{}',
  usuario_id  uuid,   -- nulo: tarea automática o carga inicial
  cuando      timestamptz not null default now()
);
create index actividad_edificio on public.actividad (edificio_id, cuando desc);

-- ---------------------------------------------------------------------------
-- Quién es el usuario conectado
-- ---------------------------------------------------------------------------
-- Un usuario desactivado o caducado deja de tener acceso aunque conserve la sesión.

create function interno.mi_usuario() returns public.usuarios
language sql stable security definer set search_path = '' as $$
  select u from public.usuarios u
  where u.auth_id = auth.uid()
    and u.activo
    and (u.acceso_caduca is null or u.acceso_caduca >= current_date)
$$;

create function interno.mi_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select (interno.mi_usuario()).id
$$;

create function interno.mi_edificio() returns uuid
language sql stable security definer set search_path = '' as $$
  select (interno.mi_usuario()).edificio_id
$$;

create function interno.mi_perfil() returns text
language sql stable security definer set search_path = '' as $$
  select (interno.mi_usuario()).perfil
$$;

create function interno.mi_contacto() returns uuid
language sql stable security definer set search_path = '' as $$
  select (interno.mi_usuario()).contacto_id
$$;

create function interno.soy_admin(p_edificio uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(interno.mi_edificio() = p_edificio and interno.mi_perfil() = 'admin', false)
$$;

-- Administración, consulta y guarda ven todo el edificio. Una empresa, solo lo suyo.
create function interno.veo_instalacion(p_instalacion uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.instalaciones i
    where i.id = p_instalacion
      and i.edificio_id = interno.mi_edificio()
      and (interno.mi_perfil() in ('admin', 'consulta', 'guarda') or i.empresa_id = interno.mi_contacto())
  )
$$;

create function interno.veo_documento(p_documento uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.documentos d
    where d.id = p_documento
      and d.edificio_id = interno.mi_edificio()
      and (
        interno.mi_perfil() = 'admin'
        or (d.eliminado_en is null and (
          interno.mi_perfil() in ('consulta', 'guarda')
          or exists (
            select 1 from public.documento_instalaciones di
            join public.instalaciones i on i.id = di.instalacion_id
            where di.documento_id = d.id and i.empresa_id = interno.mi_contacto()
          )
        ))
      )
  )
$$;

create function interno.veo_parte(p_parte uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.partes p where p.id = p_parte and interno.veo_instalacion(p.instalacion_id)
  )
$$;

-- Qué puede registrar cada perfil, igual que en el prototipo.
create function interno.puedo_registrar_parte(
  p_edificio uuid, p_instalacion uuid, p_tipo text, p_revision uuid
) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_edificio = interno.mi_edificio()
    and interno.veo_instalacion(p_instalacion)
    and case interno.mi_perfil()
      when 'admin' then true
      when 'guarda' then p_tipo in ('comprobacion', 'incidencia')
      when 'empresa' then p_tipo in ('preventivo', 'correctivo', 'inspeccion', 'urgencia')
      else false
    end
    and (
      p_revision is null
      or interno.mi_perfil() = 'admin'
      or exists (
        select 1 from public.revisiones r
        where r.id = p_revision and r.responsable_id = interno.mi_contacto()
      )
    )
$$;

-- ---------------------------------------------------------------------------
-- Reglas que no dependen de quién se conecta
-- ---------------------------------------------------------------------------

create function interno.completar_parte() returns trigger
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
  end if;
  return new;
end $$;

create trigger completar_parte before insert on public.partes
for each row execute function interno.completar_parte();

-- Un parte atrasado que llega sin cobertura no hace retroceder la revisión.
create function interno.actualizar_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.revision_id is not null then
    update public.revisiones r
    set ultima  = new.fecha,
        proxima = case
                    when r.periodicidad_meses is not null
                      then (new.fecha + make_interval(months => r.periodicidad_meses))::date
                    else coalesce(new.proxima_revision, r.proxima)
                  end
    where r.id = new.revision_id
      and (r.ultima is null or new.fecha >= r.ultima);
  end if;
  return null;
end $$;

create trigger actualizar_revision after insert on public.partes
for each row execute function interno.actualizar_revision();

create function interno.proteger_ultimo_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  sigue_siendo_admin boolean := tg_op = 'UPDATE' and new.perfil = 'admin' and new.activo;
begin
  if old.perfil = 'admin' and old.activo and not sigue_siendo_admin then
    perform 1 from public.edificios where id = old.edificio_id for update;
    if not exists (
      select 1 from public.usuarios u
      where u.edificio_id = old.edificio_id and u.perfil = 'admin' and u.activo and u.id <> old.id
    ) then
      raise exception 'El edificio debe conservar al menos una persona administradora activa';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger proteger_ultimo_admin before update or delete on public.usuarios
for each row execute function interno.proteger_ultimo_admin();

create function interno.comprobar_tipo_documento() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.tipos_documento t
    where t.id = new.tipo_id and (t.edificio_id is null or t.edificio_id = new.edificio_id)
  ) then
    raise exception 'El tipo de documento no pertenece a este edificio';
  end if;
  return new;
end $$;

create trigger comprobar_tipo_documento before insert or update of tipo_id on public.documentos
for each row execute function interno.comprobar_tipo_documento();

create function interno.anotar_actividad() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  fila   jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  campos text[] := '{}';
  accion text := lower(tg_op);
begin
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(n.key order by n.key), '{}') into campos
    from jsonb_each(fila) n
    where n.value is distinct from to_jsonb(old) -> n.key;

    if campos = '{}' or campos = array['ultimo_acceso'] then
      return null;
    end if;
    if tg_table_name = 'documentos' and 'eliminado_en' = any (campos) then
      accion := case when new.eliminado_en is null then 'recuperar' else 'papelera' end;
    end if;
  end if;

  insert into public.actividad (edificio_id, tabla, fila_id, accion, campos, usuario_id)
  values (
    case when tg_table_name = 'edificios' then (fila ->> 'id')::uuid else (fila ->> 'edificio_id')::uuid end,
    tg_table_name, fila ->> 'id', accion, campos, interno.mi_id()
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'edificios', 'tipos_documento', 'contactos', 'usuarios', 'instalaciones',
    'documentos', 'revisiones', 'partes', 'parte_fotos'
  ] loop
    execute format(
      'create trigger anotar_actividad after insert or update or delete on public.%I
       for each row execute function interno.anotar_actividad()', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Operaciones para la aplicación
-- ---------------------------------------------------------------------------

create function public.anotar_acceso() returns void
language sql security definer set search_path = '' as $$
  update public.usuarios set ultimo_acceso = now() where id = interno.mi_id()
$$;

-- La función de subida la consulta antes de escribir en el repositorio.
create function public.puedo_archivar(p_instalaciones uuid[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(case interno.mi_perfil()
    when 'admin' then true
    when 'empresa' then
      cardinality(p_instalaciones) > 0
      and not exists (
        select 1 from unnest(p_instalaciones) as x(id)
        where not interno.veo_instalacion(x.id)
      )
    else false
  end, false)
$$;

-- Crea la ficha y sus enlaces en una sola operación. Si se repite con el mismo
-- identificador, no duplica nada.
create function public.registrar_documento(
  p_id uuid, p_tipo text, p_titulo text, p_fecha date, p_emisor text, p_ruta text,
  p_nombre_original text, p_sha256 text, p_instalaciones uuid[],
  p_caduca date default null, p_tamano_bytes bigint default null, p_commit_sha text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  edificio uuid := interno.mi_edificio();
  insertados integer;
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
    if not exists (select 1 from public.documentos d where d.id = p_id and d.edificio_id = edificio) then
      raise exception 'Identificador de documento no válido' using errcode = '42501';
    end if;
    return p_id;
  end if;

  insert into public.documento_instalaciones (edificio_id, documento_id, instalacion_id)
  select edificio, p_id, x.id from unnest(p_instalaciones) as x(id);

  return p_id;
end $$;

-- ---------------------------------------------------------------------------
-- Consultas ya preparadas
-- ---------------------------------------------------------------------------
-- security_invoker hace que cada persona vea solo lo que permiten sus reglas.

create view public.avisos with (security_invoker = true) as
  select d.edificio_id, 'documento' as clase, d.id as referencia_id, d.titulo as titulo, d.caduca as fecha,
         case when d.caduca < current_date then 'vencido' else 'pronto' end as estado
  from public.documentos d
  where d.eliminado_en is null and d.caduca < current_date + 90
  union all
  select r.edificio_id, 'revision', r.id, r.descripcion, r.proxima,
         case when r.proxima < current_date then 'vencido' else 'pronto' end
  from public.revisiones r
  join public.instalaciones i on i.id = r.instalacion_id
  where i.estado <> 'no-aplica' and r.proxima < current_date + 90;

create view public.huecos with (security_invoker = true) as
  select i.edificio_id, i.id as instalacion_id, i.nombre as instalacion,
         t.id as tipo_documento_id, t.nombre as falta
  from public.instalaciones i
  join public.plantilla_documentos pd on pd.tipo_instalacion_id = i.tipo_id
  join public.tipos_documento t on t.id = pd.tipo_documento_id
  where i.estado in ('activa', 'por-confirmar')
    and not exists (
      select 1
      from public.documento_instalaciones di
      join public.documentos d on d.id = di.documento_id
      where di.instalacion_id = i.id and d.tipo_id = t.id and d.eliminado_en is null
    );

-- ---------------------------------------------------------------------------
-- Seguridad por filas
-- ---------------------------------------------------------------------------

alter table public.tipos_instalacion       enable row level security;
alter table public.edificios               enable row level security;
alter table public.tipos_documento         enable row level security;
alter table public.plantilla_revisiones    enable row level security;
alter table public.plantilla_documentos    enable row level security;
alter table public.contactos               enable row level security;
alter table public.usuarios                enable row level security;
alter table public.codigos_acceso          enable row level security;
alter table public.instalaciones           enable row level security;
alter table public.documentos              enable row level security;
alter table public.documento_instalaciones enable row level security;
alter table public.revisiones              enable row level security;
alter table public.partes                  enable row level security;
alter table public.parte_fotos             enable row level security;
alter table public.actividad               enable row level security;

-- Datos comunes
create policy leer on public.tipos_instalacion for select to authenticated
  using (interno.mi_id() is not null);
create policy leer on public.plantilla_revisiones for select to authenticated
  using (interno.mi_id() is not null);
create policy leer on public.plantilla_documentos for select to authenticated
  using (interno.mi_id() is not null);

create policy leer on public.tipos_documento for select to authenticated
  using (interno.mi_id() is not null and (edificio_id is null or edificio_id = interno.mi_edificio()));
create policy crear on public.tipos_documento for insert to authenticated
  with check (interno.soy_admin(edificio_id));
create policy cambiar on public.tipos_documento for update to authenticated
  using (interno.soy_admin(edificio_id)) with check (interno.soy_admin(edificio_id));
create policy borrar on public.tipos_documento for delete to authenticated
  using (interno.soy_admin(edificio_id));

-- Edificio
create policy leer on public.edificios for select to authenticated
  using (id = interno.mi_edificio());
create policy cambiar on public.edificios for update to authenticated
  using (interno.soy_admin(id)) with check (interno.soy_admin(id));

-- Contactos: una empresa solo se ve a sí misma.
create policy leer on public.contactos for select to authenticated
  using (
    edificio_id = interno.mi_edificio()
    and (interno.mi_perfil() in ('admin', 'consulta', 'guarda') or id = interno.mi_contacto())
  );
create policy crear on public.contactos for insert to authenticated
  with check (interno.soy_admin(edificio_id));
create policy cambiar on public.contactos for update to authenticated
  using (interno.soy_admin(edificio_id)) with check (interno.soy_admin(edificio_id));
create policy borrar on public.contactos for delete to authenticated
  using (interno.soy_admin(edificio_id));

-- Usuarios: cada persona ve su ficha y la administración gestiona todas.
create policy leer on public.usuarios for select to authenticated
  using (id = interno.mi_id() or interno.soy_admin(edificio_id));
create policy crear on public.usuarios for insert to authenticated
  with check (interno.soy_admin(edificio_id));
create policy cambiar on public.usuarios for update to authenticated
  using (interno.soy_admin(edificio_id)) with check (interno.soy_admin(edificio_id));
create policy borrar on public.usuarios for delete to authenticated
  using (interno.soy_admin(edificio_id));

-- codigos_acceso no tiene políticas: nadie la lee con la clave pública.

-- Instalaciones
create policy leer on public.instalaciones for select to authenticated
  using (interno.veo_instalacion(id));
create policy crear on public.instalaciones for insert to authenticated
  with check (interno.soy_admin(edificio_id));
create policy cambiar on public.instalaciones for update to authenticated
  using (interno.soy_admin(edificio_id)) with check (interno.soy_admin(edificio_id));
create policy borrar on public.instalaciones for delete to authenticated
  using (interno.soy_admin(edificio_id));

-- Documentos: se crean con registrar_documento y no se borran desde la aplicación.
create policy leer on public.documentos for select to authenticated
  using (interno.veo_documento(id));
create policy cambiar on public.documentos for update to authenticated
  using (interno.soy_admin(edificio_id)) with check (interno.soy_admin(edificio_id));

create policy leer on public.documento_instalaciones for select to authenticated
  using (interno.veo_documento(documento_id));
create policy crear on public.documento_instalaciones for insert to authenticated
  with check (interno.soy_admin(edificio_id));
create policy borrar on public.documento_instalaciones for delete to authenticated
  using (interno.soy_admin(edificio_id));

-- Revisiones
create policy leer on public.revisiones for select to authenticated
  using (interno.veo_instalacion(instalacion_id));
create policy crear on public.revisiones for insert to authenticated
  with check (interno.soy_admin(edificio_id));
create policy cambiar on public.revisiones for update to authenticated
  using (interno.soy_admin(edificio_id)) with check (interno.soy_admin(edificio_id));
create policy borrar on public.revisiones for delete to authenticated
  using (interno.soy_admin(edificio_id));

-- Partes: se añaden y no se cambian. Una corrección es un parte nuevo.
create policy leer on public.partes for select to authenticated
  using (interno.veo_instalacion(instalacion_id));
create policy crear on public.partes for insert to authenticated
  with check (interno.puedo_registrar_parte(edificio_id, instalacion_id, tipo, revision_id));

create policy leer on public.parte_fotos for select to authenticated
  using (interno.veo_parte(parte_id));
create policy crear on public.parte_fotos for insert to authenticated
  with check (
    edificio_id = interno.mi_edificio()
    and exists (select 1 from public.partes p where p.id = parte_id and p.autor_id = interno.mi_id())
  );

-- Actividad
create policy leer on public.actividad for select to authenticated
  using (interno.soy_admin(edificio_id));

-- ---------------------------------------------------------------------------
-- Permisos sobre tablas y funciones
-- ---------------------------------------------------------------------------
-- La seguridad por filas decide qué filas ve cada persona. Estos permisos deciden
-- qué operaciones existen. La clave pública sin sesión (anon) no puede hacer nada.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all routines in schema public from public, anon, authenticated;
revoke all on all routines in schema interno from public, anon, authenticated;

grant usage on schema interno to authenticated;
grant execute on function
  interno.mi_id(), interno.mi_edificio(), interno.mi_perfil(), interno.mi_contacto(),
  interno.soy_admin(uuid), interno.veo_instalacion(uuid), interno.veo_documento(uuid),
  interno.veo_parte(uuid), interno.puedo_registrar_parte(uuid, uuid, text, uuid)
to authenticated;

grant execute on function public.anotar_acceso() to authenticated;
grant execute on function public.puedo_archivar(uuid[]) to authenticated;
grant execute on function public.registrar_documento(
  uuid, text, text, date, text, text, text, text, uuid[], date, bigint, text
) to authenticated;

grant select on
  public.tipos_instalacion, public.plantilla_revisiones, public.plantilla_documentos,
  public.edificios, public.tipos_documento, public.contactos, public.usuarios,
  public.instalaciones, public.documentos, public.documento_instalaciones,
  public.revisiones, public.partes, public.parte_fotos, public.actividad,
  public.avisos, public.huecos
to authenticated;

grant insert, update, delete on
  public.tipos_documento, public.contactos, public.usuarios,
  public.instalaciones, public.revisiones
to authenticated;

-- El repositorio de un edificio no se cambia desde la aplicación.
grant update (
  nombre, tipo, via, municipio, provincia, codigo_postal, referencia_catastral,
  ano_construccion, ano_ultima_reforma, capacidad_personas, propiedad, gestion,
  temporada_apertura, temporada_cierre, notas
) on public.edificios to authenticated;
grant insert, delete on public.documento_instalaciones to authenticated;
grant insert on public.partes, public.parte_fotos to authenticated;

-- De un documento se puede corregir la ficha, pero no el archivo al que apunta.
grant update (tipo_id, titulo, fecha, emisor, caduca, eliminado_en, eliminado_por)
  on public.documentos to authenticated;

-- Un usuario no puede cambiar de edificio ni apropiarse de otra sesión.
revoke update on public.usuarios from authenticated;
grant update (nombre, email, perfil, contacto_id, acceso_caduca, activo)
  on public.usuarios to authenticated;
