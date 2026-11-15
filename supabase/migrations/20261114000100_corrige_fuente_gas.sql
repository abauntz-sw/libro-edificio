-- Corrige la fuente de la revisión de gas (issue #40).
-- La fuente citaba la Orden Foral 425/2009 de Navarra, que está derogada: la derogó la
-- Orden Foral 60/2015, disposición derogatoria única, punto 17.
-- El plazo no cambia: son 5 años con red de distribución (apartado 4.1) y sin ella (apartado 4.2).
-- La Orden Foral 60/2015 no fija plazos propios: su artículo 10 remite a la norma estatal.
-- Sigue con verificado = false hasta que la revise un técnico competente.

update public.plantilla_revisiones
set fuente = 'RD 919/2006, ITC-ICG 07, apartados 4.1 y 4.2 (Navarra no fija otro plazo: la Orden Foral 60/2015, art. 10, remite a la norma estatal)'
where tipo_instalacion_id = 'gas'
  and descripcion = 'Revisión o inspección periódica de la instalación';
