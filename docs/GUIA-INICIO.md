# Guía de inicio paso a paso

Esta guía te lleva desde cero hasta tu primer Pull Request y te indica por dónde seguir. Hazla en orden y a tu ritmo: no hay horario ni plazos.

El detalle de cada tarea está en su [issue](https://github.com/abauntz-sw/libro-edificio/issues). Esta guía te dice en qué orden abordarlas y cómo trabajar.

**¿Qué hago ahora?** Abre el issue con la etiqueta [`siguiente`](https://github.com/abauntz-sw/libro-edificio/issues?q=is%3Aopen+label%3Asiguiente). Siempre hay solo uno.

Si algo no funciona o no se entiende, pregunta. El tutor del proyecto es Txin.

## Antes de empezar: cómo está montado

Prueba primero el [prototipo](https://claude.ai/artifact/LwqrqTDTS3DDUBRMBEQQBT). Es lo que vamos a construir: la persona que usa el Libro busca, sube y elimina documentos sin saber dónde se guardan.

Por detrás hay cuatro piezas:

| Pieza | Qué hace |
|---|---|
| **Aplicación web** | Lo que usan administración, guarda y empresas |
| **Supabase** | Base de datos PostgreSQL con fichas, partes, usuarios y permisos |
| **Repositorio privado del edificio** | PDF, fotos y firmas |
| **Herramienta de carga** | Carga muchos documentos desde el ordenador de la oficina |

El código vive en un repositorio y los datos reales en otro sitio:

| | Sistema | Refugio |
|---|---|---|
| **Repositorio** | [`abauntz-sw/libro-edificio`](https://github.com/abauntz-sw/libro-edificio) | [`nafarmendi/libro-refugio-belagua`](https://github.com/nafarmendi/libro-refugio-belagua) |
| **Visibilidad** | Público | Privado |
| **Qué contiene** | Código, base de datos, datos ficticios, planes e issues | Archivos reales del refugio |

**La regla:** lo que sirve para cualquier edificio va al repositorio público. Lo que es del Refugio de Belagua nunca va ahí.

Por ahora trabajarás con datos ficticios. Tendrás acceso a lo real cuando estén firmados los acuerdos del piloto.

## Paso 1. Instala las herramientas

Instala estos programas:

1. [Git](https://git-scm.com/downloads)
2. [Node.js](https://nodejs.org/), versión LTS
3. [GitHub CLI](https://cli.github.com/) (`gh`), que facilita iniciar sesión en GitHub desde la terminal
4. Un editor de código, por ejemplo [VS Code](https://code.visualstudio.com/)

Comprueba en una terminal que todo responde con un número de versión:

```bash
git --version
node --version
gh --version
```

## Paso 2. Configura Git y GitHub

Inicia sesión y elige GitHub.com, HTTPS y el navegador cuando te pregunte:

```bash
gh auth login
gh auth setup-git
```

Indica a Git quién eres. Como el repositorio es público, tu correo de los commits será visible. Para no exponerlo, usa la dirección privada que aparece en [github.com/settings/emails](https://github.com/settings/emails), con la forma `12345678+usuario@users.noreply.github.com`:

```bash
git config --global user.name "Tu nombre"
git config --global user.email "tu-direccion-noreply@users.noreply.github.com"
```

## Paso 3. Clona el repositorio

Ve a la carpeta donde quieras tener el proyecto y ejecuta:

```bash
git clone https://github.com/abauntz-sw/libro-edificio.git
cd libro-edificio
```

## Paso 4. Sesión de arranque (issue #1)

No hace falta que leas los planes enteros ni que lo entiendas todo antes de empezar. Los repasamos juntos.

1. Prueba el [prototipo](https://claude.ai/artifact/LwqrqTDTS3DDUBRMBEQQBT) con los tres perfiles: administración, guarda y empresa.
2. Echa un vistazo a [`PLAN-BELAGUA.md`](PLAN-BELAGUA.md), sobre todo a las secciones 1 a 4. Si te apetece más, sigue con [`PLAN.md`](PLAN.md), secciones 1, 3, 4, 5 y 7. Donde los dos planes difieran, manda `PLAN-BELAGUA.md`.
3. Apunta lo que te llame la atención, aunque sea un «esto no lo entiendo».
4. Quedamos una hora por videollamada. Repasamos el prototipo y los planes, resolvemos tus dudas y hacemos juntos el paso 5 compartiendo pantalla.

Cierras el issue #1 después de la sesión.

## Paso 5. Haz tu primer Pull Request (issue #2)

Este paso sirve para practicar el ciclo completo. La tarea es sencilla a propósito.

Si no da tiempo a hacerlo juntos en la sesión de arranque, hazlo por tu cuenta y Txin lo revisa.

**5.1. Asígnate el [issue #2](https://github.com/abauntz-sw/libro-edificio/issues/2)** con **Assignees → assign yourself** y lee qué pide. El `LICENSE` ya está añadido, así que no tienes que crearlo.

**5.2. Crea una rama** a partir de `main` actualizado:

```bash
git switch main
git pull
git switch -c feat/0.1-preparar-repo
```

**5.3. Crea los ficheros** en la raíz del repositorio:

- `README.md`: qué es el proyecto, cómo se arranca y enlaces a los planes. De momento, «cómo se arranca» puede decir que aún no hay aplicación.
- `AUTHORS`: tu nombre.
- `.gitignore`: como mínimo, `node_modules/`, `dist/`, `.env` y `supabase/.temp/`.
- `.editorconfig`: formato común, como UTF-8, sangría y fin de línea.

**5.4. Revisa y guarda los cambios.** Comprueba qué vas a incluir y confirma:

```bash
git status
git add README.md AUTHORS .gitignore .editorconfig
git commit -m "Añade README, autores y configuración del repositorio"
```

**5.5. Sube la rama:**

```bash
git push -u origin feat/0.1-preparar-repo
```

**5.6. Abre el Pull Request.** Entra en el repositorio, pulsa **Compare & pull request** y explica en la descripción qué has hecho. Añade esta línea para que el issue se cierre solo al fusionar:

```text
Closes #2
```

**5.7. Espera la revisión.** Txin lo revisará y te dejará comentarios si hay algo que cambiar. Para corregirlo, sigue en la misma rama:

```bash
git add README.md
git commit -m "Corrige los enlaces del README"
git push
```

El Pull Request se actualiza solo. Después pide otra revisión, porque cada cambio nuevo anula la aprobación anterior.

**5.8. Fusiona.** Cuando esté aprobado, pulsa **Merge pull request** en GitHub. Después, actualiza tu copia y borra la rama local:

```bash
git switch main
git pull
git branch -d feat/0.1-preparar-repo
```

## Paso 6. Repite el ciclo en cada tarea

`main` está protegida, así que todo entra por Pull Request con una aprobación.

1. Asígnate el issue y lee sus secciones **Qué hay que hacer**, **Hecho cuando** y **Referencias**.
2. Actualiza `main` y crea una rama, por ejemplo `feat/1.6-formulario-parte`.
3. Trabaja con commits pequeños y mensajes claros.
4. Antes de abrir el Pull Request, comprueba la definición de hecho: código, tests, CI en verde y README actualizado si cambia cómo se usa.
5. Abre el Pull Request con `Closes #N` y capturas si aplica.
6. Atiende la revisión y fusiona cuando esté aprobado.
7. Txin pasa la etiqueta `siguiente` al próximo issue.

### Trabaja con un agente de IA

Haz el paso 5 a mano, porque es tu ejercicio para aprender Git. Desde el paso 6 trabaja con [Claude Code](https://claude.com/product/claude-code), con el plan Pro. Es la herramienta del proyecto: el agente escribe el código y tú lo diriges y lo revisas.

- **Ábrelo en la raíz del repositorio.** Al empezar lee [`CLAUDE.md`](../CLAUDE.md), que recoge las reglas del proyecto. Si una regla cambia, actualízalo en el mismo Pull Request.
- **Dale el issue como punto de partida.** Por ejemplo: «Lee el issue #5 y explícame cómo lo harías antes de cambiar nada».
- **Pídele que lo pruebe.** Que ejecute las comprobaciones y te enseñe el resultado antes de hacer commit.

Dos normas para usarlo:

- **Revisa todo lo que proponga.** Entiende cada cambio antes de hacer commit. Si no lo entiendes, pide que te lo explique. El objetivo es que aprendas, no solo que la tarea salga.
- **No le des datos reales.** Ningún documento ni dato personal del refugio en cuentas personales de IA. Cuando trabajes con el repositorio privado, Txin te indicará qué herramientas y cuentas se pueden usar.

## Paso 7. Sigue los milestones en orden

Los issues están agrupados en [milestones](https://github.com/abauntz-sw/libro-edificio/milestones) numerados. Ve del 1 al 7, y dentro de cada uno, por el orden de la tabla:

| Milestone | Issues | Qué hay que conseguir |
|---|---|---|
| [1 · Arranque](https://github.com/abauntz-sw/libro-edificio/milestone/1) | #1, #2 | Entorno listo, sesión de arranque y primer Pull Request |
| [2 · Base de datos](https://github.com/abauntz-sw/libro-edificio/milestone/6) | #5, #8 | Entender la base de datos en un Supabase de pruebas y comprobarla en cada push |
| [3 · Carga local](https://github.com/abauntz-sw/libro-edificio/milestone/7) | #28, #29, #6 | Tu primer programa: cargar documentos por lotes |
| [4 · Refugio real](https://github.com/abauntz-sw/libro-edificio/milestone/8) | #3, #4, #9, #10, #11, #30 | Conocer el refugio y su documentación, y cargarla |
| [5 · App y documentos](https://github.com/abauntz-sw/libro-edificio/milestone/2) | #12, #13, #14, #15, #31 | La aplicación web con el archivo de documentos |
| [6 · Partes de trabajo](https://github.com/abauntz-sw/libro-edificio/milestone/3) | #16, #17, #18, #19 | Registrar partes desde el móvil, también sin cobertura |
| [7 · Panel y cierre](https://github.com/abauntz-sw/libro-edificio/milestone/4) | #20, #21, #22, #23 | Panel, alertas, guía de uso y demo final |
| [Extras](https://github.com/abauntz-sw/libro-edificio/milestone/5) | #24, #25, #26 | Solo si sobra tiempo |

Del 1 al 3 se trabaja con datos ficticios y puedes hacerlos ya. El 4 depende de que se firmen los acuerdos, llegue la documentación y haya fecha de visita. Cuando llegue, se intercala con lo que estés haciendo.

La base ya está en el repositorio:

| Carpeta | Qué contiene |
|---|---|
| `supabase/migrations/` | Tablas, permisos y datos comunes |
| `supabase/seed.sql` | Un albergue ficticio completo |
| `supabase/tests/` | Comprobación de lo que puede hacer cada perfil |
| `edificio-ejemplo-entrada/` | Carpetas desordenadas y su listado, para probar la carga |

Podrá cambiar cuando veas el refugio y su documentación.

## Reglas importantes

- **Datos reales:** nunca en el repositorio público, en tests, commits o comentarios de issues, ni en un proyecto Supabase de desarrollo. Eso incluye nombres, teléfonos, documentos y fotos del refugio. Los issues también son públicos.
- **Claves y contraseñas:** nunca en el código. La clave de servicio de Supabase solo va en los secretos de las funciones.
- **Permisos:** todo cambio de permisos lleva su comprobación en `supabase/tests/comprobar.mjs`.
- **Base de datos:** cada cambio es una migración nueva. No edites una ya aplicada.
- **Normativa:** ninguna periodicidad se da por buena sin fuente y sin revisión. Márcala con `verificado = false`.
- **Empresas mantenedoras:** no contactes con ellas sin el visto bueno de Txin y de la FNDME.
- **Decisiones técnicas:** si eliges algo que no es obvio, deja una nota breve en `docs/decisiones/`: qué eliges, por qué y qué descartas.

## Si te atascas

Si llevas más de medio día con algo, coméntalo en el issue y explica qué has probado. Usa las etiquetas `pregunta` o `bloqueado` para que se vea rápido. Pedir ayuda pronto forma parte del trabajo.

Si tienes dudas de Git, antes de intentar arreglar algo a la fuerza, pregunta. Casi todo se puede deshacer, y `git status` suele ser el mejor primer paso.

## Vocabulario básico

| Término | Qué es |
|---|---|
| **Issue** | Ficha de una tarea o duda en GitHub |
| **Milestone** | Grupo de issues que forman un bloque de trabajo |
| **Rama** | Línea de trabajo separada de `main` |
| **Commit** | Cambio guardado en el historial |
| **Pull Request (PR)** | Propuesta para incorporar una rama a `main`, con revisión |
| **CI** | Comprobaciones automáticas que se ejecutan al subir cambios |
| **Migración** | Archivo SQL que cambia la base de datos de forma ordenada |
| **RLS** | Row Level Security: reglas de la base de datos que limitan las filas que ve cada usuario |
| **Edge Function** | Pequeño programa en el servidor de Supabase, con acceso a las claves |
