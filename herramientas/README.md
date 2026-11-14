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
- **El resto** (fotos, por ejemplo) no necesita preparación: entra tal cual en `escanear`.
- **Salida:** una carpeta nueva por tanda. Si no se dice otra, `Escaneos AAAA-MM`, con el año y el mes de hoy.
- **Originales:** solo se leen. Tampoco se escribe encima de nada que ya esté en la carpeta de salida.

Un escaneo `tanda.pdf` con tres documentos da `tanda-01.pdf`, `tanda-02.pdf` y `tanda-03.pdf`. Un `acta.docx` da `acta-docx.pdf`.

Con `--sin-ocr` solo corta, sin pasar el OCR. Sirve para probar sin tener instalado `ocrmypdf`.

### Programas que hay que instalar

`preparar` llama a programas de fuera. En Windows:

| Programa | Para qué | Cómo se instala |
|---|---|---|
| [Python](https://www.python.org/downloads/windows/) | Lo necesita `ocrmypdf` | Instalador oficial. Marca «Add python.exe to PATH» |
| [Tesseract](https://github.com/UB-Mannheim/tesseract/wiki) | Lee el texto de las imágenes | Instalador de UB Mannheim. En «Additional language data», marca **Spanish** y **Basque** |
| [Ghostscript](https://ghostscript.com/releases/gsdnld.html) | Lo necesita `ocrmypdf` | Instalador de 64 bits |
| [OCRmyPDF](https://ocrmypdf.readthedocs.io/en/latest/installation.html) | Pasa el OCR a los PDF | `pip install ocrmypdf` |
| [LibreOffice](https://es.libreoffice.org/descarga/libreoffice/) | Pasa `.docx` y `.odt` a PDF | Instalador oficial |

Tesseract y Ghostscript tienen que estar en el PATH. Para comprobarlo, abre una terminal nueva:

```bash
tesseract --list-langs   # deben salir spa y eus
ocrmypdf --version
```

LibreOffice se busca en su carpeta habitual. Si está en otro sitio, pon la ruta de `soffice.exe` en la variable `SOFFICE`.

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
- Si el listado ya existe, conserva lo rellenado y añade solo los archivos nuevos.
- No cambia ni mueve ningún archivo.

Las rutas del listado se escriben desde la carpeta común a todo lo escaneado. Para que al repetir se reconozcan los archivos, escanea siempre la misma carpeta.

El listado abre en Excel en español: UTF-8 con BOM y separador `;`.

**El listado de un edificio real lleva nombres de documentos reales. No lo guardes nunca en este repositorio.**

## importar

Carga en el Libro los documentos marcados con `si` en el listado.

```bash
npm run importar -- --listado listado.csv --repo <clon-del-edificio> [--origen <carpeta>] [--simular]
```

- `--repo` es la carpeta donde está clonado el repositorio privado del edificio.
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
2. **Copia los archivos** al clon, en `documentos/AAAA/<id>.ext`. El año es el de la fecha del documento. Los originales solo se leen.
3. **Hace un único commit y lo sube.**
4. **Crea las fichas** en Supabase con `registrar_documento` y muestra un resumen: cargados, saltados y con error.

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
| `src/repositorio.ts` | Copia los archivos al clon, hace el commit y lo sube |
| `src/supabase.ts` | Inicia sesión, lee el edificio y registra los documentos |
| `src/uuid.ts` | Calcula el identificador de cada documento |
| `src/listado.ts` | Construye las filas y une el listado anterior con el nuevo |
| `src/archivos.ts` | Busca archivos y calcula su huella |
| `src/csv.ts` | Lee y escribe el CSV |
