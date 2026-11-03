# COAMO · Auditoría y mejoras solicitadas por los investigadores (03/11/2026)

Rama: `claude/elegant-johnson-uk5quo` en `ramonmorillo/COAMO` y en `ramonmorillo/dermapex` (migraciones).
**Estado (03/11/2026):** PR fusionados (ramonmorillo/dermapex#25 y ramonmorillo/COAMO#8) y migraciones **aplicadas y verificadas** en Supabase a petición y con autorización expresa del investigador que solicitó las mejoras (§6).

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
| 2.1 Morisky-Green | Nunca implementado (sin formulario, tabla ni datos); 2 textos informativos | Textos actualizados; **sustituido por VERITAS por decisión de los investigadores (03/11/2026)** | `HomePage.tsx`, `stratification.ts`, `instruments.ts`, `constants/documents.ts` | IMPLEMENTADO Y VERIFICADO |
| 2.2 VERITAS-Pro bloqueado | Trigger `enforce_questionnaire_administration` rechazaba respuestas («documento no aportado»); la migración prevista nunca se creó | Migración que retira el bloqueo y admite q1-q24 | DERMAPEX `20261103120000_coag_veritas_scoring.sql` | IMPLEMENTADO Y VERIFICADO (aplicado en producción) |
| 2.3 Puntuación VERITAS | Solo recuentos («clave no aportada») | Clave de los documentos: invertidos, total 24-120, sin imputación, sin cortes ni subescalas; `coamo-q-2`; recálculo auditado de registros previos | `scoring.ts`, `comparison.ts`, migración, `db-tests/71_*` | IMPLEMENTADO Y VERIFICADO (aplicado en producción) |
| 2.4 EVASAF comentarios | El documento del repositorio no tenía apartado de comentarios | EVASAF actualizado (PDF, 31/10/2026; aportado el 03/11/2026): columna `comments` (solo EVASAF, ≤ 2000, corrección con motivo, auditada), formulario, imprimible, evolución y exportación | DERMAPEX `20261103140000_coag_evasaf_comments.sql`, `db-tests/73_*`; `administration.ts`, `QuestionnaireFormPage.tsx`, `datasets.ts` | IMPLEMENTADO Y VERIFICADO (aplicado en producción, 03/11/2026 09:22 UTC) |
| 2.4 EVASAF total | Sin total (no hay regla) | Se mantiene descriptivo | — | YA EXISTÍA Y SE HA VALIDADO |
| 2.5 / 7 Biblioteca y repositorio documental | «Proyecto» con datos del dictamen | Registro documental + cuestionarios + imprimibles (auth) | `ProjectPage.tsx`, `constants/documents.ts`, `QuestionnairePrintPage.tsx` | IMPLEMENTADO Y VERIFICADO (originales: pendiente de almacén autenticado) |
| 3 Datos clínicos | CRD del protocolo pp. 10-12 (`clinicalSchema.ts`) | Ninguno | — | BLOQUEADO: falta «DATOS CLÍNICOS» |
| 4.1 Actuaciones por prioridad | No implementadas | Catálogo de las Tablas 5 (P3) y 6 (P2) del modelo CMO SEFH v2.0, transcritas literalmente de las imágenes aportadas (03/11/2026; pendiente de cotejo), acumulativas (24 actuaciones); registro prevista/realizada/anulada por visita, adicionales con ámbito, seguimiento; prioridad vigente y «recomendada» fijadas por la BD; en la copia para HC, en la evolución V0-VF y en la exportación. **Tabla 7 (P1) no cargada: copia ilegible** | DERMAPEX `20261103150000_coag_interventions.sql`, `db-tests/85_*`; `InterventionsPage.tsx`, `interventions.ts`, `interventionService.ts` | IMPLEMENTADO, PENDIENTE DE DESPLIEGUE (P1: PENDIENTE DE VALIDACIÓN DOCUMENTAL) |
| 4.2 Evolución farmacéutica | No existía | Tabla 1:1 con la visita, concurrencia, versiones en auditoría, copia para HC | DERMAPEX `20261103130000_coag_visit_evolutions.sql`, `PharmaceuticalEvolutionPage.tsx`, `evolution.ts` | IMPLEMENTADO Y VERIFICADO (aplicado en producción) |
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
- **Evolución farmacéutica y comentarios EVASAF**: se exporta el texto libre por decisión del investigador (03/11/2026, «por mi
  ok»): `raw/evolucion_farmaceutica.evolution_text`, `raw/cuestionarios_registros.comments` y `evasaf_comentarios_v0/vf`. El
  LEEME del paquete avisa de que contiene texto libre que debe revisarse antes de compartirlo. Recomendación: informar al
  delegado de protección de datos. Las versiones anteriores las ve coordinación (`coag_audit_log`).
- **Imprimibles**: generados desde el texto implementado (no se modifica el instrumento); EQ-5D-3L excluido por licencia.

## 4. Permisos (Fase 6): hallazgos y decisión

- Autoridad en PostgreSQL: `coag_private.can_access_center/visit` + barrera `coag_app_gate` (`has_app_access('coag')`) en todas
  las tablas `coag_*` (verificado en producción por metadatos y en local por `db-tests/50_*`, que obliga a ello en tablas futuras).
- La exportación usa el cliente con la sesión del usuario: misma RLS (verificado con `tests/researchExport.db.test.ts` contra el
  esquema real: cada investigador solo su centro; coordinación DERMAPEX nada).
- Frontend sin claves privilegiadas (solo URL y clave pública).
- **Discrepancia con la petición**: el rol `coordinator` actual no distingue visualización/exportación de edición: puede editar
  y borrar datos de cualquier centro. Separarlo (p. ej., rol `monitor` de solo lectura y exportación) es una **decisión de
  permisos** que no se ha tomado unilateralmente. **Decisión de los investigadores (03/11/2026): se mantiene así** (sin rol de
  solo lectura). Propuesta técnica conservada por si se reconsidera: valor de rol nuevo, `coag_private.can_read_center()` para
  SELECT y `can_access_center()` sin ese rol en INSERT/UPDATE; pruebas en `db-tests/5x`.
- **Avisos de seguridad de Supabase (revisados el 03/11/2026)**:
  - Vistas DERMAPEX `cmo_stratification_registry` y `cmo_stratification_item_values` (`SECURITY DEFINER`, nivel ERROR del linter):
    filtran por `app_private.can_access_visit` (DERMAPEX) con `security_barrier`. Prueba revertida en producción con una cuenta
    solo-COAMO: **0 filas en ambas** (sin fuga entre proyectos). Cambiarlas es competencia de DERMAPEX: no se tocan.
  - Protección de contraseñas filtradas desactivada: es un ajuste de Supabase Auth (compartido con DERMAPEX) que se activa en el
    panel (Authentication → Sign In / Providers → Email → *Leaked password protection*); no se puede cambiar por SQL.
  - `public.coag_mark_password_changed()` ejecutable por `authenticated`: intencionado (marca el cambio obligatorio de contraseña).

## 5. Pruebas ejecutadas

| Ámbito | Resultado |
|---|---|
| Vitest (unitarias, datos sintéticos) | 170 superadas; 4 omitidas sin BD |
| `tests/researchExport.db.test.ts` contra PostgreSQL 16 local con todo el historial canónico | 4/4 |
| `scripts/test-db.sh` (DERMAPEX + COAMO) | 484 aserciones, todas superadas (nuevas: `71_*` 16, `72_*` 21) |
| E2E (API simulada) a 1280 y 390 px | cuestionarios 44, agenda/exportación 19, evolución/biblioteca 16 |
| `npm run build` | OK |

No verificado: lectores de pantalla; impresión en todos los navegadores. (El funcionamiento contra el Supabase real se verificó tras aplicar las migraciones: §6.)

## 4 bis. Decisiones y documentos posteriores (03/11/2026)

- VERITAS: **permiso de uso para el estudio confirmado** por los investigadores. Sigue sin acreditarse la validación de la
  versión española y el texto introductorio de VERITAS-Pro (idéntico al de PRN) no se ha confirmado.
- Tablas de actuaciones: aportadas como imágenes. Tablas 5 y 6 legibles y cargadas; Tabla 7 ilegible (pendiente de copia en
  mejor resolución o del texto). Mientras tanto, Prioridad 1 muestra las actuaciones acumuladas de las Tablas 5-6 con aviso.
- Despliegue de los comentarios EVASAF: el frontend se publicó (09:20 UTC) dos minutos antes de aplicar la migración
  (09:22 UTC); en ese intervalo los cuestionarios no cargaban. Sin pérdida de datos. Para próximos cambios: aplicar la
  migración antes de fusionar el PR del frontend.
- Protección de contraseñas filtradas (Supabase Auth): debe activarla el titular en el panel; no hay herramienta para ello.

## 5 bis. Defecto corregido en la exportación (anterior a esta revisión)

`analisis/estratificaciones_respuestas.puntos` dejaba vacíos los puntos de toda pregunta con excepción del modelo, aunque la
excepción no se activara: la edad 18-50 (1 punto) y > 50 (2 puntos) salían vacías, y la suma por ítem no cuadraba con la
puntuación oficial. Ahora solo se vacía cuando la respuesta activa la excepción (edad < 18; terapia avanzada «sí»),
como ya decía el diccionario. Detectado al variar los datos sintéticos; prueba de regresión añadida. La puntuación oficial
(`coag_stratifications.score`, calculada por la BD) no estaba afectada.

## 6. Paso a producción (realizado el 03/11/2026)

| Paso | Resultado |
|---|---|
| PR | ramonmorillo/dermapex#25 y ramonmorillo/COAMO#8 fusionados con la CI en verde. En COAMO, el job `export` usa la rama homónima de DERMAPEX mientras su PR no se ha fusionado |
| Comprobación previa | SQL de `main` idéntico al probado en CI; instantánea de los 3 registros VERITAS (id, revisión, versión de puntuación, MD5 de las respuestas) |
| Copia de seguridad | `scripts/backup/dermapex-backup.sh` **no ejecutado** (requiere credenciales de BD no disponibles en la sesión); cubre el momento la copia automática de Supabase, si está activa |
| Migraciones aplicadas | `coag_veritas_scoring` (versión registrada 20261103084636) y `coag_visit_evolutions` (20261103084724). Como en las migraciones COAMO anteriores, la versión registrada es la fecha de aplicación, no la del nombre del fichero |
| VERITAS | 3 VERITAS-PRN recalculados: totales 64, 68 y 88 (iguales al cálculo independiente con `scoring.ts`); respuestas intactas; revisión 1 → 2; 3 entradas de auditoría; resto de instrumentos sin cambios |
| `coag_visit_evolutions` | RLS, `coag_app_gate` y 4 políticas; `authenticated` solo puede actualizar `evolution_text`; `anon` sin acceso; triggers de reglas y auditoría |
| Prueba funcional (revertida, sin rastro) | Como coordinación COAMO: VERITAS-Pro aceptado (todo «Siempre» = 68; ítem 11 = 5); evolución guardada (revisión 2, autoría y 2 auditorías); revisión obsoleta = 0 filas; `anon` denegado. Auditoría, evoluciones y VERITAS-Pro sin filas nuevas tras la prueba |
| Avisos de seguridad de Supabase | Ninguno sobre lo aplicado. Avisos previos a revisar aparte: 2 vistas DERMAPEX `SECURITY DEFINER` (ERROR), protección de contraseñas filtradas desactivada, `coag_mark_password_changed` ejecutable por `authenticated` (aparentemente intencionado) |
