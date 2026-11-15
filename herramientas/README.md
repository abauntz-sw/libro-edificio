# Herramientas de carga

Sirven para cargar de una vez los documentos que ya existen, sin tocar los originales.

```text
Carpetas --> escanear --> listado.csv --> rellenar a mano --> importar
```

De momento solo está `escanear`. `importar` llegará en otro Pull Request.

## Preparar

Hace falta Node.js 24 o posterior. Desde esta carpeta:

```bash
npm install
```

## escanear

Recorre carpetas y archivos y escribe una hoja de cálculo con una fila por archivo.

```bash
npm run escanear -- --salida listado.csv <carpeta o archivo> [más carpetas o archivos]
```

Ejemplo con los datos ficticios:

```bash
npm run escanear -- --salida ../../listado-prueba.csv ../edificio-ejemplo-entrada/entrada
```

Qué hace:

- Rellena `ruta_original`, `nombre`, `extension`, `tamano_mb`, `fecha_modificacion` y `sha256`.
- Deja vacías las columnas que rellena una persona: `incluir`, `tipo`, `titulo`, `fecha`, `emisor`, `instalaciones` y `caduca`.
- Marca los archivos repetidos. `duplicado_de` apunta al primero con el mismo contenido.
- Avisa en `aviso` de lo que no es PDF y de lo que pasa de 100 MB, que GitHub no admite.
- Si el listado ya existe, conserva lo rellenado y añade solo los archivos nuevos.
- No cambia ni mueve ningún archivo.

Las rutas del listado se escriben desde la carpeta común a todo lo escaneado. Para que al repetir se reconozcan los archivos, escanea siempre la misma carpeta.

El listado abre en Excel en español: UTF-8 con BOM y separador `;`.

**El listado de un edificio real lleva nombres de documentos reales. No lo guardes nunca en este repositorio.**

## Tests

```bash
npm test        # pruebas
npm run tipos   # comprobación de tipos de TypeScript
```

## Código

| Archivo | Qué hace |
|---|---|
| `src/escanear.ts` | La orden `escanear` |
| `src/listado.ts` | Construye las filas y une el listado anterior con el nuevo |
| `src/archivos.ts` | Busca archivos y calcula su huella |
| `src/csv.ts` | Lee y escribe el CSV |
