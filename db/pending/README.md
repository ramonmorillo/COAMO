# Migraciones pendientes de COAMO (no aplicadas)

El historial canónico de migraciones del proyecto Supabase compartido vive en `ramonmorillo/dermapex`
(`supabase/migrations/`). Esta sesión no tenía acceso de escritura a ese repositorio, por lo que las migraciones nuevas
se dejan aquí, **probadas pero sin aplicar**, para trasladarlas allí.

| Fichero | Tablas / funciones | Tipo | Estado |
|---|---|---|---|
| `20261122120000_coag_interventions_planning.sql` | `public.coag_interventions` (+2 columnas, 2 índices, permisos de columna); `coag_private.enforce_intervention()` | Aditiva, idempotente | Probada en PostgreSQL 16 local (24 aserciones). **No aplicada** |
| `20261122120000_coag_interventions_planning.down.sql` | Reversión | Destructiva solo para lo añadido | Ejecutada en la batería local |

## Pruebas

```bash
bash db/pending/tests/run.sh
```

Crea un clúster PostgreSQL efímero, carga `tests/stub_schema.sql` (reconstrucción **mínima** de las tablas implicadas a
partir de los metadatos de producción consultados en solo lectura el 22/11/2026; no sustituye a `scripts/test-db.sh` de
DERMAPEX), comprueba que los registros previos no cambian, aplica la migración dos veces (idempotencia) y ejecuta la
secuencia de trazabilidad de la fase 5.4.

## Procedimiento de paso a producción (requiere autorización expresa)

1. Copiar la migración a `ramonmorillo/dermapex/supabase/migrations/` (mismo nombre) en una rama homónima de la de COAMO y
   añadir sus pruebas a `db-tests/` (pueden partir de `tests/run_tests.sql`); la CI de COAMO usa esa rama en el job `export`.
2. Copia de seguridad / punto de restauración del proyecto compartido.
3. Registros afectados antes de aplicar: `select count(*), count(*) filter (where status = 'planned') from public.coag_interventions;`
   (ninguno cambia: las columnas nuevas quedan vacías).
4. Aplicar la migración **antes** de publicar el frontend (lección del 03/11/2026). El frontend funciona igualmente sin ella:
   detecta las columnas ausentes, oculta la planificación y avisa; la exportación las deja vacías con aviso.
5. Verificar: columnas y permisos (`has_column_privilege('authenticated', …)`), RLS sin cambios, `coag_app_gate` presente,
   y prueba funcional revertida (prever → realizar en visita posterior → comprobar el registro de origen intacto).
6. Avisos de seguridad de Supabase (`get_advisors`) sin hallazgos nuevos.

No toca tablas, funciones ni políticas de DERMAPEX ni de otros proyectos.
