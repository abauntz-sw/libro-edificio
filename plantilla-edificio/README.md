# Archivo del edificio

Este repositorio guarda los documentos, las fotos y las firmas del Libro del Edificio.

Lo escribe la aplicación. No hace falta la aplicación para leerlo: basta este archivo y una hoja de cálculo.

**Es privado.** Contiene documentos reales. No lo hagas público ni copies archivos a otro sitio sin permiso de quien gestiona el edificio.

## Qué hay en cada carpeta

| Carpeta | Qué contiene |
|---|---|
| `documentos/` | Los documentos, en PDF, ordenados por año |
| `fotos/` | Las fotos de los partes de trabajo, por año |
| `firmas/` | Las firmas de los partes de trabajo, por año |
| `indice/` | La lista de todo lo guardado. Se actualiza cada día |
| `copia/` | Lo que mantiene al día la copia del ordenador de la oficina. Ver [`copia/README.md`](copia/README.md) |

## Cómo se llaman los archivos

Un documento se llama, por ejemplo:

```text
documentos/2021/2021-06-30_certificado_revision-de-la-caldera_e4996b97-8d6e-5a5a-892c-2239c6bd3c94.pdf
```

Por orden: la fecha del documento, su tipo, una descripción corta sacada del título y un identificador. Si el título no dice nada, como «escaneo001», la descripción es la instalación. Algunos no llevan descripción.

Una foto lleva la fecha del parte y la instalación: `fotos/2026/2026-11-21_extintores_<identificador>.jpg`.

- El identificador, al final, hace que dos archivos nunca se llamen igual.
- **El nombre no cambia** aunque luego se corrija la ficha: es el del día en que se archivó. El título y la fecha que valen son los del índice.
- Los archivos más antiguos pueden llamarse solo con el identificador, como `documentos/2021/e4996b97-8d6e-5a5a-892c-2239c6bd3c94.pdf`. Se dejan así.

## Cómo encontrar un documento

1. Abre `indice/documentos.csv` con Excel o LibreOffice. El separador es el punto y coma (`;`).
2. Busca el documento por su título, su tipo, su fecha o quien lo emitió. Puedes usar el filtro de la hoja de cálculo.
3. Mira la columna `ruta` de esa fila. Dice en qué carpeta está el archivo y cómo se llama.
4. Abre ese archivo.

## Qué significa cada columna del índice

| Columna | Qué dice |
|---|---|
| `ruta` | Dónde está el archivo dentro de este repositorio |
| `tipo` | Qué clase de documento es: contrato, certificado, plano… |
| `titulo` | El título que se le puso al guardarlo |
| `fecha` | La fecha del documento, como año-mes-día |
| `emisor` | Quien lo emitió: una empresa, un técnico, el ayuntamiento… |
| `caduca` | La fecha en que deja de valer. Vacío si no caduca |
| `instalaciones` | A qué instalaciones se refiere. Varias van separadas por comas |
| `nombre_original` | Cómo se llamaba el archivo cuando se recibió |
| `sha256` | La huella del archivo. Sirve para comprobar que no ha cambiado |

## Los otros índices

En `indice/` hay tres hojas más, con el mismo formato:

| Archivo | Qué lista | Columnas principales |
|---|---|---|
| `instalaciones.csv` | Cada instalación del edificio | `nombre`, `tipo`, `estado`, `empresa` que la mantiene |
| `revisiones.csv` | Las revisiones obligatorias de cada instalación | `periodicidad_meses`, `ultima`, `proxima`. Si `verificado` dice `no`, la periodicidad no está revisada por un técnico |
| `partes.csv` | Los partes de trabajo, del más antiguo al más nuevo | `fecha`, `instalacion`, `descripcion`. `certificado`, `firma` y `fotos` dicen dónde están sus archivos |

Los partes no se cambian. Si uno estaba mal, hay otro más nuevo que lo corrige.

Si un texto empieza por `=`, `+`, `-` o `@`, lleva un apóstrofo delante. Sin él, la hoja de cálculo lo tomaría por una fórmula.

## Cómo comprobar que un archivo no ha cambiado

La huella es un código que se calcula a partir del contenido. Si el archivo cambia, la huella cambia.

- En Windows: `certutil -hashfile archivo.pdf SHA256`
- En Mac o Linux: `shasum -a 256 archivo.pdf`

El resultado debe coincidir con la columna `sha256` del índice.

## Si falta un documento en el índice

El índice se escribe una vez al día. Un documento subido hoy aparece mañana.

## No cambies nada a mano

No renombres, muevas ni borres archivos. La aplicación guarda la ruta de cada uno y dejaría de encontrarlos.
