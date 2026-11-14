-- Completa los datos comunes con lo que faltaba de la sección 3 de PLAN-BELAGUA.md.
-- Ninguna periodicidad está verificada: cada una lleva su fuente y verificado = false
-- hasta que la revise un técnico competente.
-- Donde no se ha encontrado un plazo en la norma, la periodicidad queda vacía.
-- Las fuentes son normas estatales, que también se aplican en Navarra.
-- Se ha buscado norma foral de Navarra sobre lo mismo y ninguna fija un plazo distinto.

insert into public.tipos_instalacion (id, nombre) values
  ('accesos-evacuacion', 'Accesos y salidas de emergencia');

insert into public.plantilla_revisiones (tipo_instalacion_id, descripcion, periodicidad_meses, responsable, fuente, verificado) values
  -- Gas: el plazo es el mismo con red de distribución (inspección) y sin ella (revisión).
  -- En Navarra lo desarrolla la Orden Foral 425/2009, que no fija un plazo distinto.
  ('gas', 'Revisión o inspección periódica de la instalación', 60, 'empresa-mantenedora', 'RD 919/2006, ITC-ICG 07, apartado 4 (la Orden Foral 425/2009 de Navarra no cambia el plazo)', false),
  ('gas', 'Prueba de presión del depósito fijo de GLP', 180, 'organismo-de-control', 'RD 919/2006, ITC-ICG 03, apartado 6.3 (solo si hay depósito fijo)', false),
  -- Cocina: no se ha encontrado una norma estatal ni foral de Navarra que fije cada cuánto se limpia.
  ('cocina-extraccion', 'Limpieza de campana, filtros y conductos de extracción', null, 'empresa-mantenedora', 'pendiente (no se ha encontrado plazo en norma estatal ni foral de Navarra)', false),
  -- Evacuación: la norma obliga a tener las salidas libres siempre, sin fijar un plazo de revisión.
  ('accesos-evacuacion', 'Comprobación de que las vías y salidas de evacuación están libres', null, 'titular', 'RD 486/1997, anexo I.A.10 y anexo II (no fija plazo)', false),
  ('contraincendios', 'Comprobación visual de señales y planos de evacuación', 12, 'titular', 'RD 513/2017 (RIPCI), anexo II, tabla III', false);

-- Documentos que se suelen guardar. El plano de evacuación lo exige a los albergues turísticos
-- de Navarra el Decreto Foral 140/2005, art. 19. Falta confirmar si un refugio de montaña cuenta como tal.
insert into public.plantilla_documentos (tipo_instalacion_id, tipo_documento_id) values
  ('gas', 'certificado'),
  ('gas', 'acta-inspeccion'),
  ('cocina-extraccion', 'certificado'),
  ('accesos-evacuacion', 'plano');
