# Aplicación web

La web del Libro del Edificio. Es una PWA: se abre en el navegador y también se puede instalar en el móvil como una app.

De momento es un esqueleto. Deja entrar con el correo y muestra el nombre del edificio.

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
| `public/` | Iconos de la app |
| `tests/` | Tests |
