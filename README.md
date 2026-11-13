# Libro del Edificio

App para llevar el Libro del Edificio en digital: documentos, instalaciones, revisiones y partes de trabajo.

El piloto es el Refugio de Belagua, de la FNDME. Ver [`docs/PLAN-BELAGUA.md`](docs/PLAN-BELAGUA.md).

Prototipo: https://claude.ai/artifact/LwqrqTDTS3DDUBRMBEQQBT

## Cómo se arranca

Todavía no hay app. Se pueden ejecutar las comprobaciones de la base de datos:

```bash
npm install --no-save @electric-sql/pglite
node supabase/tests/comprobar.mjs
```

Hace falta Node.js. No hace falta Docker ni cuenta de Supabase.

## Licencia

Apache 2.0, ver [`LICENSE`](LICENSE).

## Aviso

Repositorio público: solo datos ficticios. Nada real del refugio aquí.

## Para colaboradores

Empieza por [`docs/GUIA-INICIO.md`](docs/GUIA-INICIO.md).

## Estado

En construcción. De momento:
- [`supabase/`](supabase/README.md): base de datos
- [`edificio-ejemplo-entrada/`](edificio-ejemplo-entrada/README.md): documentos de ejemplo para la carga
- [`docs/`](docs/): planes y guía

## Módulos

- archivo de documentos
- instalaciones y revisiones
- partes de trabajo desde el móvil, también sin cobertura
- alertas de caducidad
- carga de documentos por lotes

Más detalle en [`docs/PLAN.md`](docs/PLAN.md). Si difiere de `PLAN-BELAGUA.md`, manda este último.

## Autores

Ver [`AUTHORS`](AUTHORS).
