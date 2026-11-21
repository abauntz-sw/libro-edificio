# Aplicación web

La web del Libro del Edificio. Es una PWA: se abre en el navegador y también se puede instalar en el móvil como una app.

De momento es un esqueleto. Deja entrar con el correo, muestra el nombre del edificio y el informe de huecos, deja subir documentos y registrar partes.

## Subir documentos

La administración y las empresas pueden subir PDF desde la web, sin herramientas ni Git. La guarda y la consulta no ven el botón.

1. Se eligen o se arrastran los PDF. Cada uno, como mucho, 25 MB.
2. La web comprueba cada archivo antes de subir nada:
   - Si pasa del límite o no es un PDF, lo dice y no lo sube.
   - Calcula su huella (`sha256`) en el navegador. Si ese mismo archivo ya está en el Libro, o se repite en la tanda, avisa. Se puede quitar o guardar igualmente.
3. Se rellena la ficha de cada uno: título, tipo, fecha, caducidad e instalaciones. Una empresa tiene que marcar al menos una instalación suya.
4. **Guardar** manda los archivos uno a uno a la función `archivos`, que los guarda en el repositorio del edificio y crea su ficha.

Cada archivo lleva un identificador desde que se elige. Si una subida falla, por ejemplo por la cobertura, se pulsa Guardar otra vez y no se duplica nada.

El aviso de duplicados solo encuentra lo que la persona puede ver: una empresa no sabe si otra ya subió ese archivo.

## Informe de huecos

Dice qué documentos faltan en cada instalación y deja descargarlo en CSV. Sale de la vista `huecos` de la base de datos: lo que la plantilla pide para cada tipo de instalación y la instalación no tiene. Un documento en la papelera no cuenta.

La vista respeta los permisos: una empresa solo ve los huecos de su instalación. El CSV tiene el mismo formato que el índice del repositorio del edificio, para que Excel lo abra bien. Se crea en el navegador, sin pasar por ningún servidor.

## Registrar parte

Para anotar una intervención desde el móvil en menos de un minuto. Lo ven la administración, la guarda y las empresas. La consulta no.

1. **¿Dónde?** Las instalaciones que la persona ve, menos las que no aplican. Una empresa solo ve la suya.
2. **¿Corresponde a una revisión prevista?** Solo salen las revisiones que esa persona tiene a su cargo; la administración ve todas.
   - Si la revisión tiene periodicidad, la pantalla dice a qué fecha pasará la próxima. La calcula la base de datos al guardar el parte.
   - Si no la tiene, pide la próxima fecha, que tiene que ser posterior a hoy.
3. **¿Qué has hecho?** Solo los tipos de ese perfil: la guarda, comprobación o incidencia; las empresas, preventivo, reparación, inspección o urgencia.
4. **Una frase**.
5. **Añadir certificado**, si se quiere. Solo para la administración y las empresas: la guarda no archiva documentos. Un PDF de hasta 25 MB.
6. **Enviar parte**.

El parte se guarda en la tabla `partes`, con la fecha de hoy del aparato. La base de datos pone el edificio, el autor y la empresa, y vuelve a comprobar que ese perfil pueda registrarlo.

El identificador del parte se crea en el móvil al empezarlo. Si el envío falla y se repite, la base de datos ve que ya lo tiene y no lo duplica.

Un parte no se cambia ni se borra. Una corrección es un parte nuevo.

El certificado se archiva como documento de tipo «Certificado», de la instalación del parte, con la función `archivos`. Va antes que el parte, porque el parte lo apunta en `certificado_id` y la base de datos no deja apuntar un documento que no existe. Su identificador se crea al elegir el archivo, así que reenviarlo tampoco duplica nada. Si el certificado no se puede archivar (por ejemplo, porque no es un PDF), el parte tampoco se envía, y la pantalla dice por qué.

Todavía no lleva fotos: llegarán en un paso siguiente.

## Sin cobertura

En el refugio a menudo no hay red. Ningún parte se pierde por eso:

1. **El parte se guarda primero en el móvil**, en IndexedDB, con una copia de su certificado si lo lleva, y luego se envía. Solo se borra del móvil cuando la base de datos lo ha aceptado.
2. **Si no hay red**, la pantalla lo dice y el parte queda pendiente. En Inicio se ve cuántos quedan, con un botón «Enviar ahora».
3. **Se reintenta solo** al abrir la aplicación, al volver la conexión y al volver a la pestaña. No se depende de que el navegador envíe en segundo plano, porque Safari, en iPhone, no lo hace.
4. **Nunca se duplica.** El identificador del parte lo crea el móvil, y la base de datos ignora uno que ya tiene. Da igual si la respuesta se perdió por el camino.
5. **Si la base de datos lo rechaza** (por ejemplo, porque la revisión ya no está a cargo de esa persona), no se reintenta: se conserva con el motivo. La persona lo ve en Inicio y decide si lo descarta.
6. **El formulario se abre sin red**, con las instalaciones y revisiones de la última vez que hubo conexión. No da ningún permiso: al enviar, la base de datos lo comprueba todo otra vez.
7. **Se pide almacenamiento persistente**, para que el navegador no borre los partes guardados si falta espacio o la app no se usa en días.

En un móvil compartido, cada persona solo envía los suyos. Al salir con partes pendientes, la aplicación avisa: se quedan en el móvil y se envían cuando esa persona vuelva a entrar.

Un envío que tarda más de 20 segundos se da por no llegado. Si en realidad llegó, el siguiente intento no lo duplica.

## Cómo se arranca

Hace falta Node.js. Desde esta carpeta:

```bash
npm install
```

Copia `.env.ejemplo` como `.env` y rellénalo con la dirección del proyecto de Supabase y su **clave pública**. Git ignora `.env`.

```bash
npm run dev
```

Abre la dirección que aparece, normalmente `http://localhost:5173`.

## Órdenes

| Orden | Qué hace |
|---|---|
| `npm run dev` | Arranca la web en tu ordenador. Se recarga sola al guardar |
| `npm test` | Ejecuta los tests |
| `npm run tipos` | Comprueba los tipos de TypeScript |
| `npm run build` | Construye la web en `dist/`, lista para publicar |
| `npm run preview` | Sirve `dist/`, para probarla como quedará publicada |
| `npm run iconos` | Vuelve a crear los iconos a partir de `public/icono.svg` |
| `npm run e2e` | Tests de extremo a extremo con Playwright: la web construida, en un navegador de verdad |

### Tests de extremo a extremo

Están en `e2e/`. Comprueban, cortando y devolviendo la red, que un parte llega al reconectar y no se duplica, también con su certificado. No usan ningún proyecto de Supabase: `e2e/supabase-falso.ts` contesta por él con datos ficticios.

La primera vez hay que descargar el navegador: `npx playwright install chromium`. En Windows también sirve Edge, sin descargar nada: `PLAYWRIGHT_CANAL=msedge npm run e2e` (en PowerShell, `$env:PLAYWRIGHT_CANAL='msedge'; npm run e2e`).

## Cómo se entra

1. La persona escribe su correo.
2. Supabase le envía un mensaje con un enlace y un código.
3. Pulsa el enlace o escribe el código.

Solo entra quien ya tiene cuenta en Supabase y ficha en la tabla `usuarios`. No hay contraseñas. El acceso con código para guarda y empresas llegará con la tarea 1.8.

Para que el enlace del correo vuelva a la web, su dirección tiene que estar en Supabase, en **Authentication → URL Configuration → Redirect URLs**. Añade `http://localhost:5173` y la dirección pública.

El plan gratuito de Supabase envía muy pocos correos por hora. La sesión se guarda en el navegador, así que no hay que entrar cada vez.

## Claves

- La aplicación usa solo la **clave pública**. Sin una persona conectada no da acceso a nada.
- Lo que empieza por `VITE_` acaba dentro de la web y lo puede leer cualquiera. Por eso la **clave de servicio** no va aquí nunca. Si alguien la pone por error, `npm run build` se para y lo dice.

## Publicación

El sitio va en Cloudflare Pages, conectado a este repositorio:

| Ajuste | Valor |
|---|---|
| Carpeta raíz | `app` |
| Orden de construcción | `npm run build` |
| Carpeta de salida | `dist` |
| Variables | `VITE_SUPABASE_URL` y `VITE_SUPABASE_CLAVE_PUBLICA` |

Después, añade la dirección pública a las Redirect URLs de Supabase.

## Código

| Archivo | Qué hace |
|---|---|
| `index.html` | La página. Carga `src/main.tsx` |
| `vite.config.ts` | Configura Vite y la PWA: nombre, colores e iconos |
| `src/main.tsx` | Arranca la aplicación y conecta con Supabase |
| `src/configuracion.ts` | Lee la dirección y la clave pública, y rechaza la clave de servicio |
| `src/App.tsx` | Decide qué pantalla toca según haya sesión o no |
| `src/Entrada.tsx` | Pantalla para entrar con el correo |
| `src/Inicio.tsx` | Lo que se ve al entrar: cabecera y nombre del edificio |
| `src/acceso.ts` | Lee quién es la persona conectada y cuál es su edificio |
| `src/Mensaje.tsx` | Pantalla con un solo mensaje |
| `src/estilos.css` | Colores y letras, tomados del prototipo |
| `src/cola.ts` | Los partes guardados en el móvil hasta que llegan |
| `src/recuerdo.ts` | Lo último que se leyó bien, para trabajar sin red |
| `src/Pendientes.tsx` | El aviso de partes sin enviar y de los rechazados |
| `public/` | Iconos de la app |
| `tests/` | Tests |
| `e2e/` y `playwright.config.ts` | Tests de extremo a extremo |
