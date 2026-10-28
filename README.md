# COAMO · Modelo CMO en coagulopatías congénitas

Herramienta digital del estudio COAMO (atención farmacéutica según el modelo CMO en pacientes adultos con hemofilia A, hemofilia B o enfermedad de von Willebrand). Acceso restringido a profesionales autorizados.

**Aprobación ética:** informe favorable del CEIm del Hospital Universitario y Politécnico La Fe, nº de registro **2026-0810-1** (sesión de 21/10/2026). Promotor e IP: Tomás Palanques Pastor (Servicio de Farmacia, H. U. i P. La Fe). Documentos aprobados: protocolo de 30/08/2026 y HIP/CI adultos versión 2 de 25/09/2026. Se muestra en «Proyecto» (`#/project`), en el pie de la app y en el manifiesto de cada exportación.

**Estado (2026-10-28):** acceso seguro y autorización COAMO, centros, pacientes seudonimizados, inclusión, visitas y datos clínicos; **cuestionarios V0/VF** (IEXPAC, EQ-5D-3L, EVASAF, VERITAS-PRN; VERITAS-Pro pendiente de una migración de BD, ver `docs/CUESTIONARIOS.md` §9) — [`docs/CUESTIONARIOS.md`](docs/CUESTIONARIOS.md), [`docs/CUESTIONARIOS_TRAZABILIDAD.md`](docs/CUESTIONARIOS_TRAZABILIDAD.md); **estratificación CMO** (modelo SEFH v2.0) por visita — [`docs/ESTRATIFICACION_CMO.md`](docs/ESTRATIFICACION_CMO.md). Migraciones de cuestionarios y estratificación **aplicadas** en Supabase.

Incorporado de DERMAPEX (28/10/2026):

- **Agenda** (`#/agenda`): calendario mensual, panel del día y listado imprimible; filtros por paciente, periodo y estado (programada, programada vencida, realizada, no realizada, anulada) en la URL. Las citas son visitas `coag_visits` con estado «programada» (sin tabla nueva). Solo ofrece los tipos que la BD admite (una basal y una final no anuladas; seguimientos y contactos repetibles), sugiere la final dentro de su ventana (basal + 12 meses ±1) y orienta la próxima valoración según la prioridad CMO vigente (P1 mensual, P2 semestral, P3 sin seguimiento intermedio). Reprogramación desde la ficha del paciente. Lógica en `src/domain/agenda.ts`.
- **Exportación de investigación** (`#/export`): ZIP completo, conciliado con la BD y verificado (raw, LONG, WIDE V0/VF, ítems, respuestas de la estratificación, incidencias, diccionario, `.sps`, Excel, JSON, manifiesto). [`docs/EXPORTACION_INVESTIGACION.md`](docs/EXPORTACION_INVESTIGACION.md).
- **Copias de seguridad**: las del proyecto compartido (scripts en `ramonmorillo/dermapex`), verificadas para las tablas COAMO. [`docs/COPIAS_SEGURIDAD.md`](docs/COPIAS_SEGURIDAD.md).

Pendiente: actuaciones de AF por prioridad.

## Arquitectura

- Frontend React + TypeScript + Vite, HashRouter, publicado en GitHub Pages (`https://ramonmorillo.github.io/COAMO/`).
- **Base de datos compartida con DERMAPEX** (mismo proyecto Supabase, mismo Auth). COAMO usa exclusivamente las tablas `coag_*` y las funciones `coag_private.*`; nunca consulta tablas de DERMAPEX.
- La autorización la decide la base de datos: cuenta de Auth + acceso `coag` activo + perfil COAMO activo + rol/centro. Una cuenta DERMAPEX puede iniciar sesión aquí, pero no ve nada (aviso «Cuenta sin acceso a COAMO»).
- La sesión se guarda con clave propia (`coamo-auth`) para no mezclarse con DERMAPEX en el mismo dominio. No es una barrera de seguridad.

**Las migraciones de base de datos NO viven en este repositorio.** El proyecto Supabase tiene un único historial canónico, en `ramonmorillo/dermapex` (`supabase/migrations/2026100715*_coag_*.sql` y siguientes) con sus pruebas (`db-tests/50_coag_foundation.sql`). Este repositorio contiene solo el frontend. Diseño: `docs/coamo/SUPABASE_DERMAPEX_COAG_ARCHITECTURE.md` y `docs/coamo/COAMO_FUNCTIONAL_BLUEPRINT.md` en ese repositorio.

## Alta de profesionales (SQL Editor de Supabase)

1. Supabase → Authentication → Users → Add user (contraseña temporal distinta para cada persona, *Auto Confirm User*). Comunicar la contraseña por un canal distinto del correo.
2. Autorizar en COAMO y asignar centro:

```sql
select coag_private.provision_user('<email>', 'investigator');      -- o 'coordinator'
select coag_private.assign_center('<email>', '<CÓDIGO_CENTRO>');      -- p. ej. 'LAFE'
```

En el primer acceso la aplicación obliga a cambiar la contraseña temporal. No uses `app_private.set_app_access(..., 'dermapex')` para cuentas de COAMO.

## Desarrollo local

```bash
cp .env.example .env   # URL y clave pública del proyecto Supabase compartido
npm ci
npm run dev
npm test
# Pruebas E2E de la interfaz con API simulada (ver cabecera de cada script):
# node e2e/questionnaires.smoke.cjs
# node e2e/agenda-export.smoke.cjs
# Exportación contra el esquema real (PostgreSQL local preparado con scripts/test-db.sh de ramonmorillo/dermapex):
# EXPORT_DB_URL=postgresql://postgres:postgres@localhost:5432/<bd> npx vitest run tests/researchExport.db.test.ts
```

## Despliegue

GitHub Actions (`deploy-pages.yml`) en cada push a `main`. Requiere los secretos de repositorio `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (clave pública, nunca la service-role) y GitHub Pages con *Source = GitHub Actions*.
