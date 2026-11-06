-- Datos comunes a cualquier edificio: tipos y plantillas de partida.
-- Ninguna periodicidad está verificada: cada una lleva su fuente y verificado = false
-- hasta que la revise un técnico competente.


insert into public.tipos_instalacion (id, nombre) values
  ('electricidad', 'Electricidad'),
  ('agua-consumo', 'Agua de consumo'),
  ('saneamiento', 'Saneamiento'),
  ('contraincendios', 'Contraincendios'),
  ('calefaccion-acs', 'Calefacción y agua caliente'),
  ('cubierta-fachada', 'Cubierta y fachada'),
  ('gas', 'Gas'),
  ('cocina-extraccion', 'Cocina y extracción'),
  ('ascensor', 'Ascensor'),
  ('otro', 'Otro');

insert into public.tipos_documento (id, nombre) values
  ('proyecto', 'Proyecto'),
  ('certificado-final-obra', 'Final de obra'),
  ('licencia', 'Licencia'),
  ('boletin', 'Boletín'),
  ('certificado', 'Certificado'),
  ('acta-inspeccion', 'Acta de inspección'),
  ('contrato-mantenimiento', 'Contrato de mantenimiento'),
  ('poliza-seguro', 'Póliza de seguro'),
  ('informe', 'Informe'),
  ('manual', 'Manual'),
  ('plano', 'Plano'),
  ('factura', 'Factura'),
  ('otro', 'Otro');

insert into public.plantilla_revisiones (tipo_instalacion_id, descripcion, periodicidad_meses, responsable, fuente, verificado) values
  ('agua-consumo', 'Control de la calidad del agua', null, 'titular', 'pendiente (depende de si hay red o captación propia)', false),
  ('calefaccion-acs', 'Mantenimiento de generadores y equipos', null, 'empresa-mantenedora', 'RITE, RD 1027/2007, IT 3 (depende de la potencia)', false),
  ('calefaccion-acs', 'Control de legionela en agua caliente', null, 'titular', 'RD 487/2022 (confirmar si aplica)', false),
  ('contraincendios', 'Revisión de extintores y equipos por el titular', 3, 'titular', 'RD 513/2017 (RIPCI), anexo II', false),
  ('contraincendios', 'Revisión anual por empresa mantenedora', 12, 'empresa-mantenedora', 'RD 513/2017 (RIPCI), anexo II', false),
  ('cubierta-fachada', 'Inspección visual tras el invierno', 12, 'titular', 'pendiente (buena práctica, no norma)', false),
  ('electricidad', 'Inspección periódica de la instalación', null, 'organismo-de-control', 'REBT, RD 842/2002, ITC-BT-05 (depende del uso)', false),
  ('saneamiento', 'Limpieza y revisión de la red o depuradora', null, 'empresa-mantenedora', 'pendiente', false);

insert into public.plantilla_documentos (tipo_instalacion_id, tipo_documento_id) values
  ('agua-consumo', 'informe'),
  ('agua-consumo', 'certificado'),
  ('calefaccion-acs', 'contrato-mantenimiento'),
  ('calefaccion-acs', 'certificado'),
  ('calefaccion-acs', 'manual'),
  ('contraincendios', 'certificado'),
  ('contraincendios', 'contrato-mantenimiento'),
  ('contraincendios', 'acta-inspeccion'),
  ('cubierta-fachada', 'informe'),
  ('electricidad', 'boletin'),
  ('electricidad', 'acta-inspeccion'),
  ('electricidad', 'contrato-mantenimiento'),
  ('saneamiento', 'contrato-mantenimiento'),
  ('saneamiento', 'informe');
