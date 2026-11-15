# Herramientas de carga

Sirven para cargar de una vez los documentos que ya existen, sin tocar los originales.

```text
Carpetas --> escanear --> listado.csv --> rellenar a mano --> importar
```


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

### Con los documentos en una carpeta de red

Las carpetas pueden estar en un servidor: `\\servidor\carpeta\documentos`. Leer por la red es más lento, pero funciona igual.

Guarda el listado en esa misma carpeta de red, junto a los documentos, y no en tu equipo:

```powershell
npm run escanear -- --salida \\servidor\carpeta\listado.csv \\servidor\carpeta\documentos
```

Escribe estas rutas en PowerShell. En Git Bash las barras `\\` del principio se pierden.

## importar

Carga en el Libro los documentos marcados con `si` en el listado.

```bash
npm run importar -- --listado listado.csv --repo <dirección-del-repositorio> [--origen <carpeta>] [--simular]
```

- `--repo` es la dirección del repositorio privado del edificio en GitHub, por ejemplo `https://github.com/<organización>/<edificio>.git`. No hace falta tenerlo clonado. Tiene que ser el repositorio que el Libro tiene apuntado para ese edificio. Si es otro, o si el edificio no tiene ninguno apuntado, `importar` se para antes de escribir nada.
- `--origen` es la carpeta que se escaneó. Las rutas del listado cuentan desde ella. Si no se pone, vale la carpeta del listado.
- `--simular` comprueba todo y no escribe nada. Con `--simular` no hace falta `--repo`.

Ejemplo con los datos ficticios, sin escribir nada:

```bash
npm run importar -- --simular --listado ../edificio-ejemplo-entrada/listado.csv --origen ../edificio-ejemplo-entrada/entrada
```

### Configuración

Copia `.env.ejemplo` como `.env` y rellénalo: la dirección del proyecto de Supabase, su clave pública y tu correo. Git ignora `.env`.

`importar` inicia sesión como persona administradora. Supabase envía un código a tu correo y la orden te lo pide. **No usa nunca la clave de servicio.**

### Qué hace, en orden

1. **Comprueba toda la hoja.** Tipo, título, fechas, instalaciones, y que cada archivo sigue en su sitio y no ha cambiado. Muestra todos los errores juntos, con su número de fila. Con un solo error no escribe nada.
2. **Abre una copia temporal del repositorio.** Es parcial: de los documentos que ya hay en el repositorio no baja ninguno.
3. **Copia los archivos** a esa copia, en `documentos/AAAA/<id>.ext`. El año es el de la fecha del documento. Los originales solo se leen.
4. **Hace un único commit y lo sube.**
5. **Borra la copia temporal**, también si algo ha fallado.
6. **Crea las fichas** en Supabase con `registrar_documento` y muestra un resumen: cargados, saltados y con error.

### No deja copias en el equipo

`importar` no guarda ningún documento en el equipo desde el que se hace la carga. La copia temporal vive en la carpeta de temporales del sistema solo mientras dura la subida.

Si el programa se cierra a la fuerza a mitad de la subida (se cierra la ventana o se apaga el equipo), la carpeta no se llega a borrar. Se llama `libro-carga-…` y está en la carpeta de temporales (`$env:TEMP` en PowerShell). Bórrala a mano.

### Cómo se rellena el listado

| Columna | Qué vale |
|---|---|
| `incluir` | `si` para cargar la fila. `no` o vacío para dejarla fuera |
| `tipo` | El identificador de un tipo de documento, como `certificado` o `contrato-mantenimiento` |
| `titulo` | Obligatorio |
| `fecha` | Obligatoria. `2026-03-10` o `10/03/2026` |
| `emisor` | Opcional |
| `instalaciones` | Opcional. El tipo de la instalación (`electricidad`) o su nombre. Varias, separadas por comas |
| `caduca` | Opcional. No puede ser anterior a `fecha` |

Si un valor no vale, el error dice cuáles valen.

### Se puede repetir

El identificador de cada documento sale del edificio y de la huella del archivo, así que es siempre el mismo. Si la carga se corta, repite la misma orden: lo que ya está no se copia ni se registra dos veces. Un archivo que ya está en el Libro se cuenta como saltado.

## Tests

```bash
npm test        # pruebas
npm run tipos   # comprobación de tipos de TypeScript
```

## Código

| Archivo | Qué hace |
|---|---|
| `src/escanear.ts` | La orden `escanear` |
| `src/importar.ts` | La orden `importar` |
| `src/comprobar.ts` | Comprueba el listado antes de escribir nada |
| `src/repositorio.ts` | Sube los archivos al repositorio del edificio desde una copia temporal |
| `src/direccion.ts` | Comprueba que la carga va al repositorio del edificio y no a otro |
| `src/supabase.ts` | Inicia sesión, lee el edificio y registra los documentos |
| `src/uuid.ts` | Calcula el identificador de cada documento |
| `src/listado.ts` | Construye las filas y une el listado anterior con el nuevo |
| `src/archivos.ts` | Busca archivos y calcula su huella |
| `src/csv.ts` | Lee y escribe el CSV |
