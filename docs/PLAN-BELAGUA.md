# Piloto: Refugio de Belagua — Plan de desarrollo

> Documento de trabajo para el colaborador/a. Complementa a `PLAN.md`, que sigue siendo la referencia técnica (arquitectura, tecnología y normas de trabajo). **Donde este documento y `PLAN.md` difieran, manda este.**
> Revisado: 2026-11-13, tras el prototipo, la elección de Supabase y el acuerdo de que los servicios de producción estén a nombre de la FNDME. Colaboración **voluntaria y no retribuida**, con fin de aprendizaje, de unos **3 meses a ~20 h/semana orientativas** (≈ 250 h). No hay horario obligatorio: el calendario es una guía, no una obligación. El calendario (sección 6) usa 12 semanas más 1 de margen y aplica los recortes de la sección 6.0.

---

## 1. Objetivo del piloto

Tener el **Libro del Edificio digital del Refugio de Belagua** funcionando con datos reales:

1. Toda la documentación existente del refugio cargada, clasificada y con un informe de lo que falta.
2. Inventario de instalaciones con su plan de revisiones.
3. Guarda y empresas mantenedoras registrando partes desde el móvil, también sin cobertura.
4. FNDME recibiendo alertas de caducidades y revisiones vencidas.

**Éxito al final de la colaboración:** durante las 3 últimas semanas, todas las intervenciones de mantenimiento del refugio se registran en la app y la FNDME consulta el estado del edificio sin pedir papeles a nadie.

---

## 2. El edificio y quién está detrás

| Dato | Valor | Estado |
|---|---|---|
| Edificio | Refugio de Belagua (Valle de Roncal, Navarra), ~1.400 m de altitud | — |
| Gestión | Federación Navarra de Deportes de Montaña y Escalada (FNDME), mediante concesión | Confirmar con FNDME |
| Propiedad del edificio | Desconocida | **Preguntar** |
| Historia | Abierto en 1971, cerrado en 2004, reformado y reabierto c. 2020 (proyecto de la FNDME de 760.000 €, cofinanciado por el Gobierno de Navarra) | Fuente: prensa |
| Capacidad | 54–60 plazas en literas (las fuentes no coinciden) | Confirmar |
| Servicios | Dormitorios, baños y duchas comunes con agua caliente, comedor/bar, cocina | Confirmar |
| Explotación diaria | Guarda/s del refugio | Confirmar si es personal FNDME o explotación cedida |

### Diferencias importantes con el caso general de `PLAN.md`

`PLAN.md` está pensado para una **comunidad de propietarios residencial**. El refugio no lo es:

- **No hay comunidad ni vecinos.** El "cliente" es la FNDME (y, según el contrato de concesión, quizá también el propietario). El módulo de portal de vecinos (tarea 3.3) no aplica.
- **IEE y LEEx:** en Navarra son obligatorios para edificios residenciales colectivos. **Hay que confirmar qué le aplica a un refugio/albergue** (y qué exige la concesión). Aunque no fuera obligatorio, el Libro sigue teniendo sentido como registro de mantenimiento.
- **Es un establecimiento de uso público con alojamiento.** Eso suele implicar más exigencias en contraincendios, evacuación, electricidad, agua y cocina que una vivienda. Ver sección 3.
- **Hay un usuario nuevo y muy importante: el guarda.** Vive o trabaja en el edificio, ve los problemas primero y será quien más use el formulario.
- **Montaña:** cobertura móvil incierta, nieve, acceso complicado en invierno, temporadas de apertura. El modo offline pasa de "deseable" a **imprescindible**.

---

## 3. Instalaciones previsibles (a confirmar en la visita)

Lista de partida para el inventario. **Ninguna periodicidad ni obligación se da por buena** hasta que la valide un técnico competente (`verificado: false`, igual que en `PLAN.md`).

| Instalación / elemento | Por qué importa aquí |
|---|---|
| Protección contra incendios (extintores, BIE, detección, alarma, alumbrado de emergencia, señalización) | Alojamiento colectivo con literas: prioridad máxima |
| Calefacción (tipo de combustible: gasóleo, biomasa, propano… desconocido) | Equipo crítico en invierno; revisiones RITE |
| Agua caliente sanitaria y duchas colectivas | Posible plan de prevención de legionela |
| Agua de consumo (red municipal o captación propia, depósito, tratamiento) | Si es captación propia, controles sanitarios |
| Saneamiento / depuración (red o depuradora/fosa propia) | Habitual en edificios aislados |
| Baja tensión (cuadros, toma de tierra), posible grupo electrógeno | Inspecciones periódicas si es local de pública concurrencia |
| Gas (si hay depósito o botellas para cocina/calefacción) | Revisiones e inspecciones |
| Cocina: campana y conductos de extracción | Limpieza periódica, riesgo de incendio |
| Cubierta (carga de nieve), fachada, carpinterías | Clima de montaña: desgaste rápido |
| Accesos, escaleras exteriores, salidas de emergencia | Nieve y hielo |
| Equipamiento propio de refugio (literas, colchones, mantas, botiquín, desfibrilador si lo hay, radio/emergencias) | Opcional: decidir con FNDME si entra en el Libro |

---

## 4. Usuarios del piloto

| Perfil | Quién (a confirmar) | Uso |
|---|---|---|
| **Administración** | Persona de la FNDME responsable de instalaciones o refugios | Inicio, archivo, subida, papelera y configuración |
| **Consulta** | Personas de la FNDME o técnico redactor | Ve todo, sin cambiar nada |
| **Guarda** | Guarda/s del refugio | Registra comprobaciones e incidencias, y consulta el archivo |
| **Empresa mantenedora** | Calefacción, contraincendios, electricidad… | Registra partes y certificados de sus instalaciones |
| **Tutor del proyecto** | Txin | Revisión de PR, decisiones y contacto con la FNDME. Sin usuario en producción salvo que la FNDME lo autorice |

El colaborador/a **no** trata directamente con las empresas mantenedoras sin el visto bueno del tutor y de la FNDME.

---

## 5. Antes de empezar (tareas del tutor)

**Para empezar con datos ficticios:**

- [ ] **Acuerdo de colaboración voluntaria** firmado.
- [x] Organizaciones de GitHub creadas: `abauntz-sw` y `nafarmendi`.
- [ ] Organización de Supabase «Abauntz Software» (plan Free) con el proyecto `libro-dev` en una región concreta de la UE. El colaborador/a entra invitado con el rol *Developer*.
- [ ] Reunión semanal acordada con el colaborador/a (30 min).

**Antes de cargar cualquier dato real:**

- [ ] Acuerdo con la FNDME: alcance, persona de contacto y permiso para visitar el refugio.
- [ ] **Encargo de tratamiento (RGPD)** actualizado: Supabase, el correo y la web de producción como servicios de la FNDME (solo GitHub queda como subencargado), registro de actividad en la base de datos y devolución de los datos al terminar.
- [ ] Organización de Supabase **a nombre de la FNDME**, que contrata y paga el plan **Pro**, con el proyecto de producción en una región concreta de la UE y copias diarias. El esquema se crea con las migraciones del repositorio, sin `seed.sql`. No se traspasa nada desde `libro-dev`.
- [ ] Revisar las condiciones de protección de datos de Supabase.
- [ ] Repositorio privado `nafarmendi/libro-refugio-belagua` con la GitHub App instalada.
- [ ] Pedir a la FNDME **toda la documentación disponible del refugio**, en el formato en que la tengan.
- [ ] Fecha para la visita al refugio, teniendo en cuenta nieve y temporada.
- [ ] Confirmar el ordenador de la oficina y quién será responsable de la carga.

---

## 6. Calendario orientativo (12 semanas + 1 de margen, ~20 h/semana)

Las tareas con número (0.x, 1.x…) son las de `PLAN.md`, sección 6; aquí se ordenan en el tiempo y se adaptan al refugio.

### 6.0 Simplificaciones por la dedicación disponible

| Tarea de `PLAN.md` | En el piloto | Por qué se puede |
|---|---|---|
| 1.2 Subir desde la web | Sencilla y recortable | La carga inicial va por la herramienta local |
| 1.3 Informe de huecos | Pantalla mínima sobre la vista `huecos` | La consulta ya existe |
| 1.5 Exportación diaria | Solo CSV, sin formato elaborado | Basta para leer el archivo sin la aplicación |
| 1.10 Alertas | Un único resumen diario por correo | Los avisos ya están en Inicio |
| 2.3 Exportación del registro | Solo CSV, y solo si hay tiempo | El PDF puede hacerse desde la hoja de cálculo |

Lo que **no** se simplifica: permisos y sus comprobaciones, modo offline y sencillez de uso.

**Entornos del piloto:**

| Entorno | Datos | Plan | Titular | Quién entra |
|---|---|---|---|---|
| Local o proyecto `libro-dev` | Solo ficticios | Free | Abauntz Software | Colaborador/a y tutor |
| Proyecto de producción | Reales | Pro | FNDME | Según el encargo de tratamiento |

**Repositorios del piloto:**

| Repositorio | Qué contiene | Visibilidad |
|---|---|---|
| [`abauntz-sw/libro-edificio`](https://github.com/abauntz-sw/libro-edificio) | La aplicación, la base de datos, los datos ficticios y los issues del piloto | Público (Apache 2.0) |
| [`nafarmendi/libro-refugio-belagua`](https://github.com/nafarmendi/libro-refugio-belagua) | Los archivos reales del refugio, propiedad de la FNDME | **Privado** |

El nombre del repositorio del refugio se guarda en la tabla `edificios`, no en el código.

### 6.1 Decisión abierta: formulario móvil en PWA o en Flutter

Se ha propuesto hacer el formulario del técnico en **Flutter** (app nativa) en lugar de la PWA en React de `PLAN.md`. La decisión es del colaborador/a; aquí se recogen los argumentos para valorarla.

**A favor de Flutter**

- Offline más robusto: SQLite local, sincronización en segundo plano y buen acceso a cámara y archivos.
- En iPhone la PWA es más débil: Safari no tiene sincronización en segundo plano y puede borrar los datos guardados si la web no se usa en unos días (más margen si está instalada en la pantalla de inicio). Un parte sin enviar podría perderse.

**A favor de la PWA (recomendación para el piloto)**

| Aspecto | PWA (React) | Flutter |
|---|---|---|
| Acceso de técnicos externos | Enlace o QR, sin instalar nada | Instalar una app para un solo refugio; difícil que lo acepten |
| Distribución | Ninguna | Tiendas: Apple 99 €/año y revisión de cada versión; Google 25 € una vez. APK a mano no sirve en iPhone |
| Tecnologías del proyecto | Una (JS/TS): panel y formulario | Dos (React para el panel + Dart) |
| Conexión con Supabase | Cliente JavaScript, igual que el panel | Cliente Dart aparte |
| Tiempo (~250 h) | Encaja con el plan | Configuración, tiendas y firma iOS restan horas al producto |
| Tests offline | Playwright, ya previsto en 1.7 | Otro sistema de tests |

**Cómo reducir el riesgo del iPhone sin cambiar de tecnología**

- Pedir almacenamiento persistente (`navigator.storage.persist()`) e instalar la PWA en la pantalla de inicio del guarda.
- Indicador visible de partes pendientes y reintento de envío **al abrir la app**, sin depender de la sincronización en segundo plano.
- Si al final hiciera falta app de tienda: envolver la misma PWA con **Capacitor** (y SQLite nativo). Se reaprovecha el código.

**Cuándo sí convendría Flutter**

- Si en la visita (semana 2) se ve que guarda y técnicos usan sobre todo **iPhone** y que pasan **días sin cobertura**.
- Si la app pasa a ser para usuarios fijos (guarda, personal propio de una gestoría) más que para técnicos que van y vienen.
- Si el colaborador/a ya domina Flutter: el coste de aprendizaje desaparece, aunque se mantienen los de distribución y la doble tecnología.

**Dato que decide:** en la visita, anotar qué móviles (Android/iPhone) usan el guarda y los técnicos habituales, y cuánto tiempo pueden estar sin cobertura. Decidir antes de empezar la semana 7 y dejarlo escrito en `docs/decisiones/`.

### Bloque A — Base de datos y carga (semanas 1–3)

| Semana | Trabajo | Entregable |
|---|---|---|
| 1 | Leer los planes, probar el prototipo y montar el entorno. Tareas **0.1** y **0.2**: seguir un caso completo en `libro-dev` | Repositorio preparado y base revisada |
| 2 | **0.7** carga local con el ejemplo ficticio. **Visita al refugio** si ya hay fecha: instalaciones, placas, cobertura y móviles | `escanear` e `importar` funcionando; notas de la visita |
| 3 | **0.5** CI y **0.3** datos comunes, con las instalaciones de la sección 3. **0.6** repositorio del edificio | CI en verde; plantilla del repositorio |

**Hito A (fin semana 3):** la carga funciona de punta a punta con datos ficticios y hay un inventario del refugio revisado por el tutor, preparado para pasar a producción.

### Bloque B — Documentación (semanas 4–6)

| Semana | Trabajo | Entregable |
|---|---|---|
| 4 | **1.1** esqueleto y publicación. **1.8** acceso por correo. **1.4** función de archivos | URL pública; se sube y descarga un documento ficticio |
| 5 | **1.9** Archivo y Papelera. **Carga real** desde el ordenador de la oficina, si están cerrados los requisitos de la sección 5 | Documentos del refugio consultables en la aplicación |
| 6 | **1.3** informe de huecos. **1.2** subida web si hay tiempo. **1.5** exportación y copia | Informe de huecos del refugio |

**Hito B (fin semana 6):** la FNDME recibe el **informe de huecos**: qué documentos faltan o están caducados. Es el primer resultado útil, aunque la aplicación no esté terminada.

### Bloque C — Partes de trabajo en el refugio (semanas 7–9)

| Semana | Trabajo | Entregable |
|---|---|---|
| 7 | **1.6** formulario de parte, con su versión para el guarda | Formulario usable en el móvil |
| 8 | **1.7** modo offline. Probarlo **en el propio refugio**, en los puntos sin cobertura | Test e2e y prueba real documentada |
| 9 | **1.8** acceso con código para guarda y empresas. **2.2** QR por instalación | Guarda y al menos una empresa dados de alta |

**Hito C (fin semana 9):** el guarda registra partes de verdad.

### Bloque D — Panel, alertas y uso real (semanas 10–12)

| Semana | Trabajo | Entregable |
|---|---|---|
| 10 | **1.9** Inicio y Configuración, con instalaciones, revisiones, empresas y usuarios | Panel completo |
| 11 | **1.10** alertas por correo a la FNDME. Corrección de errores reportados | Alertas reales |
| 12 | Guía de una página, traspaso, demo final y nota de lo aprendido | Demo final con la FNDME |
| 13 | **Margen** para retrasos. Si no se necesita: **2.3** exportación CSV | — |

Si sobra tiempo: **2.3**, **2.1** y **2.5**. Si falta: se aplaza **1.2** y Configuración se limita a lo imprescindible. **Nunca** se recortan los permisos ni el modo offline.

---

## 7. Riesgos propios del piloto

| Riesgo | Qué hacer |
|---|---|
| La documentación de la FNDME llega tarde o incompleta | El informe de huecos convierte ese problema en un entregable. Empezar el bloque B con lo que haya |
| Los requisitos legales o el plan Pro se retrasan | Seguir con datos ficticios. Ningún dato real entra en `libro-dev` |
| Visita imposible por nieve o temporada | Adelantarla todo lo posible; plan B: videollamada con el guarda recorriendo el edificio |
| Sin cobertura en buena parte del edificio | Justo lo que el offline debe resolver; medirlo en la visita |
| Guarda o empresas no adoptan el formulario | Formulario mínimo, QR en cada instalación, guía de una página, pedir opinión en la semana 9 |
| Obligaciones normativas mal identificadas | Todo con `verificado = false` hasta la revisión técnica; la aplicación no da consejo normativo |
| Un error de permisos expone datos | Comprobación automática de cada perfil en el CI, antes de cualquier dato real |
| Datos reales en sitios indebidos | Solo en producción y en el repositorio privado. El repositorio público, los tests y `libro-dev`, solo con datos ficticios |
| El colaborador/a se atasca | Regla de `PLAN.md`: más de medio día atascado → comentarlo en el issue |

---

## 8. Seguimiento y evaluación

- **Semanal:** reunión de 30 min (qué hice, qué haré, dónde me atasco) y tablero de issues al día.
- **Por hito (A, B, C, final):** demo de 10 min; los hitos B, C y final, con la FNDME.
- **Evaluación final:** criterios de `PLAN.md`, sección 8, más uno nuevo: **¿lo usan el guarda y la FNDME?** (nº de partes reales registrados y alertas atendidas).

---

## 9. Preguntas para la FNDME (primera reunión)

1. ¿Quién es el propietario del edificio y qué dice la concesión sobre mantenimiento, seguros y documentación?
2. ¿El refugio está inscrito en el Registro de Turismo de Navarra? ¿Con qué clasificación?
3. ¿Tiene IEE, Libro del Edificio o documentación de la reforma de c. 2020 (proyecto, final de obra, licencias)?
4. ¿Qué empresas mantienen cada instalación? ¿Hay contratos firmados?
5. ¿Cómo es el suministro de agua, el saneamiento, la calefacción y la electricidad?
6. ¿Quién es el guarda, todo el año o por temporadas, y qué tareas de mantenimiento hace él mismo?
7. ¿Quién en la FNDME recibirá las alertas y usará el panel?
8. ¿Gestiona la FNDME otros refugios? (Si la respuesta es sí, la fase 3 de `PLAN.md`, cartera de edificios, cobra sentido con ellos.)

---

## Fuentes

- [Noticias de Navarra — reapertura del refugio de Belagua (2020)](https://www.noticiasdenavarra.com/actualidad/sociedad/2020/02/15/refugio-belagua-angel-oloron-abrira/1023254.html)
- [Estiber — descripción del refugio](https://www.estiber.com/blog/?p=10250)
- [Komoot — Refugio de Belagua](https://www.komoot.com/ja-jp/guide/3842839)
- [refuges.info — Refuge de Belagua](https://www.refuges.info/point/4087/refuge-garde/refuge-de-Belagua/en/)
- [Ley Foral 7/2003 de Turismo de Navarra, art. 16 (clases de alojamiento)](https://www.iberley.es/legislacion/articulo-16-turismo-navarra)
- [Albergues turísticos en activo del Registro de Turismo de Navarra (datos abiertos)](https://datos.gob.es/es/catalogo/a15002917-albergues-turisticos-en-activo-del-registro-de-turismo-de-navarra1)
