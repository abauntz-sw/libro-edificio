-- Una ficha solo puede apuntar a su propio documento: documentos/AAAA/<id>.<extensión> (issue #51).
--
-- Antes, registrar_documento aceptaba cualquier ruta. Una empresa podía crear una ficha suya
-- que apuntara a otro archivo del repositorio, como el índice (indice/documentos.csv) o una foto,
-- y la función de archivos se lo entregaba.
--
-- La extensión puede ser otra que pdf: la herramienta de carga local también guarda otros formatos.
-- El año de la carpeta no se comprueba, porque en los datos de ejemplo no coincide con la fecha.

alter table public.documentos
  add constraint documentos_ruta_de_documento
  check (ruta ~ ('^documentos/[0-9]{4}/' || id::text || '\.[a-z0-9]+$'));
