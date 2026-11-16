-- Exportación diaria del índice (tarea 1.5).
--
-- Prepara los cuatro CSV de la carpeta indice/ del repositorio del edificio:
-- documentos, instalaciones, revisiones y partes. Con ellos se puede leer el archivo sin la aplicación.
--
-- El formato es el de plantilla-edificio/indice/documentos.csv, para que Excel lo abra bien:
--   - separador punto y coma,
--   - saltos de línea de Windows (\r\n),
--   - la marca BOM al principio, para que respete las tildes.
--
-- El contenido no lleva la fecha ni la hora de la exportación. Si nada cambia, los archivos salen
-- iguales y la función «exportar» no hace commit.

-- Un campo del CSV.
--   - Vacío si no hay valor.
--   - Si empieza por = + - @ o un tabulador, se le pone delante un apóstrofo. Excel tomaría el texto
--     por una fórmula, y un título escrito con mala intención podría ejecutarse al abrir la hoja.
--   - Entre comillas si lleva punto y coma, comillas o saltos de línea. Las comillas se doblan.
create function interno.csv_campo(p_valor text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_valor is null then ''
    when protegido ~ '[;"\r\n]' then '"' || replace(protegido, '"', '""') || '"'
    else protegido
  end
  from (select case when p_valor ~ '^[=+@\t\r-]' then '''' || p_valor else p_valor end as protegido) x
$$;

-- Una fila del CSV: los campos separados por punto y coma.
create function interno.csv_fila(variadic p_campos text[]) returns text
language sql immutable set search_path = '' as $$
  select string_agg(interno.csv_campo(campo), ';' order by n)
  from unnest(p_campos) with ordinality as c (campo, n)
$$;

-- Un archivo CSV: la marca BOM, la cabecera y las filas, cada una con su salto de línea.
create function interno.csv_archivo(p_cabecera text, p_filas text[]) returns text
language sql immutable set search_path = '' as $$
  select chr(65279) || p_cabecera || E'\r\n'
    || coalesce(array_to_string(p_filas, E'\r\n') || E'\r\n', '')
$$;

-- Los cuatro archivos del índice de un edificio.
-- Solo la usa la función «exportar», con la clave de servicio. Por eso se ejecuta con los permisos
-- de quien la creó (security definer) y nadie más puede llamarla: ver los permisos al final.
create function public.exportar_indice(p_edificio uuid)
returns table (archivo text, contenido text)
language sql stable security definer set search_path = '' as $$

  -- Los documentos de la papelera no salen: no forman parte del Libro.
  select 'indice/documentos.csv', interno.csv_archivo(
    'ruta;tipo;titulo;fecha;emisor;caduca;instalaciones;nombre_original;sha256',
    array(
      select interno.csv_fila(
        d.ruta, t.nombre, d.titulo, d.fecha::text, d.emisor, d.caduca::text,
        (select string_agg(i.nombre, ', ' order by i.nombre)
           from public.documento_instalaciones di
           join public.instalaciones i on i.id = di.instalacion_id
          where di.documento_id = d.id),
        d.nombre_original, d.sha256)
      from public.documentos d
      join public.tipos_documento t on t.id = d.tipo_id
      where d.edificio_id = p_edificio and d.eliminado_en is null
      order by d.fecha, d.ruta))

  union all
  select 'indice/instalaciones.csv', interno.csv_archivo(
    'nombre;tipo;estado;ubicacion;marca;modelo;numero_serie;ano_instalacion;empresa;notas',
    array(
      select interno.csv_fila(
        i.nombre, ti.nombre, i.estado, i.ubicacion, i.marca, i.modelo, i.numero_serie,
        i.ano_instalacion::text, c.nombre, i.notas)
      from public.instalaciones i
      join public.tipos_instalacion ti on ti.id = i.tipo_id
      left join public.contactos c on c.id = i.empresa_id
      where i.edificio_id = p_edificio
      order by i.nombre))

  union all
  select 'indice/revisiones.csv', interno.csv_archivo(
    'instalacion;descripcion;periodicidad_meses;responsable;ultima;proxima;verificado;fuente',
    array(
      select interno.csv_fila(
        i.nombre, r.descripcion, r.periodicidad_meses::text, c.nombre, r.ultima::text, r.proxima::text,
        case when r.verificado then 'si' else 'no' end, r.fuente)
      from public.revisiones r
      join public.instalaciones i on i.id = r.instalacion_id
      left join public.contactos c on c.id = r.responsable_id
      where r.edificio_id = p_edificio
      order by i.nombre, r.descripcion, r.id))

  -- La hora de recepción, en la hora de España, para que cuadre con la del refugio.
  union all
  select 'indice/partes.csv', interno.csv_archivo(
    'fecha;instalacion;tipo;autor;empresa;tecnico;descripcion;horas;materiales;revision;proxima_revision;certificado;firma;fotos;recibido_en',
    array(
      select interno.csv_fila(
        p.fecha::text, i.nombre, p.tipo, p.autor_rol, c.nombre, p.tecnico, p.descripcion, p.horas::text,
        array_to_string(p.materiales, ', '), r.descripcion, p.proxima_revision::text, d.ruta, p.firma_ruta,
        (select string_agg(f.ruta, ', ' order by f.ruta) from public.parte_fotos f where f.parte_id = p.id),
        to_char(p.recibido_en at time zone 'Europe/Madrid', 'YYYY-MM-DD HH24:MI'))
      from public.partes p
      join public.instalaciones i on i.id = p.instalacion_id
      left join public.contactos c on c.id = p.empresa_id
      left join public.revisiones r on r.id = p.revision_id
      left join public.documentos d on d.id = p.certificado_id
      where p.edificio_id = p_edificio
      order by p.fecha, p.recibido_en, p.id))
$$;

-- Permisos: solo la clave de servicio, que vive en los secretos de la función «exportar».
revoke all on function interno.csv_campo(text), interno.csv_fila(text[]), interno.csv_archivo(text, text[])
  from public, anon, authenticated;
revoke all on function public.exportar_indice(uuid) from public, anon, authenticated;
grant execute on function public.exportar_indice(uuid) to service_role;
