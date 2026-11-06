# Entrada de ejemplo para la carga de documentos

Datos ficticios para desarrollar y probar `escanear` e `importar`.

- `entrada/`: carpetas desordenadas, tal como podría llegar la documentación. Incluye un duplicado, un archivo sin interés y otro que no es PDF.
- `listado.csv`: el resultado de `escanear` con las columnas de clasificación ya rellenadas a mano. Abre en Excel (UTF-8 con BOM, separador `;`). `instalaciones` admite varios valores separados por comas.

**Resultado esperado:** importar `listado.csv` debe dejar 12 documentos con las mismas huellas que `supabase/seed.sql`. Las 3 filas con `incluir` = `no` no se copian.
