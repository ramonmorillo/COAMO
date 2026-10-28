# COAMO · Copias de seguridad

COAMO **no tiene base de datos propia**: comparte el proyecto Supabase de DERMAPEX (`efjpjponblmdjlhmmiet`). Por eso la copia
de seguridad de COAMO es la del proyecto compartido y se hace con los scripts del historial canónico, en `ramonmorillo/dermapex`:

- `scripts/backup/dermapex-backup.sh <carpeta>`: `pg_dump` de `public`, `app_private` y `coag_private` (estructura, datos,
  funciones, triggers, RLS), cuentas `auth`, metadatos de storage y recuento por tabla; cifrado AES-256 (PBKDF2) y SHA-256.
- `scripts/backup/dermapex-restore-verify.sh <copia.enc>`: descifra, comprueba huellas, restaura en un PostgreSQL **local**
  nuevo y compara los recuentos tabla a tabla.
- Procedimiento completo (requisitos, frecuencia, custodia, riesgos): `docs/audit/DERMAPEX_COPIAS_SEGURIDAD.md` en ese repositorio.

No se duplica el script aquí: dos copias del mismo procedimiento acabarían divergiendo.

## Qué cubre de COAMO (verificado el 28/10/2026)

Prueba en PostgreSQL 16 local con el esquema real (migraciones canónicas + baterías `db-tests`) y datos ficticios: copia
cifrada → restauración de verificación → **39/39 tablas con el mismo número de filas, 149 políticas RLS**. Tablas COAMO
incluidas (11): `coag_centers`, `coag_profiles`, `coag_center_memberships`, `coag_patients`, `coag_inclusions`,
`coag_visits`, `coag_clinical_assessments`, `coag_questionnaire_administrations`, `coag_stratifications`, `coag_audit_log`
y `coag_private.patient_code_counters` (contador de códigos COAMO-<n>-NNNN: imprescindible para no repetir códigos tras
una restauración).

Comprobación tras cada copia real: el fichero `row_counts.csv` de la copia debe listar esas 11 tablas.

## Decisiones pendientes (no son técnicas)

1. **Custodia y responsable.** El procedimiento de DERMAPEX asigna la copia y la frase de cifrado al IP de DERMAPEX y a
   FISEVI. Una única copia contiene datos de **dos estudios con promotores distintos** (FISEVI y, según el dictamen del CEIm
   La Fe, Tomás Palanques Pastor). Hay que acordar por escrito quién hace la copia de COAMO, quién custodia la frase y
   cómo se reparte el acceso; si no se acepta una custodia común, la alternativa es una copia limitada a `coag_*`
   (requiere un script nuevo y validar que se puede restaurar sin el resto del esquema).
2. **Frecuencia.** Semanal durante reclutamiento y seguimiento, y antes de cada migración, es la propuesta de DERMAPEX;
   debe confirmarla el IP de COAMO según el ritmo de inclusión.
3. **Plan de Supabase.** En el plan gratuito no hay copias restaurables desde el panel: la única copia restaurable es la de
   este procedimiento.

La exportación de investigación (`#/export`) es una copia **analítica**: no permite reconstruir la base de datos
(permisos, funciones, auditoría) y no sustituye a la copia de seguridad.
