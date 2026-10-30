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

1. Un **repositorio en GitHub** donde se archiva toda la documentación (fuente de verdad, versionada).
2. Una **aplicación web con un formulario** para los técnicos que hacen el mantenimiento (usable desde el móvil, también sin conexión).
3. Un **panel de administración** para consultas, alertas e informes.

### ¿Existe algo parecido en el mercado?

Sí, pero repartido en tres familias de producto que no cubren el conjunto:

| Familia | Ejemplos | Cubre | No cubre |
|---|---|---|---|
| Software de administración de fincas (ERP) | Cegid Finca3, Fincasoft, ADComunidad, Gesfincas, ResidenciAPP | Contabilidad, recibos, juntas, comunicación con vecinos, incidencias | Mantenimiento técnico serio, formulario de campo, control normativo |
| GMAO / CMMS (gestión de mantenimiento) | GMAO CLOUD, Gammeo, Mobility Work, openMAINT | Órdenes de trabajo, app móvil offline para técnicos, inventario de activos | Pensados para industria; complejos y caros para una comunidad; no conocen la normativa de edificación |
| Libro del Edificio digital | Libro del Edificio Digital del Colegio de Arquitectura Técnica de Barcelona, apps de colegios para redactar el LEEx | Estructura normativa del Libro | No son herramienta diaria del administrador ni de los técnicos |

**Hueco que cubre este proyecto:** el Libro del Edificio como documento vivo, alimentado por los partes de los técnicos, consultable por el administrador, con los datos en un repositorio propio (sin depender de un proveedor).

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

## 3. Usuarios y roles

| Rol | Qué hace | Acceso |
|---|---|---|
| **Administrador** | Consulta, da de alta documentos y contratos, recibe alertas, gestiona técnicos | Panel completo (login con GitHub) |
| **Técnico de mantenimiento** (varias empresas externas) | Rellena partes, adjunta fotos y certificados. Puede no tener cobertura. | Solo formulario PWA, **sin cuenta de GitHub**, solo los edificios/instalaciones asignados |
| **Técnico redactor** (arquitecto técnico) | Consulta histórico para hacer el IEE o el LEEx | Solo lectura |
| *(Fase 3)* Presidente / vecinos | Avisan de incidencias, consultan documentos | Portal limitado |

---

## 4. Alcance funcional (módulos)

1. **Ficha del edificio** — referencia catastral, año, nº viviendas y plantas, tipología; IEE (fecha, resultado, vigencia); inscripción del LEEx; cédula.
2. **Inventario de instalaciones y elementos** — ficha por elemento: marca, modelo, fecha de instalación, empresa mantenedora, documentos asociados.
3. **Archivo documental** — proyecto, planos, licencias, IEE, LEEx, boletines, actas de inspección, contratos, pólizas. Cada documento con metadatos: tipo, elemento, fecha de emisión, **fecha de caducidad**.
4. **Importación de documentación existente** — subida masiva + clasificación asistida + revisión humana + informe de huecos (ver tarea 1.2). Prioritario porque hay mucha documentación de volumen desconocido.
5. **Plan de mantenimiento y calendario** — revisiones obligatorias y preventivo configurables por instalación; generación de próximas tareas; avisos de vencimiento.
6. **Partes de trabajo** — formulario móvil offline: tipo, instalación, descripción, materiales, horas, fotos antes/después, certificado PDF, firma. Cada parte = una operación del registro del LEEx.
7. **Incidencias** — aviso → orden al proveedor → parte → cierre.
8. **Contactos y proveedores** — empresas, técnicos, suministradoras, aseguradora, emergencias; contratos vigentes y su vencimiento.
9. **Panel de administración** — cuadro de mando (caducidades, revisiones vencidas, incidencias abiertas), búsqueda, informes y exportación del registro de operaciones.
10. **Usuarios, permisos y auditoría** — roles, accesos de técnicos, trazabilidad (git ya da quién/cuándo).

### Fuera de alcance

- Contabilidad, recibos, juntas y actas (eso ya lo hace el ERP de fincas).
- Redactar el IEE o el LEEx (lo hace un técnico competente; la app le da los datos).

---

## 5. Arquitectura

### 5.1 Principio: GitHub es la fuente de verdad

Todo lo importante vive en repositorios Git como **texto legible (YAML) + PDFs**. La aplicación es una "vista" y un "editor" sobre esos datos. Si la app desaparece, el Libro sigue ahí, legible y con su historial.

### 5.2 Un repositorio por edificio, dentro de una organización

```
github.com/<organizacion-gestoria>/
  ├── edificio-<nombre>/          ← un repo privado por edificio
  ├── edificio-<otro>/
  ├── plantillas/                 ← tipos de instalación y periodicidades
  └── app/                        ← código de la aplicación
```

Motivos: permisos aislados por comunidad, repos de tamaño acotado y, si la comunidad cambia de administrador, **se transfiere el repo = se transfiere el Libro** (encaja con la obligación de transmisión del DF 322/2000).

Estructura de cada repo de edificio:

```
edificio.yaml
instalaciones/
  ascensor-1.yaml
  contraincendios.yaml
documentos/
  2023-iee-informe.pdf
  2023-iee-informe.yaml          ← metadatos del PDF
partes/
  2026/
    2026-10-26-ascensor-1-preventivo.yaml
incidencias/
contactos.yaml
plan-mantenimiento.yaml
```

Ejemplo de parte:

```yaml
id: 2026-10-26-ascensor-1-preventivo
fecha: 2026-10-26
instalacion: ascensor-1
tipo: preventivo            # preventivo | correctivo | inspeccion | urgencia
empresa: ascensores-norte
tecnico: j-perez
descripcion: Revisión mensual. Engrase de guías, prueba de rescate.
horas: 1.5
materiales: []
fotos:
  - r2://fotos/7f3a….jpg
certificado: documentos/2026-10-26-acta-ascensor.pdf
firma: r2://firmas/….png
```

### 5.3 Stack

| Pieza | Elección | Por qué |
|---|---|---|
| Lenguaje | **TypeScript** en todo el proyecto | Un solo lenguaje, tipos compartidos entre front y back |
| Frontend (panel + formulario) | **React + Vite**, PWA con `vite-plugin-pwa` | Estándar, mucha documentación |
| Offline | **IndexedDB** (p. ej. con `idb` o Dexie) como cola de partes pendientes; fotos comprimidas en el móvil | El técnico registra en un sótano y se sincroniza al recuperar cobertura |
| Backend | **Cloudflare Workers** | Sin servidor que mantener; capa gratuita suficiente |
| Escritura en GitHub | **GitHub App** de la organización (no tokens personales) | Permisos por repo; cada parte = un commit |
| Índice de consultas | **Cloudflare D1** (SQLite), reconstruido desde los repos vía webhook | Panel rápido; si el índice se rompe, se regenera desde Git |
| Fotos y firmas | **Cloudflare R2**, referenciadas desde el YAML con hash | Evita inflar los repos con imágenes |
| PDFs y documentos | **Dentro del repo** | Son el Libro; deben estar versionados (ojo: límite de 100 MB por archivo en GitHub) |
| Validación de datos | **JSON Schema** (o Zod) para cada tipo de YAML | El repo nunca debe contener datos inválidos |
| Auth técnicos | Enlace mágico por email o código por empresa, con caducidad | Sin contraseñas ni cuentas de GitHub |
| Auth administrador | Login con GitHub (OAuth) | Ya tiene permisos en la organización |
| Alertas | Cron Trigger diario de Workers + email | Caducidades y revisiones vencidas |
| Tests | **Vitest** (unidad) y **Playwright** (e2e, incluido modo offline) | |

### 5.4 Flujo de un parte de trabajo

```
Técnico (PWA, quizá sin red)
   │ guarda parte + fotos en IndexedDB
   ▼ (al volver la red)
Worker /api/partes
   │ valida contra el schema, comprueba permisos del técnico
   │ sube fotos a R2
   │ hace commit del YAML en el repo del edificio (GitHub App)
   ▼
GitHub ──webhook──► Worker indexador ──► D1
                                          ▲
Panel de administración ──consultas───────┘
```

### 5.5 Riesgos a tener presentes

- **Protección de datos (RGPD):** hay datos personales de vecinos y técnicos. Repos **privados**, nada de datos reales en el repo de la app ni en los tests.
- **Secretos:** claves de la GitHub App y de Cloudflare solo en variables de entorno / secrets. Nunca en el código.
- **Conflictos de sincronización offline:** dos técnicos editando lo mismo. Regla simple: los partes solo se **añaden**, nunca se editan desde el móvil.
- **Tamaño de los repos:** fotos fuera (R2); PDFs grandes, valorar compresión.

---

## 6. Plan de trabajo por fases

Cada tarea debe ir en su propia rama y entrar por **Pull Request** con descripción y capturas cuando aplique. Crear un *issue* de GitHub por tarea.

### Fase 0 — Cimientos (sin app todavía)

**Objetivo:** definir el modelo de datos y tener un edificio de ejemplo válido.

| # | Tarea | Criterio de aceptación |
|---|---|---|
| 0.1 | Crear repo `app` (público, licencia **Apache 2.0**, fichero de autores) con README, `.gitignore` y `.editorconfig`. Este plan y `PLAN-BELAGUA.md` ya están en `docs/` (**no** se sube `MODELO-NEGOCIO.md`: es interno) | El repo se clona y se entiende qué es leyendo el README |
| 0.2 | Escribir JSON Schemas: `edificio`, `instalacion`, `documento`, `parte`, `contacto`, `plan-mantenimiento` | Cada schema tiene descripción por campo y un ejemplo válido y otro inválido |
| 0.3 | Crear repo `plantillas` con tipos de instalación y sus revisiones típicas | Cada periodicidad lleva `fuente` y `verificado: false` |
| 0.4 | Crear `edificio-ejemplo` con **datos ficticios** (≥5 instalaciones, ≥10 documentos, ≥20 partes) | Todos los YAML validan contra los schemas |
| 0.5 | Script `validar` (Node/TS) + GitHub Action que valida todos los YAML en cada push | Un YAML inválido hace fallar el CI |

**Aprendizaje:** modelado de datos, JSON Schema, GitHub Actions.

### Fase 1 — MVP

**Objetivo:** un edificio funcionando de punta a punta.

| # | Tarea | Criterio de aceptación |
|---|---|---|
| 1.1 | Esqueleto React + Vite + TS + PWA; Worker con endpoint `/api/health`; despliegue en Cloudflare | URL pública funcionando; la PWA se puede instalar en el móvil |
| 1.2 | **Importación de documentos**: subida múltiple, formulario de metadatos por documento, commit al repo. *Ampliación opcional:* sugerencia automática de tipo y fechas con la API de Claude, siempre con revisión humana | Se suben 10 PDFs y aparecen en `documentos/` con su YAML válido |
| 1.3 | **Informe de huecos**: por instalación, qué documentos obligatorios faltan según la plantilla | Lista legible en el panel |
| 1.4 | GitHub App + Worker que hace commits en el repo del edificio | Un parte enviado por API aparece como commit con autor/mensaje claros |
| 1.5 | Indexador: webhook de GitHub → D1 | Tras un push, el panel muestra el dato nuevo en < 1 min |
| 1.6 | **Formulario de parte (PWA)**: selección de instalación, campos del schema, fotos comprimidas, firma | Validación en cliente con el mismo schema |
| 1.7 | **Modo offline**: cola en IndexedDB y reintento al volver la red; indicador "pendiente de enviar" | Test e2e con Playwright simulando offline: el parte llega tras reconectar |
| 1.8 | Acceso de técnicos por enlace mágico; cada técnico solo ve sus edificios/instalaciones | Un técnico no puede enviar partes de un edificio no asignado (test) |
| 1.9 | **Panel**: ficha del edificio, inventario, documentos con filtro, histórico de partes por instalación | Navegable y con búsqueda |
| 1.10 | **Alertas**: cron diario que detecta caducidades a 30/60/90 días y revisiones vencidas, y envía email | Con datos de ejemplo se generan las alertas esperadas (test unitario) |

**Aprendizaje:** PWA y offline, APIs de GitHub, serverless, autenticación, tests e2e.

### Fase 2 — Mantenimiento planificado

| # | Tarea |
|---|---|
| 2.1 | Calendario preventivo: generar tareas a partir de `plan-mantenimiento.yaml` y marcarlas como hechas al llegar el parte correspondiente |
| 2.2 | Códigos QR por instalación que abren el formulario con la instalación preseleccionada |
| 2.3 | Exportar el **registro de operaciones de mantenimiento** (PDF/CSV) en formato útil para el LEEx |
| 2.4 | Gestión de empresas y técnicos desde el panel (alta, baja, asignaciones) |
| 2.5 | Módulo de incidencias (aviso → orden → parte → cierre) |

### Fase 3 — Gestoría (varios edificios)

| # | Tarea |
|---|---|
| 3.1 | Panel de cartera: todos los edificios, semáforo de estado, alertas agregadas |
| 3.2 | Alta de edificio nuevo desde el panel (crea el repo desde una plantilla) |
| 3.3 | Portal de vecinos: aviso de incidencias y consulta de documentos públicos |
| 3.4 | Informes de gasto por instalación y comparativas entre edificios |

---

## 7. Normas de trabajo

- **Git:** rama `main` protegida; una rama por tarea (`feat/1.6-formulario-parte`); commits pequeños con mensajes claros; PR con revisión antes de fusionar.
- **Datos reales:** prohibidos en el repo de la app y en los tests. Solo `edificio-ejemplo` con datos ficticios.
- **Secretos:** nunca en el código; usar `wrangler secret` y GitHub Secrets.
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

Se valorará: claridad del modelo de datos, que el modo offline funcione de verdad, calidad de los tests, seguridad (permisos y secretos) y que el código sea legible por otra persona.

---

## 9. Preguntas abiertas (a resolver con el administrador)

- ¿Qué documentación existe hoy del edificio piloto y en qué formato? ¿Existe ya IEE y LEEx?
- ¿Qué empresas mantenedoras trabajan en el edificio y para qué instalaciones?
- ¿Quién validará las periodicidades de revisión de las plantillas?
- ¿Qué informes necesita el administrador con más frecuencia?
