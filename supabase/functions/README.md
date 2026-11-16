# Funciones

Programas pequeños que se ejecutan en Supabase, no en el navegador. Sirven para guardar ahí las claves que el navegador no debe ver.

De momento hay una: `archivos`.

## Qué hace `archivos`

Sube y descarga los documentos del repositorio privado del edificio.

La aplicación no habla con GitHub. Habla con esta función, y la función comprueba el permiso antes de tocar nada.

| Petición | Qué hace |
|---|---|
| `POST /archivos` | Guarda un PDF en el repositorio y crea su ficha |
| `GET /archivos?id=…` | Devuelve el archivo, si quien lo pide puede verlo |

Las dos piden la sesión de la persona en la cabecera `Authorization`. La librería de Supabase la pone sola.

### Subir

Se manda un formulario (`multipart/form-data`) con estos campos:

| Campo | Obligatorio | Qué es |
|---|---|---|
| `archivo` | Sí | El PDF. Como mucho 25 MB |
| `id` | Sí | Un identificador nuevo, creado por la aplicación con `crypto.randomUUID()` |
| `tipo` | Sí | El tipo de documento: `certificado`, `contrato-mantenimiento`… |
| `titulo` | Sí | El título |
| `fecha` | Sí | La fecha del documento, como `2026-03-10` |
| `emisor` | No | Quien lo emitió |
| `caduca` | No | La fecha en que deja de valer |
| `instalaciones` | Depende | Una vez por cada instalación. Una empresa tiene que indicar al menos una suya |

Pasos, en este orden:

1. Comprueba el archivo y la ficha.
2. Pregunta a la base de datos si esa persona puede archivar, con `puedo_archivar`.
3. Escribe el archivo en `documentos/AAAA/<id>.pdf`.
4. Crea la ficha con `registrar_documento`, con la sesión de esa persona.

Si el paso 4 falla, queda un archivo sin ficha. No hace daño, y repetir la subida lo arregla. Nunca queda una ficha sin archivo.

Repetir una subida con el mismo `id` y el mismo archivo no duplica nada. Así un reintento con mala cobertura es seguro.

### Descargar

La función busca la ficha con la sesión de la persona. La base de datos solo se la da si puede verla. Si no, responde «No se encuentra ese documento», igual que si no existiera.

Solo entrega archivos de `documentos/`, con la forma `documentos/AAAA/<id>.<extensión>`. Si una ficha apunta a otro archivo del repositorio, como el índice o una foto, responde lo mismo: «No se encuentra ese documento».

### Respuestas

Cuando algo no vale, responde un JSON con el motivo: `{"error": "El archivo no es un PDF."}`.

| Código | Cuándo |
|---|---|
| 200 | Descarga correcta, o subida repetida que ya estaba hecha |
| 201 | Documento guardado |
| 400 | Falta algo o algo no vale |
| 401 | No hay sesión o ha caducado |
| 403 | Esa persona no puede archivar ahí |
| 404 | El documento no existe o no puede verlo |
| 409 | Ese identificador ya es de otro archivo |
| 413 | El archivo pesa más de 25 MB |
| 500 | Fallo del servidor. El detalle queda en el registro de la función |

## Claves

La función usa tres cosas, y ninguna va en el código:

- **La sesión de la persona.** Con ella pregunta a la base de datos. No usa la clave de servicio.
- **`GITHUB_APP_ID`.** El identificador de la GitHub App.
- **`GITHUB_APP_PRIVATE_KEY`.** La clave privada de la GitHub App. Es el secreto de verdad.

Los nombres están en [`.env.ejemplo`](.env.ejemplo). Los valores van en los secretos de Supabase.

El nombre del repositorio no es un secreto. Está en la tabla `edificios`, columna `repositorio`.

## Ponerla en marcha

Hace falta hacerlo una vez por proyecto de Supabase.

### 1. El repositorio de pruebas

1. Crea un repositorio **privado** con el contenido de [`plantilla-edificio/`](../../plantilla-edificio/README.md).
2. Apunta su nombre en el proyecto de desarrollo. En **SQL Editor**:

   ```sql
   update public.edificios set repositorio = 'organizacion/repositorio-de-pruebas';
   ```

En el repositorio de pruebas solo van documentos ficticios.

### 2. La GitHub App

Una GitHub App es un «usuario robot» con permisos muy acotados. No usa la contraseña ni el token de nadie.

1. En GitHub, en la organización: **Settings → Developer settings → GitHub Apps → New GitHub App**.
2. Pon un nombre y una dirección cualquiera en **Homepage URL**.
3. Desmarca **Webhook → Active**.
4. En **Repository permissions**, pon **Contents: Read and write**. Nada más.
5. En **Where can this GitHub App be installed?**, elige **Only on this account**.
6. Crea la App y apunta su **App ID**.
7. Abajo, en **Private keys**, pulsa **Generate a private key**. Se descarga un archivo `.pem`.
8. En **Install App**, instálala con **Only select repositories** y elige solo el repositorio de pruebas.

### 3. Los secretos

En el panel de Supabase: **Edge Functions → Secrets**.

- `GITHUB_APP_ID`: el App ID.
- `GITHUB_APP_PRIVATE_KEY`: todo el contenido del archivo `.pem`, con sus líneas de «BEGIN» y «END».

Si los pones con la herramienta `supabase secrets set` en vez del panel, la clave de varias líneas puede quedarse solo con la primera. La función avisa con «La clave privada de la GitHub App está vacía o no es un PEM». Pásala en una sola línea, con los saltos escritos como `\n`, con `--env-file`. La función los entiende.

Después borra el `.pem` del ordenador. Si se pierde, se crea otra clave en la App y se borra la anterior.

### 4. Publicar la función

Desde la raíz del repositorio:

```bash
npx supabase login
npx supabase functions deploy archivos --project-ref <referencia-del-proyecto>
```

### 5. Probarla

Con un PDF ficticio y la sesión de una persona del edificio de ejemplo:

```bash
curl -X POST "https://<referencia>.supabase.co/functions/v1/archivos" \
  -H "Authorization: Bearer <sesión>" \
  -F "archivo=@prueba.pdf" \
  -F "id=<un-uuid-nuevo>" -F "tipo=certificado" -F "titulo=Prueba" -F "fecha=2026-03-10"

curl "https://<referencia>.supabase.co/functions/v1/archivos?id=<el-mismo-uuid>" \
  -H "Authorization: Bearer <sesión>" -o descargado.pdf
```

## Tests

Las funciones se ejecutan con [Deno](https://deno.com), así que los tests también. Desde `supabase/functions/archivos/`:

```bash
deno task tipos
deno task test
```

Los tests no tocan GitHub ni Supabase: usan un GitHub y una base de datos de mentira. GitHub los ejecuta en cada push con [`.github/workflows/funciones.yml`](../../.github/workflows/funciones.yml).

Que una empresa no vea un documento ajeno lo decide la base de datos. Eso se comprueba en [`../tests/comprobar.mjs`](../tests/comprobar.mjs).

## Cómo está hecha

| Archivo | Qué hace |
|---|---|
| `archivos/index.ts` | La entrada. Lee los secretos y junta las piezas |
| `archivos/peticion.ts` | Atiende cada petición: los pasos de subir y de descargar |
| `archivos/ficha.ts` | Comprueba el archivo y la ficha |
| `archivos/libro.ts` | Lo que pregunta a la base de datos, con la sesión de la persona |
| `archivos/github.ts` | Lee y escribe en el repositorio como GitHub App |

## Límites

- **Solo PDF.** El archivo guarda los documentos en PDF. Las fotos y las firmas de los partes llegarán con la tarea 1.6.
- **25 MB por archivo.** Lo mayor va por la herramienta de carga local.
- **Escrituras de una en una.** GitHub no admite dos a la vez en el mismo repositorio. La función las pone en cola y, si aun así GitHub responde con conflicto, espera y repite hasta cinco veces.
