# Funciones

Programas pequeños que se ejecutan en Supabase, no en el navegador. Sirven para guardar ahí las claves que el navegador no debe ver.

Hay dos:

- `archivos`: sube y descarga los documentos y las fotos de los partes.
- `exportar`: cada noche deja el índice de cada edificio en su repositorio. Está explicada al final, en [«Qué hace `exportar`»](#qué-hace-exportar).

## Qué hace `archivos`

Sube y descarga los documentos y las fotos de los partes, del repositorio privado del edificio.

La aplicación no habla con GitHub. Habla con esta función, y la función comprueba el permiso antes de tocar nada.

| Petición | Qué hace |
|---|---|
| `POST /archivos` | Guarda un PDF en el repositorio y crea su ficha |
| `POST /archivos` con `parte` | Guarda una foto de un parte y la apunta en `parte_fotos` |
| `GET /archivos?id=…` | Devuelve el documento, si quien lo pide puede verlo |
| `GET /archivos?foto=…` | Devuelve la foto, si quien la pide ve su parte |

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

### Subir una foto de un parte

El móvil envía primero el parte, con `insert` en la tabla `partes`, y después cada foto. Así una foto nunca llega sin su parte. Se manda un formulario con estos campos:

| Campo | Qué es |
|---|---|
| `archivo` | La foto, en JPEG. Como mucho 5 MB: el móvil la comprime antes |
| `id` | Un identificador nuevo para la foto, creado por el móvil |
| `parte` | El identificador del parte |

Pasos, en este orden:

1. Comprueba que es un JPEG y que no pasa de 5 MB.
2. Pregunta a la base de datos si esa persona puede añadir fotos a ese parte, con `puedo_adjuntar_foto`. Solo puede quien escribió el parte.
3. Escribe la foto en `fotos/AAAA/<id>.jpg`. El año es el de la fecha del parte.
4. La apunta en `parte_fotos`, con la sesión de esa persona.

Igual que con los documentos: repetir la subida con el mismo `id` y la misma foto no duplica nada, y si el paso 4 falla, repetirla lo arregla.

### Descargar una foto

`GET /archivos?foto=<id>`. La entrega a quien ve su parte: la administración, la consulta y la guarda, todas; una empresa, las de sus instalaciones. Si no, responde «No se encuentra esa foto». Solo entrega archivos con la forma `fotos/AAAA/<id>.jpg`.

### Respuestas

Cuando algo no vale, responde un JSON con el motivo: `{"error": "El archivo no es un PDF."}`.

| Código | Cuándo |
|---|---|
| 200 | Descarga correcta, o subida repetida que ya estaba hecha |
| 201 | Documento o foto guardados |
| 400 | Falta algo o algo no vale |
| 401 | No hay sesión o ha caducado |
| 403 | Esa persona no puede archivar ahí, o no puede añadir fotos a ese parte |
| 404 | El documento o la foto no existen, o no puede verlos |
| 409 | Ese identificador ya es de otro archivo |
| 413 | El documento pesa más de 25 MB, o la foto más de 5 MB |
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

Las funciones se ejecutan con [Deno](https://deno.com), así que los tests también. Desde la carpeta de cada función, `supabase/functions/archivos/` o `supabase/functions/exportar/`:

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
| `archivos/github.ts` | Lee y escribe en el repositorio como GitHub App. También lo usa `exportar` |
| `exportar/index.ts` | La entrada de `exportar`. Lee los secretos y junta las piezas |
| `exportar/exportar.ts` | Comprueba la clave y exporta cada edificio |

## Límites

- **Documentos en PDF y fotos en JPEG.** Las firmas de los partes todavía no.
- **25 MB por documento y 5 MB por foto.** Un documento mayor va por la herramienta de carga local.
- **Escrituras de una en una.** GitHub no admite dos a la vez en el mismo repositorio. La función las pone en cola y, si aun así GitHub responde con conflicto, espera y repite hasta cinco veces.

## Qué hace `exportar`

Cada noche deja en la carpeta `indice/` del repositorio de cada edificio cuatro CSV: documentos, instalaciones, revisiones y partes. Con ellos se puede leer el archivo sin la aplicación.

1. Pide los CSV a la base de datos, con `exportar_indice`. El formato está explicado en el README de la plantilla del edificio.
2. Los compara con los que hay en el repositorio.
3. Si alguno ha cambiado, los guarda todos en **un solo commit**, «Actualiza el índice (AAAA-MM-DD)». Si ninguno ha cambiado, no hace commit. Así el historial solo crece cuando hay algo nuevo.

Si un edificio falla, sigue con los demás. Al final responde con error, y en el registro de la función queda cuál ha fallado y por qué.

**Quién puede lanzarla.** Solo quien trae la clave secreta de Supabase en la cabecera `apikey`. Es lo que hace la tarea programada. La función la compara en su código, por eso lleva `verify_jwt = false` en `config.toml`, igual que `archivos`.

### Ponerla en marcha

Hace falta la GitHub App de `archivos`, con sus secretos. `exportar` usa los mismos.

**1. Publicarla.** Desde la raíz del repositorio:

```bash
npx supabase functions deploy exportar --project-ref <referencia-del-proyecto>
```

**2. Las extensiones.** En el panel: **Database → Extensions**. Activa `pg_cron`, que lanza tareas a una hora, y `pg_net`, que deja a la base de datos hacer peticiones a una dirección.

**3. Guardar la dirección y la clave en Vault.** Vault es la caja fuerte de Supabase: guarda los secretos cifrados dentro de la base de datos. En **SQL Editor**:

```sql
select vault.create_secret('https://<referencia>.supabase.co', 'url_proyecto');
select vault.create_secret('<la clave secreta, sb_secret_…>', 'clave_secreta');
```

La clave secreta está en **Project Settings → API Keys**. No la escribas en ningún archivo del repositorio.

**4. La tarea de cada noche.** También en **SQL Editor**. Se lanza a las 2:00 en hora universal: las 3:00 en invierno en España y las 4:00 en verano.

```sql
select cron.schedule('exportar-indice', '0 2 * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'url_proyecto') || '/functions/v1/exportar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'clave_secreta')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);
```

**5. Probarla sin esperar a la noche.** En **SQL Editor**, lanza lo mismo que la tarea:

```sql
select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name = 'url_proyecto') || '/functions/v1/exportar',
  headers := jsonb_build_object('apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'clave_secreta')),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
);
```

Al cabo de unos segundos, la respuesta está en `net._http_response`:

```sql
select status_code, content from net._http_response order by created desc limit 1;
```

Tiene que salir `200`, y en el repositorio del edificio, un commit «Actualiza el índice». Si lo lanzas otra vez sin cambios en el Libro, sale `200` con `"commit": null`, y no hay commit nuevo.

### Cómo saber si funciona cada noche

- **En GitHub:** el historial del repositorio del edificio tiene un commit «Actualiza el índice» los días que hubo cambios.
- **En Supabase:** las últimas ejecuciones de la tarea, con su resultado:

  ```sql
  select start_time, status, return_message from cron.job_run_details order by start_time desc limit 7;
  ```

- **En la oficina:** la copia tiene su propia comprobación. Está en la carpeta `copia/` del repositorio del edificio.
