# Herramientas de carga

Sirven para cargar de una vez los documentos que ya existen, sin tocar los originales.

```text
Papel y .docx --> preparar --┐
Carpetas ---------------------┴--> escanear --> listado.csv --> rellenar a mano --> importar
```


## Preparar

Hace falta Node.js 24 o posterior. Desde esta carpeta:

```bash
npm install
```

## preparar

Deja el papel escaneado y los textos editables listos para `escanear`. Todo se hace en este ordenador: no se envía nada a ningún servicio, tampoco a una IA.

```bash
npm run preparar -- --separadora hoja-separadora.pdf
npm run preparar -- [--salida <carpeta>] [--sin-ocr] <carpeta o archivo> [más carpetas o archivos]
```

### Cómo se escanea el papel

1. Crea la hoja separadora con `--separadora` e imprime unas cuantas copias. Lleva un código QR.
2. Haz un montón con los documentos y pon una hoja separadora entre uno y el siguiente.
3. Escanea el montón seguido a un solo PDF, a 200 o 300 ppp.
4. Ejecuta `preparar` con ese PDF.

### Qué hace

- **PDF escaneados:** busca las páginas con el QR, corta por ellas y deja un PDF por documento, sin las separadoras. Después pasa el OCR en español y euskera, para que el texto se pueda buscar. Las páginas que ya tienen texto no se rehacen.
- **`.docx` y `.odt`:** los pasa a PDF con LibreOffice.
- **PDF que ya están listos:** si un PDF no tiene hojas separadoras y todas sus páginas tienen texto, no se toca. Copiarlo cambiaría su huella y `escanear` no lo reconocería como repetido.
- **El resto** (fotos, por ejemplo) no necesita preparación: entra tal cual en `escanear`.
- **Salida:** una carpeta nueva por tanda. Si no se dice otra con `--salida`, `Escaneos AAAA-MM`, con el año y el mes de hoy, junto a la primera carpeta o archivo de entrada. Nunca dentro de este repositorio, que es público: si la carpeta de salida queda dentro, `preparar` se para sin crear nada.
- **Originales:** solo se leen. Tampoco se escribe encima de nada que ya esté en la carpeta de salida: si ya tiene alguno de los nombres, `preparar` se para antes de crear nada.
- **Lista de lo preparado:** en la carpeta de la tanda deja `.preparados.csv`, con la ruta y la huella de cada original y los PDF que salieron de él. Así `escanear` reconoce después los originales, y nadie carga por error la tanda entera o el `.docx` en vez de los PDF.

Un escaneo `tanda.pdf` con tres documentos da `tanda-01.pdf`, `tanda-02.pdf` y `tanda-03.pdf`. Un `acta.docx` da `acta-docx.pdf`.

Si dos archivos de carpetas distintas se llaman igual, como los `scan0001.pdf` de dos cajas, delante va el nombre de su carpeta: `Caja 1 - scan0001.pdf` y `Caja 2 - scan0001.pdf`.

Con `--sin-ocr` solo corta, sin pasar el OCR. Sirve para probar sin tener instalado `ocrmypdf`.

### Programas que hay que instalar

`preparar` llama a programas de fuera. En Windows, abre PowerShell y sigue estos pasos en orden. Cada instalador pide permiso con una ventana de Windows.

**1. Python.** Lo necesita OCRmyPDF. Si `python --version` no responde, instálalo con el [instalador oficial](https://www.python.org/downloads/windows/) y marca «Add python.exe to PATH».

**2. Tesseract.** Es el programa que lee el texto de las imágenes.

```powershell
winget install --id UB-Mannheim.TesseractOCR -e --interactive
```

En el asistente, despliega **Additional language data (download)** y marca **Spanish** y **Basque**. No lo confundas con «Additional script data», que está al lado y son alfabetos, no idiomas.

**3. Ghostscript.** Lo necesita OCRmyPDF. No está en `winget`: descarga el instalador de 64 bits de [ghostscript.com](https://ghostscript.com/releases/gsdnld.html) y ejecútalo.

**4. LibreOffice.** Pasa `.docx` y `.odt` a PDF.

```powershell
winget install --id TheDocumentFoundation.LibreOffice -e
```

**5. OCRmyPDF.**

```powershell
pip install ocrmypdf
```

**6. El PATH.** Ni Tesseract ni, a veces, `pip` dejan sus programas donde Windows los busca. Esto añade las dos carpetas para tu usuario:

```powershell
$carpetas = 'C:\Program Files\Tesseract-OCR', "$env:APPDATA\Python\Python315\Scripts"
[Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path','User') + ';' + ($carpetas -join ';'), 'User')
```

La segunda carpeta lleva el número de tu versión de Python: `Python315` es la 3.15. Para saber dónde ha quedado `ocrmypdf.exe`, ejecuta `pip show -f ocrmypdf`.

**7. Comprobar.** Cierra la terminal, abre una nueva y ejecuta:

```powershell
tesseract --list-langs   # deben salir spa y eus
ocrmypdf --version
```

LibreOffice se busca en su carpeta habitual. Si está en otro sitio, pon la ruta de `soffice.exe` en la variable `SOFFICE`. Funciona aunque tengas LibreOffice abierto: `preparar` usa una configuración propia, aparte de la tuya.

#### Si no salen `spa` y `eus`

Faltan los idiomas. Se pueden añadir sin reinstalar y sin permisos de administrador, en una carpeta de tu usuario:

```powershell
$idiomas = "$env:LOCALAPPDATA\Tesseract-idiomas"
New-Item -ItemType Directory -Force $idiomas
Copy-Item 'C:\Program Files\Tesseract-OCR\tessdata\*' $idiomas -Recurse -Exclude 'script'
foreach ($i in 'spa','eus') { Invoke-WebRequest "https://github.com/tesseract-ocr/tessdata_fast/raw/main/$i.traineddata" -OutFile "$idiomas\$i.traineddata" }
[Environment]::SetEnvironmentVariable('TESSDATA_PREFIX', $idiomas, 'User')
```

La variable `TESSDATA_PREFIX` le dice a Tesseract que lea los idiomas de esa carpeta. Hay que copiar todo el contenido de `tessdata`, no solo los idiomas, porque también lleva su configuración. Abre una terminal nueva y repite el paso 7.

#### Si PowerShell no deja ejecutar `npm`

Si sale «la ejecución de scripts está deshabilitada en este sistema», escribe `npm.cmd` en lugar de `npm`, o ejecuta una sola vez:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Comprobado en Windows 11 con Tesseract 5.4, Ghostscript 10.08 y OCRmyPDF 17.14.

En Ubuntu o Debian basta con:

```bash
sudo apt-get install ocrmypdf tesseract-ocr-spa tesseract-ocr-eus libreoffice-writer
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
- Avisa en `aviso` de los originales que ya pasaron por `preparar`: hay que cargar los PDF que salieron de ellos. `importar` no los carga.
- Si el listado ya existe, conserva lo rellenado y añade solo los archivos nuevos.
- No entra en las carpetas `[en-el-libro]`: lo de dentro ya está en el Libro. Sus filas cuentan como cargadas, no como desaparecidas.
- No cambia ni mueve ningún archivo.

### Rutas completas: cada escaneo se suma a la hoja

`ruta_original` guarda la ruta completa de cada archivo, por ejemplo `D:\Papel\Caja 1\caldera.pdf`. Así los documentos pueden estar en varias carpetas, en sitios distintos y escaneados en días distintos: cada escaneo se suma al mismo listado sin mover nada.

```powershell
npm run escanear -- --salida listado.csv "D:\Papel\Caja 1"
npm run escanear -- --salida listado.csv "\\servidor\documentos\Mantenimiento"
```

Después del segundo, el listado tiene los archivos de las dos carpetas. Si una carpeta no se vuelve a escanear, sus filas se quedan: `escanear` avisa de que no las ve, pero no borra nada.

Al repetir `escanear`:

- **Archivo movido o renombrado:** si una fila ya no encuentra su archivo y aparece uno nuevo con la misma huella, es el mismo archivo. Se cambia su ruta y se conserva lo rellenado. No sale duplicado.
- **Archivo cambiado:** si un archivo sigue en su sitio pero su contenido ha cambiado, se apuntan su huella, su tamaño y su fecha nuevos, y `aviso` dice «ha cambiado desde el escaneo anterior: revisa la ficha». Si no, la versión nueva nunca llegaría al Libro y nadie se enteraría.
- **Listado antiguo, con rutas relativas:** sus filas se reconocen por la huella y pasan a ruta completa, sin perder lo rellenado.

En Windows, las rutas se comparan sin distinguir mayúsculas, como hace el propio Windows.

El listado abre en Excel en español: UTF-8 con BOM y separador `;`.

**El listado de un edificio real lleva nombres de documentos reales. No lo guardes nunca en este repositorio.**

### Con los documentos en una carpeta de red

Las carpetas pueden estar en un servidor: `\\servidor\carpeta\documentos`. Leer por la red es más lento, pero funciona igual.

Guarda el listado en esa misma carpeta de red, junto a los documentos, y no en tu equipo:

```powershell
npm run escanear -- --salida \\servidor\carpeta\listado.csv \\servidor\carpeta\documentos
```

Escribe estas rutas en PowerShell. En Git Bash las barras `\\` del principio se pierden.

**Usa la dirección `\\servidor\…`, no una letra de unidad como `Z:`.** La letra la elige cada ordenador: la misma carpeta puede ser `Z:` en uno y `Y:` en otro, y el listado guarda la ruta completa. Si escaneas una letra de red, `escanear` avisa y te dice qué dirección usar.

## importar

Carga en el Libro los documentos marcados con `si` en el listado.

```bash
npm run importar -- --listado listado.csv --repo <dirección-del-repositorio> [--no-mover] [--simular]
```

- `--repo` es la dirección del repositorio privado del edificio en GitHub, por ejemplo `https://github.com/<organización>/<edificio>.git`. No hace falta tenerlo clonado. Tiene que ser el repositorio que el Libro tiene apuntado para ese edificio. Si es otro, o si el edificio no tiene ninguno apuntado, `importar` se para antes de escribir nada.
- Cada archivo se busca en su `ruta_original`, que es la ruta completa. Una ruta relativa, como en el listado de ejemplo, cuenta desde la carpeta del listado.
- `--no-mover` deja los originales donde están. Sin él, lo ya cargado se aparta a `[en-el-libro]` (ver abajo).
- `--simular` comprueba todo y no escribe ni mueve nada. Con `--simular` no hace falta `--repo`.

Ejemplo con los datos ficticios, sin escribir nada:

```bash
npm run importar -- --simular --listado ../edificio-ejemplo-entrada/listado.csv
```

### Configuración

Copia `.env.ejemplo` como `.env` y rellénalo: la dirección del proyecto de Supabase, su clave pública y tu correo. Git ignora `.env`.

`importar` inicia sesión como persona administradora. Supabase envía un código a tu correo y la orden te lo pide. **No usa nunca la clave de servicio.**

`LIBRO_CONTRASENA` es solo para desarrollo: con ella se entra con contraseña y no llega ningún correo. En producción, la entrada con contraseña estará desactivada en Supabase, así que solo valdrá el código.

### Qué hace, en orden

1. **Comprueba toda la hoja.** Tipo, título, fechas, instalaciones, y que cada archivo sigue en su sitio y no ha cambiado. Muestra todos los errores juntos, con su número de fila. Con un solo error no escribe nada.
2. **Abre una copia temporal del repositorio.** Es parcial: de los documentos que ya hay en el repositorio no baja ninguno.
3. **Copia los archivos** a esa copia, en `documentos/AAAA/<id>.ext`. El año es el de la fecha del documento. Los originales solo se leen.
4. **Hace un único commit y lo sube.** Cada ficha guarda ese commit en `commit_sha`. La copia temporal no trae la historia y no sabe qué commit guardó cada archivo, así que se apunta el último, que los contiene todos.
5. **Borra la copia temporal**, también si algo ha fallado.
6. **Crea las fichas** en Supabase con `registrar_documento` y muestra un resumen: cargados, saltados y con error.
7. **Aparta lo cargado a `[en-el-libro]`**, salvo con `--no-mover`. Ver el apartado siguiente.

### Lo cargado se aparta a `[en-el-libro]`

Al terminar, cada archivo que ya está en el repositorio **y** tiene su ficha se mueve a una subcarpeta `[en-el-libro]`, junto a donde estaba:

```
Mantenimiento\caldera.pdf  →  Mantenimiento\[en-el-libro]\caldera.pdf
```

Así, en la carpeta de los documentos se ve de un vistazo qué está en el Libro y qué falta. Desde la carga, la versión buena es la del Libro: una versión nueva se sube por la aplicación.

- **Solo lo que ha salido bien:** lo recién cargado sin error y lo que ya estaba en el Libro. Lo que ha fallado se queda en su sitio.
- **El archivo no cambia.** Solo cambia de carpeta y queda en solo lectura. Eso no lo protege de verdad, pero hace saltar un aviso a quien intente guardar encima.
- **Si no se puede mover** (permisos, archivo abierto, ya hay otro con ese nombre), avisa y sigue: el documento ya está en el Libro.
- **El listado se pone al día** con la ruta nueva. Si no se puede escribir, por ejemplo porque está abierto en Excel, avisa: la próxima vez que se ejecute `escanear`, encuentra el archivo en su `[en-el-libro]` y corrige la ruta.

Está pendiente de confirmar con la FNDME (pregunta 14 de `PLAN-BELAGUA.md`). Si prefieren que su carpeta no se toque, se usa `--no-mover`.

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
| `src/preparar.ts` | La orden `preparar` |
| `src/tanda.ts` | Prepara una tanda: corta, pasa el OCR y convierte a PDF |
| `src/separadora.ts` | Crea la hoja separadora |
| `src/partir.ts` | Encuentra las hojas separadoras y corta el PDF |
| `src/externos.ts` | Llama a `ocrmypdf` y a LibreOffice |
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
