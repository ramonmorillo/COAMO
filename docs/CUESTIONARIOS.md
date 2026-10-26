# COAMO · Cuestionarios V0/VF — documentación técnica e informe de limitaciones

Estado: implementado en frontend (este repositorio) y en el historial canónico de migraciones (`ramonmorillo/dermapex`,
`supabase/migrations/20261026120000_coag_questionnaires.sql` + `db-tests/70_coag_questionnaires.sql`).
**La migración NO está aplicada en Supabase**: ver §8.

## 1. Fuentes y clasificación de los documentos

| Documento aportado | Clasificación | Versión registrada | Fuente de la puntuación |
|---|---|---|---|
| CUESTIONARIO_IEXPAC.docx | Escala (PREM), **variable principal** | `IEXPAC-COAMO-2026-10-14` | Protocolo COAMO p. 10 (transcrito en blueprint §10.1). El documento no la incluye |
| EQ-5D-3L_autoadministrado.docx | Escala (PROM), modalidad autoadministrada | `EQ-5D-3L-ES-ES-v2.0-self` (pie: «Spain (Spanish) v2.0») | Perfil y EVA: definición del instrumento. **Sin índice** |
| EQ-5D-3L_administrado_por_profesional.docx | **Mismo instrumento**, modalidad entrevista | `EQ-5D-3L-ES-ES-v1.0-interviewer` (pie: «Spain (Spanish) v1.0») | Igual |
| PROYECTO_EVASAF.docx | Encuesta validada de satisfacción (Monje-Agudo 2015) | `EVASAF-FarmHosp2015-10it` | Solo escala de ítem 1-5; **sin total** |
| VERITAS-PRN.docx | Escala de adherencia (tratamiento a demanda) | `VERITAS-PRN-ES-COAMO-2026-10-14` | **No documentada**: sin puntuación |
| VERITAS-Pro | — | — | **Documento no aportado** |

Ninguno de los cinco documentos es un formulario de datos del estudio: son instrumentos. Los metadatos de la administración
(fecha, modalidad, origen, estado, motivo) son variables técnicas de COAMO, no del instrumento.

## 2. Modelo de datos (`public.coag_questionnaire_administrations`)

Una fila = un instrumento administrado en una visita V0 (`baseline`) o VF (`final`). `unique (visit_id, instrument_code)`.
Vinculación: visita → paciente seudonimizado → centro (FK; el centro y el paciente no pueden cambiar).

| Columna | Contenido | Quién la escribe |
|---|---|---|
| `instrument_code` | IEXPAC, EQ5D3L, EVASAF, VERITAS_PRN, VERITAS_PRO | Cliente (inmutable) |
| `instrument_version` | Según instrumento y modalidad | **BD** |
| `status` | pending, in_progress, completed, not_applicable, not_done | Cliente |
| `status_reason_code` / `_detail` | Motivo (obligatorio en no aplicable / no realizado) | Cliente |
| `administration_mode` | self, assisted, interviewer (EQ-5D: solo self/interviewer) | Cliente |
| `data_source` | electronic, paper | Cliente |
| `administration_date` | Fecha (no futura) | Cliente |
| `responses` | `{ítem: entero}`; clave ausente = no respondido | Cliente (validado por la BD) |
| `item_applicability` | IEXPAC 12-15: condición cumplida sí/no | Cliente |
| `scores`, `scoring_version` | Derivados | **BD** |
| `revision` | +1 en cada cambio; control de concurrencia | **BD** |
| `correction_reason` → `last_correction_reason`, `last_corrected_at/by` | Motivo obligatorio para modificar un completado | Cliente → **BD** |
| `created_by`, `updated_by`, `completed_at`, fechas | Autoría y sellos | **BD** |

Reglas (trigger `coag_private.enforce_questionnaire_administration`): solo V0/VF; no en visitas anuladas; ítems y rangos
del documento; condicionados solo con condición cumplida; «no aplicable/no realizado» con motivo y sin respuestas;
«completado» con fecha, modalidad y ≥1 respuesta; corrección de completados solo con motivo; versión y puntuaciones las
fija la BD. Auditoría: `coag_private.write_audit_log` (valor anterior y nuevo, autor, centro, paciente, visita).

RLS: lectura/alta/edición = acceso a la visita (`coag_private.can_access_visit`: centro asignado o coordinación COAMO);
borrado solo coordinación; barrera restrictiva `coag_app_gate` (sin acceso `coag`, nada). Ninguna FK, helper ni log de DERMAPEX.

Concurrencia: el cliente actualiza con `revision = <cargada>`; si otra persona guardó antes, 0 filas → aviso y no se
sobrescribe. Los borradores viven en la BD (estado «en curso»); **nada clínico en localStorage** (verificado en E2E).

## 3. Puntuación e interpretación

| Instrumento | Implementado | No implementado (motivo) |
|---|---|---|
| IEXPAC | Suma ítems 1-11 (11-55) y global = 10 × (suma − 11) / 44 (0-10) solo con 11 ítems; 4 decimales guardados, 2 mostrados | Imputación de ausentes; uso de ítems 12-15 (no definido); clasificación de respondedores con MCID 1 (P p. 13 solo lo usa para el tamaño muestral) |
| EQ-5D-3L | Perfil de 5 dígitos (solo completo); EVA 0-100 independiente; 0 válido | Índice de utilidad (sin tarifa aprobada); suma de dimensiones |
| EVASAF | Ítems 1-5 y completitud | Total o media (ni documento ni protocolo lo definen) |
| VERITAS-PRN | Códigos de respuesta y completitud por bloque | Puntuación, ítems invertidos, dirección (clave no aportada) |
| VERITAS-Pro | Solo estado (no aplicable / no realizado) | Todo (sin documento) |

Comparación V0–VF: Δ = VF − V0 solo para IEXPAC global/suma y EVA, y solo con ambas mediciones completas; dimensiones
EQ-5D e ítems EVASAF/IEXPAC solo como dirección según el sentido documentado de la escala; VERITAS-PRN sin dirección.
Se avisa si cambian modalidad, versión u origen del dato. Sin umbrales clínicos.

## 4. Pantallas

- Ficha del paciente → **Cuestionarios y resultados comunicados por el paciente** (V0/VF × 5 instrumentos; IEXPAC destacado).
- `#/visits/:visitId/questionnaires/:instrumento` → formulario: modalidad (EQ-5D cambia de texto), progreso, «Sin responder»
  explícito y botón «Borrar respuesta», borrador, completado (avisa si incompleto), corrección con motivo, no aplicable/no
  realizado con motivo, aviso de cambios sin guardar (navegación interna y cierre de pestaña), historial (solo coordinación),
  avisos de aplicabilidad de VERITAS según régimen/diagnóstico/tipo de terapia (orientativos, nunca impuestos).
- `#/patients/:id/questionnaires` → **Evolución de cuestionarios V0–VF**: resumen, pendientes, gráficos por escala, tablas
  de resultados y respuestas individuales; imprimible / PDF (resumen individual).
- `#/questionnaires/export` → CSV (ámbito según RLS).
- Inicio → **Cumplimiento de cuestionarios** (solo recuentos; por centro si se ven varios).

## 5. Exportación

`coamo_cuestionarios_ancho.csv` (paciente × V0/VF, incluso sin visita), `coamo_iexpac_emparejado.csv` (variable principal),
`coamo_diccionario.csv`. Formato estándar (`,` y `.`) o Excel España (`;`, `,` y BOM). Ausente = vacío; estado y motivo en
columnas propias; neutralización de fórmulas; sin texto libre ni UUID. Esquema `coamo-q-export-1`.

## 6. Pruebas (ejecutadas)

| Requisito | Prueba | Resultado |
|---|---|---|
| 1 Integridad frente a documentos | `tests/questionnaireIntegrity.test.ts` (literalidad y orden; mutación verificada) | 14/14 |
| 2 Cálculos con ejemplos | `tests/questionnaireScoring.test.ts` + mismos ejemplos en `db-tests/70_*` | OK (TS y SQL) |
| 3-4 Guardado, recuperación, parcial | `db-tests/70_*` (PostgreSQL 16 local) + E2E | OK |
| 5 Corrección y auditoría | `db-tests/70_*` (motivo, revisión, valor anterior/nuevo, concurrencia) + E2E | OK |
| 6 Comparación V0-VF | `tests/questionnaireLongitudinal.test.ts` | OK |
| 7 CSV | `tests/questionnaireLongitudinal.test.ts` + descarga real en E2E | OK |
| 8 Acceso entre centros | `db-tests/70_*` (CI2 no ve/edita/crea en LAFE; anon; borrado) | OK |
| 9 Separación COAMO–DERMAPEX | `db-tests/70_*` (coordinación DERMAPEX sin acceso; nada en `audit_log`) + inventario de `50_*` | OK |
| 10 GitHub Pages | build con `COAMO_BASE_PATH=/COAMO/` + E2E (HashRouter) a 1280 y 390 px | OK |

Totales: Vitest 84/84; baterías SQL 10-70 superadas (70: 43 aserciones); E2E 29/29.
**No verificado**: comportamiento contra el Supabase real (migración no aplicada); lectores de pantalla reales; impresión
en todos los navegadores; importación efectiva en SPSS/R (solo formato).

## 7. Limitaciones y decisiones pendientes (no suplidas con supuestos)

1. **VERITAS-Pro**: documento no aportado → no implementado. Necesario: documento, versión española y clave.
2. **VERITAS-PRN y VERITAS-Pro no figuran en el protocolo revisado**, que cita **Morisky-Green** para adherencia (P p. 12).
   Confirmar enmienda/aprobación del CEIm y si Morisky-Green se mantiene (no implementado: sin formulario).
3. **VERITAS-PRN**: sin clave de puntuación, sin acreditación de versión española validada ni de permiso de uso; aplicabilidad
   en EVW y terapias no sustitutivas (texto sobre infusiones de factor) pendiente del IP.
4. **IEXPAC**: el documento no indica versión ni algoritmo; uso de ítems 12-15 pendiente del IP.
5. **EQ-5D-3L**: licencia EuroQol y condiciones para cumplimentación electrónica pendientes de confirmar; índice de utilidad
   requiere tarifa aprobada. Versiones distintas por modalidad (v2.0/v1.0) — señaladas al comparar.
6. **EVASAF**: sin regla de total; ítem 2 doble (dos afirmaciones); errata «na X» corregida.
7. **Repositorio público y bundle público**: los textos de los instrumentos (incluido EQ-5D © EuroQol) quedan accesibles
   en GitHub y en el JavaScript publicado, aunque los datos no. Si las licencias lo impiden, mover los textos a una tabla
   protegida por RLS antes de producción.
8. **Vocabulario de motivos** (no aplicable / no realizado) y definición de «visita completa»: propuestas técnicas a validar.
9. Exportaciones no auditadas (se generan en el navegador); no hay instantánea congelada del dataset.
10. Obligatoriedad por protocolo no impuesta: la app no exige ningún instrumento; el profesional marca «no aplicable».
11. Orden de administración en V0 (IEXPAC antes de aplicar CMO): solo indicado en pantalla.

## 8. Despliegue de la migración (pendiente de autorización)

Proyecto Supabase compartido `dermapex` (ref. `efjpjponblmdjlhmmiet`); última migración COAMO aplicada: `coag_patients_visits`.

1. Revisar y fusionar el PR de `ramonmorillo/dermapex` (CI ejecuta `scripts/test-db.sh` en PostgreSQL efímero).
2. Copia de seguridad / punto de restauración.
3. Aplicar `supabase/migrations/20261026120000_coag_questionnaires.sql` con el mismo procedimiento que las anteriores
   (SQL Editor o `supabase db push`). Es aditiva: crea una tabla y funciones `coag_*`; no toca tablas DERMAPEX.
4. Verificar: `select count(*) from public.coag_questionnaire_administrations;` (0) y que la tabla tiene RLS y `coag_app_gate`.
5. Fusionar el PR de COAMO (despliegue a GitHub Pages). El frontend sin la migración muestra error al abrir cuestionarios;
   el resto de la app no se ve afectado.

Reversión (solo sin datos reales): `drop table public.coag_questionnaire_administrations;` y las funciones
`coag_private.questionnaire_*` / `enforce_questionnaire_administration`.
