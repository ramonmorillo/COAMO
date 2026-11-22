# COAMO · Auditoría y mejoras tras la revisión del investigador colaborador (22/11/2026)

Rama `claude/vibrant-cray-og5bc8` (solo `ramonmorillo/COAMO`). Jerarquía documental: protocolo aprobado por el CEIm
(30/08/2026) y HIP/CI adultos v2 > documentos del IP > propuestas del colaborador > interpretación propia.
**El protocolo, el documento «DATOS CLÍNICOS» y el artículo del modelo no están en el repositorio**: las variables y
páginas citadas proceden de la transcripción ya existente en el código (`clinicalSchema.ts`, `study.ts`,
`stratification.ts`) y de la documentación de auditorías anteriores.

## 1. Matriz de cambios

| Módulo | Situación previa (inspeccionada) | Situación requerida | Riesgo | Archivos | Migración | Prueba | Estado |
|---|---|---|---|---|---|---|---|
| Elegibilidad | ≥ 18 años en interfaz y BD (`coag_private.inclusion_ready`, verificado en producción) | Según protocolo | Bajo | `tests/study.test.ts` | No | 4 escenarios | Sin cambio de regla (protocolo excluye menores) |
| Consentimiento | Fecha y versión; HIP/CI solo adultos | Distinguir adultos/menores solo si el protocolo lo prevé | — | — | No | — | No procede (no previsto) |
| Datos clínicos: retiradas (3.1-3.3, 3.5, 3.6) | Variables del CRD del protocolo pp. 10-12 | Retirar duplicidades si el protocolo lo permite | **Alto** (pérdida de variables del protocolo) | — | — | Prueba que siguen presentes | **BLOQUEADO** (falta «DATOS CLÍNICOS») |
| Datos clínicos: condicionales (3.4) | Sin condicionalidad salvo gravedad/tipo EVW | Hemofilia: articulares; EVW: mucocutáneos, anemia | Medio | `clinicalSchema.ts`, `ClinicalAssessmentPage.tsx`, `datasets.ts` | No (oculta sin borrar) | 4 pruebas | Hemofilia: HECHO; EVW: BLOQUEADO (variables no existen en el protocolo transcrito) |
| Estratificación: «M» | Abreviatura interna del documento del modelo visible al usuario | Retirar | Bajo (no es código clínico ni se guarda) | `stratification.ts`, `StratificationPage.tsx` | No | Prueba | HECHO |
| Estratificación: inhibidores | «Ha desarrollado inhibidores contra el factor VIII o IX» | Denominación con FvW | Bajo (puntos iguales) | `stratification.ts` | No | Prueba de puntos | HECHO |
| Estratificación: calidad de vida | Puntúa 1 por juicio profesional; aviso si decide el nivel | Revisar sin inventar umbral | **Clínico** | `tests/stratification.test.ts` | — | Límites 0-59 | PENDIENTE DE DECISIÓN (sin cambio de algoritmo) |
| Estratificación: versionado | `model_version`, `score`, `final_priority`, `completed_at`, `answers` por registro (BD) | Reglas y umbrales identificables | Bajo | `stratification.ts` (`STRATIFICATION_RULES`), manifiesto | No | Prueba | HECHO |
| Actuaciones | Sin fecha prevista; solo actuaciones de la visita; realizar una prevista anterior exigía editar la visita de origen | Prevista con fecha, continuidad, sin reescritura ni duplicados | Medio | `interventions.ts`, `interventionService.ts`, `InterventionsPage.tsx` | **Sí, aditiva (pendiente)** | SQL 24 + unitarias + E2E | HECHO en código; BD pendiente de aplicar |
| Cuestionarios en papel | Hoja imprimible sin prellenado | PDF A4, versión, código, visita y fecha | Bajo | `QuestionnairePrintPage.tsx`, `PatientQuestionnairesCard.tsx`, `coamo.css` | No | 3 pruebas | HECHO (PDF vía «Imprimir → Guardar como PDF»; EQ-5D-3L excluido por licencia) |
| EVASAF | Sin total (sin regla) | Suma si está definida; si no, descriptiva diferenciada | Medio | `scoring.ts`, `comparison.ts`, formulario, evolución, exportación | No | 4 pruebas | HECHO como **suma descriptiva no validada** |
| VERITAS-PRN/Pro | Dirección ya correcta (menor = más adherencia) en todas las capas | Comprobar | Bajo | `tests/evasafVeritasDirection.test.ts` | No | 2 pruebas | VERIFICADO (sin defecto) |
| Evolución | Tablas V0/VF y 2 barras (IEXPAC, EQ VAS) | Gráficos por instrumento, fecha real, sin interpolar | Bajo | `evolutionSeries.ts`, `InstrumentTrendChart.tsx` | No | 5 unitarias + E2E | HECHO |
| Exportación | ZIP completo ya con datos clínicos, actuaciones y evolución farmacéutica; faltaba evolución longitudinal por indicador, planificación de actuaciones e índice | Libro estructurado y completo | Medio | `datasets.ts`, `bundle.ts`, `reader.ts`, `csv.ts`, `spec.ts` | No (lee la nueva si existe) | 5 pruebas nuevas | HECHO |

## 2. Causas reales encontradas

- **Exportación «incompleta»**: el paquete de `#/export` ya incluía datos clínicos, actuaciones y evolución farmacéutica; la
  descripción de la pantalla estaba desactualizada (no citaba actuaciones ni evolución) y el Excel no tenía índice, por lo que
  la información era difícil de localizar. Lo que sí faltaba: evolución por indicador con diferencia frente a basal, fecha
  prevista y vínculo entre visitas de las actuaciones, EVASAF agregado y protección de fórmulas en el CSV para Excel.
  Si el colaborador usó `#/questionnaires/export` (CSV de cuestionarios), ese módulo nunca incluyó el resto por diseño.
- **Actuaciones**: el modelo de datos no tenía fecha prevista (`planned_date`) y la página solo cargaba las actuaciones de la
  visita abierta. Además, al navegar entre visitas la página reutilizaba estado (corregido con una instancia por visita).
- **Prefijo «M»**: abreviatura de referencia documental («M Tabla 1, p. 12») mostrada al usuario; no es un código.

## 3. Decisiones tomadas sin respaldo documental completo (a confirmar por el IP)

1. **Hemofilia-específicas ocultas en EVW** (artropatía hemofílica, articulación diana y su localización, tasa anualizada de
   sangrados articulares): por indicación expresa de la petición. La transcripción del protocolo no las restringía. La EVW
   tipo 3 puede presentar hemartrosis: si el IP lo considera, basta con retirar `hiddenFor` (los valores previos se conservaron).
2. **EVASAF 10-50**: ni el documento EVASAF ni el protocolo definen agregación; se implementa como suma descriptiva del
   estudio, solo con 10/10 ítems, separada de una puntuación validada (la BD mantiene `summary_score = null`).
3. **Inhibidores frente a FvW**: el cambio de denominación amplía semánticamente la pregunta en EVW (aloanticuerpos anti-FvW);
   la puntuación (3) no cambia y la pregunta ya se aplicaba a EVW. La BD (`coag_private.strat_spec`) no guarda el texto.
4. **Realización posterior = registro nuevo vinculado** (no edición del registro de origen): preserva el histórico y permite
   contar las actuaciones realizadas en la visita en que se hicieron.
5. **Formato «Excel España»**: apóstrofo delante de textos que empiezan por `= + - @` (visible al abrir el CSV). El estándar y el
   `.xlsx` conservan el texto exacto.

## 4. Decisiones clínicas pendientes (evidencia necesaria)

| Cuestión | Qué hace hoy COAMO | Evidencia necesaria |
|---|---|---|
| Retirada de variables sociosanitarias, comorbilidades, clínicas, de tratamiento y resultados terapéuticos del formulario clínico | Se mantienen (son variables del CRD del protocolo pp. 10-12 según la transcripción) | Documento «DATOS CLÍNICOS»/CRD vigente o enmienda que las retire. El mecanismo `hiddenFor` permite retirarlas sin borrar datos en cuanto se confirme |
| Variables EVW: sangrados mucocutáneos, anemia/ferropenia | No existen | Definición en el protocolo/CRD (tipo, categorías, periodo); requieren columnas nuevas (migración aditiva) |
| Calidad de vida en el índice | Puntúa 1 por juicio profesional; aviso si decide el nivel | Decisión del IP/autores del modelo. Si se retira: nueva versión del modelo (máximo 58; cortes 20/28 sin cambios, porque se fijaron sin esa variable; sin huecos, probado), en el frontend y en `coag_private.stratification_result`, sin recalcular registros históricos |
| Menores en transición | Excluidos (protocolo p. 9; HIP/CI solo de adultos) | Enmienda aprobada por el CEIm y HIP/CI de menores, si se quisiera incluirlos |
| Condiciones de reproducción de IEXPAC (titular de derechos no indicado) | Hoja imprimible con aviso | Confirmación del IP |

## 5. Pruebas ejecutadas (22/11/2026)

| Ámbito | Resultado |
|---|---|
| `npx tsc -b` | Sin errores |
| Vitest | 222 superadas, 4 omitidas (requieren PostgreSQL con el esquema canónico) |
| `npm run build` | OK |
| `bash db/pending/tests/run.sh` (PostgreSQL 16 efímero) | 24 aserciones superadas, idempotencia y reversión ejecutadas |
| E2E con API simulada a 1280 y 390 px | cuestionarios 48/48, agenda-exportación 19/19, actuaciones-evolución-biblioteca 38/38 |

No ejecutado: `tests/researchExport.db.test.ts` y `scripts/test-db.sh` (requieren el repositorio canónico `ramonmorillo/dermapex`,
no accesible en esta sesión); lectores de pantalla.
