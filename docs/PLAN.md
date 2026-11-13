# Libro del Edificio digital — Plan de proyecto (práctica)

> Documento de partida para un programador/a junior. Describe el problema, el alcance, la arquitectura propuesta y las tareas por fases, con criterios de aceptación. No hace falta saber nada de administración de fincas: el contexto necesario está en la sección 2.

---

## 1. El problema

Un administrador de fincas (y, más adelante, una gestoría con varios edificios) necesita llevar el registro y control del mantenimiento de los edificios que gestiona:

- Archivo de **licencias, permisos, certificados y contratos**, con sus caducidades.
- Registro de **todas las labores de mantenimiento** realizadas (preventivas, correctivas, inspecciones).
- **Contactos** de empresas mantenedoras, suministradoras, aseguradora, etc.
- **Consultas y alertas**: qué caduca, qué revisión está vencida, qué se ha hecho en cada instalación.

Hoy esto suele estar disperso en papel, carpetas y emails. Se quiere:

1. Una **aplicación web sencilla**: quien la usa busca, sube y elimina documentos sin saber dónde se guardan.
2. Un **formulario móvil** para quienes hacen el mantenimiento, que funcione también sin conexión.
3. Una **base de datos** con las fichas, las revisiones, los partes y los permisos.
4. Un **repositorio privado en GitHub** con los archivos de cada edificio, propiedad de quien lo gestiona.

El [prototipo navegable](https://claude.ai/artifact/LwqrqTDTS3DDUBRMBEQQBT) muestra cómo debe funcionar. Usa datos ficticios y es la referencia de pantallas y comportamiento.

### ¿Existe algo parecido en el mercado?

Sí, pero repartido en tres familias de producto que no cubren el conjunto:

| Familia | Ejemplos | Cubre | No cubre |
|---|---|---|---|
| Software de administración de fincas (ERP) | Cegid Finca3, Fincasoft, ADComunidad, Gesfincas, ResidenciAPP | Contabilidad, recibos, juntas, comunicación con vecinos, incidencias | Mantenimiento técnico serio, formulario de campo, control normativo |
| GMAO / CMMS (gestión de mantenimiento) | GMAO CLOUD, Gammeo, Mobility Work, openMAINT | Órdenes de trabajo, app móvil offline para técnicos, inventario de activos | Pensados para industria; complejos y caros para una comunidad; no conocen la normativa de edificación |
| Libro del Edificio digital | Libro del Edificio Digital del Colegio de Arquitectura Técnica de Barcelona, apps de colegios para redactar el LEEx | Estructura normativa del Libro | No son herramienta diaria del administrador ni de los técnicos |

**Hueco que cubre este proyecto:** el Libro del Edificio como documento vivo, alimentado por los partes de los técnicos, consultable por el administrador, con los archivos en un repositorio propio y exportación diaria de sus datos.

---

## 2. Contexto de dominio (lo mínimo que hay que saber)

El edificio piloto está en **Navarra**.

### Glosario

| Término | Qué es |
|---|---|
| **Comunidad de propietarios** | Conjunto de dueños de las viviendas de un edificio. Es la "clienta". |
| **Administrador de fincas** | Profesional (o gestoría) que gestiona la comunidad. Usuario principal del panel. |
| **IEE** — Informe de Evaluación del Edificio | Inspección técnica periódica del estado del edificio. En Navarra lo regula el Decreto Foral 108/2014. Tiene un resultado (Apto, Apto con deficiencias leves, No apto…) y una vigencia. |
| **LEEx** — Libro del Edificio Existente | Documento creado por el RD 853/2021. Incluye un **plan de uso y mantenimiento** y un **registro de operaciones de mantenimiento**. En Navarra es obligatorio desde el 1-1-2023 para edificios residenciales colectivos obligados a tener IEE, y se inscribe en el Registro General de Evaluación de Edificios de Navarra. Custodia y transmisión: arts. 2 y 3 del DF 322/2000. |
| **Cédula de habitabilidad** | Documento de cada vivienda. Para renovarla hace falta un IEE favorable cuando sea exigible. |
| **Instalación** | Ascensor, baja tensión, contraincendios, calefacción/ACS, gas, fontanería, telecomunicaciones (ICT), ventilación de garaje, puertas automáticas, pararrayos… Muchas tienen **revisiones/inspecciones obligatorias** por reglamento. |
| **Elemento constructivo** | Cubierta, fachada, estructura, carpinterías comunes. |
| **Mantenimiento preventivo** | Planificado (p. ej. revisión mensual del ascensor). |
| **Mantenimiento correctivo** | Reparar una avería. |
| **Parte de trabajo** | Registro de una intervención: quién, cuándo, qué, en qué instalación, con qué resultado. |
| **Empresa mantenedora** | Empresa externa contratada (y habilitada) para mantener una instalación. |

> ⚠️ Las periodicidades de revisión de cada reglamento **no se deben inventar ni copiar de internet sin verificar**. En el proyecto se guardan como datos configurables y marcados `verificado: false` hasta que un técnico competente los valide.

### Referencias normativas

- [DF 108/2014 (IEE Navarra)](https://vlex.es/vid/decreto-foral-108-2014-544051082)
- [ITE Navarra — disposiciones](https://normatia.com/es/normativa/ite-navarra/2015/disposiciones/)
- [Ley Foral 10/2010, disposición transitoria 14ª (LEEx obligatorio desde 2023)](https://www.iberley.es/legislacion/disposicion-transitoria-14-derecho-vivienda-navarra)
- [Contenido mínimo del LEEx (Anexo I, ejemplo CARM)](https://sede.carm.es/documentos/3781/Anexo%20I_Libro%20del%20Edificio%20existente.pdf)
- [Libro digital del edificio — GBC España](https://gbce.es/wp-content/uploads/2023/08/libro-digital-del-edificio_gbc-espana.pdf)

---

## 3. Usuarios y perfiles

| Perfil | Qué hace | Acceso |
|---|---|---|
| **Administración** | Gestiona documentos, instalaciones, empresas, revisiones y usuarios | Correo |
| **Consulta** | Ve todo el edificio, sin cambiar nada. Incluye al técnico redactor | Correo |
| **Guarda** | Registra comprobaciones e incidencias y consulta el archivo | Código con caducidad |
| **Empresa mantenedora** | Registra partes y certificados, y ve solo sus instalaciones | Código con caducidad |
| *(Fase 3)* Presidencia o vecinos | Avisan de incidencias y consultan documentos | Portal limitado |

Nadie necesita una cuenta de GitHub para usar la aplicación.

---

## 4. Alcance funcional (módulos)

1. **Ficha del edificio** — referencia catastral, año, capacidad, tipología y gestión.
2. **Inventario de instalaciones** — ficha por instalación: tipo, ubicación, marca, modelo, año, empresa mantenedora y documentos.
3. **Archivo documental** — buscar, explorar por instalación, tipo o año, descargar, subir y eliminar con papelera.
4. **Carga inicial** — herramienta local para clasificar y cargar muchos documentos de una vez, con revisión humana y aviso de duplicados.
5. **Revisiones** — plan por instalación, sugerido por plantillas y actualizado con cada parte vinculado.
6. **Partes de trabajo** — formulario móvil sin conexión: tipo, instalación, descripción, horas, materiales, fotos, certificado y firma. Los partes solo se añaden.
7. **Incidencias** — el guarda puede registrar una incidencia como parte. El circuito aviso → orden → parte → cierre queda para la fase 2.
8. **Contactos y empresas** — empresas y personas que trabajan en el edificio.
9. **Inicio** — qué necesita atención: documentos caducados o por caducar y revisiones vencidas o próximas.
10. **Usuarios, permisos y actividad** — alta y baja de accesos, y registro de quién cambia qué.
11. **Copia y salida** — exportación diaria al repositorio y copia en el ordenador de la oficina.

### Fuera de alcance

- Contabilidad, recibos, juntas y actas (eso ya lo hace el ERP de fincas).
- Redactar el IEE o el LEEx (lo hace un técnico competente; la app le da los datos).

---

## 5. Arquitectura

### 5.1 Principio: la aplicación oculta dónde se guardan las cosas

La persona trabaja con fichas y documentos, nunca con carpetas de GitHub. La base de datos es la fuente de verdad de las fichas y el repositorio guarda los archivos.

```text
Navegador o móvil
   │
   ├── datos ───────────────► Supabase: base de datos, usuarios y permisos
   │                               ▲
   └── archivos ──► Función de     │ registra la ficha
                    Supabase ──────┘
                       │
                       └── commit ──► Repositorio privado del edificio
                                              │
Ordenador de la oficina ◄── copia diaria ─────┘
   └── herramienta de carga: commit al repositorio + fichas en Supabase
```

| Dónde | Qué guarda |
|---|---|
| **Supabase** | Edificio, instalaciones, documentos (ficha y ruta), revisiones, partes, usuarios y actividad |
| **Repositorio del edificio** | PDF, fotos y firmas, más un índice exportado cada día |
| **Ordenador de la oficina** | Copia completa del repositorio, para consulta y custodia |

### 5.2 Repositorios

| Repositorio | Contenido | Visibilidad |
|---|---|---|
| `libro-edificio` | Código, base de datos, datos ficticios y documentación | Público |
| Uno por edificio | Archivos reales y su índice | Privado, de quien gestiona el edificio |

Estructura del repositorio de la aplicación:

```text
supabase/
  migrations/          ← tablas, permisos y datos comunes
  seed.sql             ← albergue ficticio
  tests/               ← comprobación de permisos
  functions/           ← archivos, acceso con código, exportación y alertas
herramientas/          ← escanear e importar
edificio-ejemplo-entrada/  ← carpetas desordenadas para probar la carga
app/                   ← PWA
docs/                  ← planes, guía y decisiones
```

Estructura del repositorio de cada edificio. La escribe la aplicación:

```text
documentos/2026/<id>.pdf
fotos/2026/<id>.jpg
firmas/2026/<id>.png
indice/                ← exportación diaria en CSV
README.md              ← explica cómo leer el archivo sin la aplicación
```

Los nombres no llevan títulos ni datos personales. El nombre recibido y el título están en la ficha.

### 5.3 Stack

| Pieza | Elección | Por qué |
|---|---|---|
| Lenguaje | **TypeScript** | Un solo lenguaje en la aplicación, las funciones y las herramientas |
| Frontend | **React + Vite**, PWA con `vite-plugin-pwa` | Estándar, con mucha documentación |
| Offline | **IndexedDB** como cola de partes pendientes | El parte se guarda en el móvil y se envía al recuperar cobertura |
| Base de datos | **Supabase (PostgreSQL)** | Base relacional con usuarios y permisos incluidos |
| Permisos | **Row Level Security** | La propia base de datos limita qué ve cada perfil |
| Funciones de servidor | **Supabase Edge Functions** | Guardan las claves de GitHub fuera del navegador |
| Escritura en GitHub | **GitHub App** instalada solo en el repositorio del edificio | Permisos acotados, sin tokens personales |
| Acceso | **Enlace por correo** para administración y consulta; **código con caducidad** para guarda y empresas | Sin contraseñas ni cuentas de GitHub |
| Alojamiento web | **Cloudflare Pages** | Sitio estático y subdominio por CNAME, sin mover el DNS |
| Alertas | **Función programada** y correo | Caducidades y revisiones vencidas |
| Tests | **Vitest**, **Playwright** y `supabase/tests/comprobar.mjs` | Lógica, modo offline y permisos |

### 5.4 Flujo de un documento

1. La persona elige el archivo y rellena su ficha.
2. La aplicación calcula la huella SHA-256 y avisa si el archivo ya existe.
3. La función comprueba el permiso con `puedo_archivar`.
4. La función escribe el archivo en el repositorio.
5. La función llama a `registrar_documento` con la sesión de esa persona.

Si el paso 5 falla, queda un archivo sin ficha. Es inofensivo y se detecta comparando rutas. Nunca debe quedar una ficha sin archivo.

Las descargas también pasan por la función, que comprueba el permiso antes de entregar el archivo. La aplicación no guarda enlaces directos a GitHub.

### 5.5 Flujo de un parte

```text
Formulario (quizá sin red)
   │ guarda parte, fotos e identificador en IndexedDB
   ▼ al volver la red
Función de archivos ──► commit de fotos y certificado
   ▼
Tabla partes ──► actualiza la revisión vinculada
```

El identificador lo crea el móvil, así reenviar un parte no lo duplica. Si el servidor lo rechaza, por ejemplo porque el código ha caducado, el parte debe seguir en el móvil y mostrar el motivo.

### 5.6 Límites a respetar

- **Archivos en GitHub:** 100 MB como máximo por archivo. Los mayores se reducen o se dejan fuera.
- **Tamaño del repositorio:** se recomienda no pasar de 10 GB. Las fotos se comprimen en el móvil.
- **Escrituras en GitHub:** deben ir de una en una. La función reintenta si hay conflicto.
- **Cargas grandes:** van por la herramienta local, en un único commit por lote.
- **Funciones de Supabase:** 256 MB de memoria y 150 segundos de espera. Empezamos con 25 MB por archivo en la web, a confirmar con pruebas.
- **Eliminar:** es enviar a la papelera. El archivo sigue en el historial de Git. Una supresión por RGPD exige reescribir ese historial y es un procedimiento excepcional.

### 5.7 Riesgos

- **Protección de datos:** hay datos de guardas y técnicos. Producción en una región concreta de la UE, repositorios privados y nada real en el repositorio público.
- **Secretos:** la clave de servicio de Supabase y la de la GitHub App solo van en los secretos de las funciones.
- **Permisos:** un error de permisos expone datos. Todo cambio lleva su comprobación automática.
- **Dependencia del proveedor:** PostgreSQL es estándar y el índice diario permite leer el archivo sin la aplicación.
- **Plan gratuito:** sirve para desarrollar, pero se pausa por inactividad y no tiene copias automáticas. Los datos reales requieren el plan Pro.

---

## 6. Plan de trabajo por fases

Cada tarea debe ir en su propia rama y entrar por **Pull Request** con descripción y capturas cuando aplique. Crear un *issue* de GitHub por tarea.

### Fase 0 — Cimientos

**Objetivo:** tener la base de datos funcionando y los documentos listos para cargarse.

| # | Tarea | Criterio de aceptación |
|---|---|---|
| 0.1 | Preparar el repositorio: README, autores, `.gitignore` y `.editorconfig` | Se clona y se entiende qué es leyendo el README |
| 0.2 | Revisar el prototipo y la base de datos | Un caso completo seguido en un proyecto Supabase de desarrollo, y las dudas comentadas |
| 0.3 | Ampliar los datos comunes con los tipos que falten | Cada periodicidad lleva `fuente` y `verificado = false` |
| 0.4 | Mantener los datos ficticios | Ya hecho en `seed.sql`: 6 instalaciones, 12 documentos, 20 partes y 4 revisiones |
| 0.5 | CI: migraciones y comprobación de permisos en cada push | Un permiso roto hace fallar el CI |
| 0.6 | Plantilla del repositorio de un edificio | Una copia sirve para empezar y su README explica cómo leerla sin la aplicación |
| 0.7 | **Carga local por lotes:** `escanear` e `importar` | Cargar `edificio-ejemplo-entrada/listado.csv` deja 12 documentos con las mismas huellas que `seed.sql`, y repetirlo no duplica nada |
| 0.8 | **Preparar el papel y otros formatos:** hojas separadoras, OCR y paso a PDF, todo en local y sin IA | Un PDF escaneado con hojas separadoras queda en un PDF con texto buscable por documento, listo para `escanear` |

**Punto de partida:** `supabase/` ya contiene el esquema, los datos comunes, el albergue ficticio y 69 comprobaciones. Hay que revisarlo y ampliarlo, no crearlo desde cero.

**Orden recomendado:** 0.1, 0.2 y **0.7, que es lo primero que se programa**. Después, 0.5, 0.3, 0.6 y 0.8.

**Cómo funciona la carga local:**

1. `escanear` lista carpetas y archivos en una hoja de cálculo, con huella y aviso de duplicados.
2. Una persona marca qué entra y rellena tipo, título, fecha, emisor e instalaciones.
3. `importar` comprueba toda la hoja con la base de datos, sin escribir nada. Con `--simular` se queda aquí.
4. Copia los archivos al clon del repositorio y hace un único commit y push.
5. Registra cada documento con `registrar_documento`, usando la sesión de una persona administradora.

El identificador se calcula a partir del edificio y la huella. Así, si la carga se corta, se puede repetir sin duplicar nada. La herramienta no usa nunca la clave de servicio.

**Aprendizaje:** SQL, modelado de datos, permisos, ficheros y herramientas de línea de comandos.

### Fase 1 — MVP

**Objetivo:** un edificio funcionando de punta a punta, tal como muestra el prototipo.

| # | Tarea | Criterio de aceptación |
|---|---|---|
| 1.1 | Esqueleto React + Vite + TS + PWA, conectado a Supabase y publicado | URL pública funcionando; la PWA se instala en el móvil |
| 1.2 | **Subir documentos desde la web:** subida múltiple, ficha por documento y aviso de duplicados | Se suben 10 PDF y aparecen en el archivo y en el repositorio |
| 1.3 | **Informe de huecos** sobre la vista `huecos` | Lista legible por instalación y exportable |
| 1.4 | **GitHub App y función de archivos:** subir y descargar con comprobación de permisos | Una empresa no descarga un documento ajeno aunque conozca su identificador |
| 1.5 | **Exportación diaria** de un índice CSV al repositorio y copia automática en el ordenador de la oficina | Tras la noche, la copia contiene los archivos y el índice del día anterior |
| 1.6 | **Formulario de parte:** instalación, tipo, revisión vinculada, fotos comprimidas y certificado | El guarda solo ve las opciones de su perfil |
| 1.7 | **Modo offline:** cola en IndexedDB, reintento e indicador de pendientes | Test con Playwright: el parte llega al reconectar y no se duplica |
| 1.8 | **Acceso:** correo para administración y consulta; código con caducidad para guarda y empresas | Un código caducado o desactivado deja de funcionar, también con la sesión abierta |
| 1.9 | **Panel:** Inicio, Archivo, Papelera y Configuración, como el prototipo | Navegable, con búsqueda y usable sin ayuda |
| 1.10 | **Alertas:** aviso diario por correo de caducidades y revisiones | Con datos de ejemplo se generan los avisos esperados |

**Aprendizaje:** PWA y offline, permisos, funciones de servidor, API de GitHub y tests e2e.

### Fase 2 — Mantenimiento planificado

| # | Tarea |
|---|---|
| 2.1 | Calendario preventivo a partir de la tabla `revisiones` |
| 2.2 | Códigos QR por instalación que abren el formulario con la instalación preseleccionada |
| 2.3 | Exportar el **registro de operaciones de mantenimiento** (PDF/CSV) en formato útil para el LEEx |
| 2.5 | Módulo de incidencias (aviso → orden → parte → cierre) |

### Fase 3 — Gestoría (varios edificios)

| # | Tarea |
|---|---|
| 3.1 | Panel de cartera: todos los edificios, semáforo de estado, alertas agregadas |
| 3.2 | Alta de edificio nuevo desde el panel, con su repositorio desde la plantilla |
| 3.3 | Portal de vecinos: aviso de incidencias y consulta de documentos públicos |
| 3.4 | Informes de gasto por instalación y comparativas entre edificios |

---

## 7. Normas de trabajo

- **Git:** rama `main` protegida; una rama por tarea (`feat/1.6-formulario-parte`); commits pequeños con mensajes claros; PR con revisión antes de fusionar.
- **Datos reales:** prohibidos en el repo de la app, en los tests y en el proyecto Supabase de desarrollo.
- **Secretos:** nunca en el código; usar los secretos de Supabase y de GitHub.
- **Base de datos:** cada cambio es una migración nueva y todo cambio de permisos lleva su comprobación.
- **Documentos internos:** `MODELO-NEGOCIO.md` y los contratos (acuerdo con la FNDME, convenio, cesión de derechos) no se suben a ningún repositorio.
- **Documentar decisiones:** cuando se elija algo no obvio, añadir una nota breve en `docs/decisiones/` (qué, por qué, alternativas descartadas).
- **Definición de "hecho":** código + tests + CI en verde + README actualizado si cambia cómo se usa.
- **Pedir ayuda pronto:** si una tarea se atasca más de medio día, se comenta en el issue.

---

## 8. Entregables y evaluación

Al final de cada fase:

1. Demo (10 min) del flujo principal.
2. Repos con CI en verde.
3. Breve nota de lo aprendido y lo que cambiaría.

Se valorará: claridad del modelo de datos, sencillez para quien usa la aplicación, que el modo offline funcione de verdad, calidad de los tests, seguridad (permisos, secretos y pruebas de acceso) y que el código sea legible por otra persona.

---

## 9. Preguntas abiertas (a resolver con el administrador)

- ¿Qué documentación existe hoy del edificio piloto y en qué formato? ¿Existe ya IEE y LEEx?
- ¿Qué empresas mantenedoras trabajan en el edificio y para qué instalaciones?
- ¿Quién validará las periodicidades de revisión de las plantillas?
- ¿Qué informes necesita el administrador con más frecuencia?
