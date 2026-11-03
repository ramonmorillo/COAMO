# COAMO · Auditoría y mejoras solicitadas por los investigadores (03/11/2026)

Rama: `claude/elegant-johnson-uk5quo` en `ramonmorillo/COAMO` y en `ramonmorillo/dermapex` (migraciones).
**Nada se ha aplicado en Supabase ni desplegado.** Consultas a producción: solo lectura (recuentos y metadatos).

## 1. Jerarquía documental aplicada

1. Documentos aprobados por el CEIm La Fe (nº 2026-0810-1, 21/10/2026): protocolo de 30/08/2026 y HIP/CI adultos v2 de 25/09/2026.
2. Documentos aportados por el IP para la herramienta (cuestionarios y claves de puntuación).
3. Publicaciones (referencias). El artículo del protocolo **no** prevalece sobre el protocolo aprobado.

Documentos recibidos en esta petición: `VERITAS-PRN_cuestionario.pdf`, `VERITAS-PRN_puntuación.docx`, `VERITAS-Pro_cuestionario.pdf`,
`VERITAS-Pro_puntuación.docx`. **No recibidos** (aunque los cita la petición): protocolo FH TPP, artículo del protocolo y anexos,
cuestionarios originales restantes, EVASAF actualizado, «DATOS CLÍNICOS», memoria, HIP/CI.

## 2. Matriz de trazabilidad

| Requisito | Estado previo (inspeccionado) | Cambio | Archivos / tablas | Estado |
|---|---|---|---|---|
| 2.1 Morisky-Green | Nunca implementado (sin formulario, tabla ni datos); 2 textos informativos | Textos actualizados; sustitución por VERITAS señalada para el CEIm | `HomePage.tsx`, `stratification.ts`, `instruments.ts` | IMPLEMENTADO Y VERIFICADO (decisión CEIm pendiente) |
| 2.2 VERITAS-Pro bloqueado | Trigger `enforce_questionnaire_administration` rechazaba respuestas («documento no aportado»); la migración prevista nunca se creó | Migración que retira el bloqueo y admite q1-q24 | DERMAPEX `20261103120000_coag_veritas_scoring.sql` | IMPLEMENTADO, PENDIENTE DE DESPLIEGUE |
| 2.3 Puntuación VERITAS | Solo recuentos («clave no aportada») | Clave de los documentos: invertidos, total 24-120, sin imputación, sin cortes ni subescalas; `coamo-q-2`; recálculo auditado de registros previos | `scoring.ts`, `comparison.ts`, migración, `db-tests/71_*` | IMPLEMENTADO, PENDIENTE DE DESPLIEGUE |
| 2.4 EVASAF comentarios | El documento del repositorio no tiene apartado de comentarios | Ninguno | — | BLOQUEADO: falta el «EVASAF actualizado» |
| 2.4 EVASAF total | Sin total (no hay regla) | Se mantiene descriptivo | — | YA EXISTÍA Y SE HA VALIDADO |
| 2.5 / 7 Biblioteca y repositorio documental | «Proyecto» con datos del dictamen | Registro documental + cuestionarios + imprimibles (auth) | `ProjectPage.tsx`, `constants/documents.ts`, `QuestionnairePrintPage.tsx` | IMPLEMENTADO Y VERIFICADO (originales: pendiente de almacén autenticado) |
| 3 Datos clínicos | CRD del protocolo pp. 10-12 (`clinicalSchema.ts`) | Ninguno | — | BLOQUEADO: falta «DATOS CLÍNICOS» |
| 4.1 Actuaciones por prioridad | No implementadas; catálogo = tablas 5-7 del modelo (no cargadas) | Ninguno (no se inventan actuaciones) | — | PENDIENTE DE VALIDACIÓN DOCUMENTAL |
| 4.2 Evolución farmacéutica | No existía | Tabla 1:1 con la visita, concurrencia, versiones en auditoría, copia para HC | DERMAPEX `20261103130000_coag_visit_evolutions.sql`, `PharmaceuticalEvolutionPage.tsx`, `evolution.ts` | IMPLEMENTADO, PENDIENTE DE DESPLIEGUE |
| 5 Longitudinal V0-VF | Comparación por cuestionario | Tabla integrada CMO + cuestionarios + clínica; exportación con cambios VERITAS | `longitudinal.ts`, `QuestionnaireEvolutionPage.tsx`, `datasets.ts` | IMPLEMENTADO Y VERIFICADO (VERITAS: tras despliegue) |
| 6 Permisos multicéntricos | Ya en RLS: investigador = centros asignados; coordinador = lectura, escritura y borrado global | Auditoría; sin cambios | — | YA EXISTÍA Y SE HA VALIDADO (decisión pendiente, §4) |
| 8 Exportación | ZIP conciliado LONG/WIDE/diccionario/SPS/Excel | Totales VERITAS, cambios, `puntos` por ítem, evolución (metadatos) | `datasets.ts`, `exportCsv.ts` | IMPLEMENTADO Y VERIFICADO |
| 8 Copias de seguridad | `pg_dump` por esquema (`public`, `coag_private`) | Ninguno: las tablas nuevas quedan incluidas | DERMAPEX `scripts/backup` | YA EXISTÍA Y SE HA VALIDADO |

## 3. Decisiones metodológicas tomadas (y por qué)

- **VERITAS**: se guarda el código de posición (1 Siempre … 5 Nunca), como hasta ahora; la puntuación por ítem y el total los
  calcula la BD (`scores.item_scores`, `scores.total`). Así los registros históricos no cambian de significado.
- **Sin subescalas VERITAS**: el documento de puntuación solo define el total. El artículo original describe subescalas (a
  verificar por el IP); añadirlas requiere decisión documentada.
- **Respuestas incompletas**: el documento no define regla → sin total (no se prorratea ni imputa).
- **Dirección**: menor = mayor adherencia (documento). Δ negativo = cambio favorable; sin umbral de relevancia clínica.
- **Evolución farmacéutica**: texto libre fuera de las exportaciones (norma ya vigente en COAMO para textos libres); se
  exportan existencia, revisión y fechas. Las versiones anteriores las ve coordinación (`coag_audit_log`).
- **Imprimibles**: generados desde el texto implementado (no se modifica el instrumento); EQ-5D-3L excluido por licencia.

## 4. Permisos (Fase 6): hallazgos y decisión pendiente

- Autoridad en PostgreSQL: `coag_private.can_access_center/visit` + barrera `coag_app_gate` (`has_app_access('coag')`) en todas
  las tablas `coag_*` (verificado en producción por metadatos y en local por `db-tests/50_*`, que obliga a ello en tablas futuras).
- La exportación usa el cliente con la sesión del usuario: misma RLS (verificado con `tests/researchExport.db.test.ts` contra el
  esquema real: cada investigador solo su centro; coordinación DERMAPEX nada).
- Frontend sin claves privilegiadas (solo URL y clave pública).
- **Discrepancia con la petición**: el rol `coordinator` actual no distingue visualización/exportación de edición: puede editar
  y borrar datos de cualquier centro. Separarlo (p. ej., rol `monitor` de solo lectura y exportación) es una **decisión de
  permisos** que no se ha tomado unilateralmente. Propuesta técnica: añadir el valor de rol, `coag_private.can_read_center()`
  para SELECT y mantener `can_access_center()` (sin el monitor) en INSERT/UPDATE; pruebas en `db-tests/5x`.

## 5. Pruebas ejecutadas

| Ámbito | Resultado |
|---|---|
| Vitest (unitarias, datos sintéticos) | 170 superadas; 4 omitidas sin BD |
| `tests/researchExport.db.test.ts` contra PostgreSQL 16 local con todo el historial canónico | 4/4 |
| `scripts/test-db.sh` (DERMAPEX + COAMO) | 484 aserciones, todas superadas (nuevas: `71_*` 16, `72_*` 21) |
| E2E (API simulada) a 1280 y 390 px | cuestionarios 44, agenda/exportación 19, evolución/biblioteca 16 |
| `npm run build` | OK |

No verificado: funcionamiento contra el Supabase real tras aplicar las migraciones; lectores de pantalla; impresión en todos los navegadores.

## 6. Paso a producción

1. Revisar y fusionar el PR de `ramonmorillo/dermapex` (CI ejecuta `scripts/test-db.sh`).
2. Copia de seguridad (`scripts/backup/dermapex-backup.sh`).
3. Aplicar, en orden, `20261103120000_coag_veritas_scoring.sql` y `20261103130000_coag_visit_evolutions.sql` (aditivas).
4. Verificar: `select instrument_code, scoring_version, scores->>'total' from coag_questionnaire_administrations where instrument_code like 'VERITAS%';`
   y que `coag_visit_evolutions` tiene RLS y `coag_app_gate`.
5. Fusionar el PR de COAMO (despliegue a GitHub Pages). Sin las migraciones, VERITAS-Pro sigue bloqueado y la evolución falla al guardar (con error visible).
