# COAMO · Modelo CMO en coagulopatías congénitas

Herramienta digital del estudio COAMO (atención farmacéutica según el modelo CMO en pacientes adultos con hemofilia A, hemofilia B o enfermedad de von Willebrand). Acceso restringido a profesionales autorizados.

**Estado (2026-10-07): versión base.** Acceso seguro, comprobación de autorización COAMO y consulta de centros. Todavía no hay registro de pacientes: depende del modelo CMO de coagulopatías, del CRD aprobado y de las versiones de los cuestionarios (ver `docs` del repositorio DERMAPEX, carpeta `docs/coamo/`).

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
```

## Despliegue

GitHub Actions (`deploy-pages.yml`) en cada push a `main`. Requiere los secretos de repositorio `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (clave pública, nunca la service-role) y GitHub Pages con *Source = GitHub Actions*.
