# COAMO · Exportación de investigación

Pantalla `#/export` (menú «Exportación»). Motor en `src/services/researchExport/`, adaptado del de DERMAPEX
(commit 6b8560c de `ramonmorillo/dermapex`) al modelo de datos COAMO. Formato `coamo-export-1.0`.

## 1. Garantías

| Garantía | Cómo se consigue | Prueba |
|---|---|---|
| Completa | Lectura paginada (500 filas) con orden estable y recuento exacto antes y después; si no cuadra, se cancela | `tests/researchExport.test.ts` (corte a 1000/100 filas, truncado, cambio concurrente, orden inestable) |
| Fiel | Tablas raw con los valores almacenados; textos sin alterar (saltos de línea, comillas, `;`) | comparación valor a valor CSV ↔ origen en ambos dialectos |
| Verificada | Relectura de cada CSV celda a celda; relectura del ZIP (CRC) y huellas SHA-256 en `manifest.json` | ídem |
| Ámbito correcto | La RLS decide: investigador → sus centros; coordinación → todos; cuenta sin acceso COAMO → nada | `tests/researchExport.db.test.ts` contra el esquema real |
| Importable en SPSS | `.sps` por fichero con tipos, anchuras, etiquetas de variable y de valor | `scripts/validate-export-spss.py` con GNU PSPP (job `export` del CI) |

Ausente = celda vacía (nunca 0 ni −999). Las puntuaciones son las guardadas por la BD (`scores` de los cuestionarios,
`score`/`model_priority`/`final_priority` de la estratificación): **la exportación no recalcula nada clínico**.

## 2. Contenido del ZIP

- `raw/`: `centros`, `pacientes`, `inclusion`, `visitas`, `datos_clinicos`, `cuestionarios_registros`, `estratificaciones`,
  `calendario_final` (vista `coag_patient_schedule`).
- `analisis/long_visitas`: una fila por visita o contacto (estado, modalidad, días desde la basal, estratificación y
  estado/derivados de cada instrumento).
- `analisis/wide_pacientes`: una fila por paciente; sufijos `_v0` (basal) y `_vf` (final): datos clínicos del protocolo
  (pp. 10-12), estratificación, cuestionarios e ítems IEXPAC; cambios `iexpac_global_cambio_vf_v0` (variable principal),
  `eq5d_eva_cambio_vf_v0` y `cmo_puntuacion_cambio_vf_v0`, **solo en pares completos**.
- `analisis/cuestionarios_items`: una fila por ítem (código de respuesta y aplicabilidad de los condicionados IEXPAC).
- `analisis/estratificaciones_respuestas`: una fila por pregunta del modelo (respuesta, puntos del modelo, propuesta desde
  los datos clínicos y si coincide).
- `analisis/incidencias_integridad`: errores (huérfanos, duplicados, datos clínicos fuera de basal/final, valores no
  previstos) y valores a revisar (citas vencidas, final fuera de ventana, fechas futuras, cronología).
- `diccionario_variables.csv`, `.sps` por fichero, `coamo_export.xlsx`, `coamo_export.json`, `LEEME.txt`, `manifest.json`
  (incluye título del estudio y nº de registro del CEIm).

## 3. Columnas que no se exportan

Identificadores de profesionales (`created_by`, `updated_by`, `assessed_by`, `last_corrected_by`) y **texto libre**:
`status_reason_detail`, `last_correction_reason` (cuestionarios) y `raised_reason`, `restratification_reason`,
`last_correction_reason` (estratificación). Se mantiene así el criterio previo de COAMO («sin texto libre»).
Sí se exportan dos textos que son variables del protocolo: `hemostatic_agent` y `target_joint_detail` (la BD limita su
longitud y la interfaz indica no escribir datos identificativos).

**Decisión pendiente del IP:** el motivo de la elevación de prioridad (`raised_reason`) puede ser relevante para el análisis
de la concordancia modelo/criterio profesional. Si se quiere, se puede exportar tras revisar que no contiene datos
identificativos, o codificarlo en un vocabulario cerrado.

## 4. Diferencias con DERMAPEX

- Momentos del estudio: V0/VF (DERMAPEX: basal, meses 3, 6, 9 y 12).
- Sin medicación, intervenciones ni documentos (COAMO no tiene esos módulos todavía).
- Puntuaciones leídas de la BD en lugar de recalcularse en el cliente.
- El CSV de cuestionarios previo (`#/questionnaires/export`, `coamo-q-export-2`) se mantiene por compatibilidad.

## 5. Limitaciones conocidas

- La descarga se genera en el navegador y **no queda registrada en la auditoría**.
- SPSS recorta los espacios finales de los textos (el CSV conserva el valor exacto).
- La prueba contra el esquema real usa PostgreSQL directamente: la capa HTTP de PostgREST (límite de filas) se prueba con
  el origen simulado. La cabecera `Content-Range` (recuentos) se comprobó en la prueba E2E con API simulada.
- Con muchos datos y lectura secuencial la exportación puede tardar; si alguien registra datos mientras tanto, se cancela
  (por diseño) y hay que repetirla.
