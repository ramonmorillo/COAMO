# COAMO · Estratificación CMO en coagulopatías congénitas

Fuente («M»): SEFH, *Adaptación del Modelo de Atención Farmacéutica CMO al paciente con coagulopatías congénitas*, v2.0
(documento aportado por el IP el 27/10/2026). Versión registrada: `CMO-COAG-SEFH-v2.0`.
Implementación: `src/domain/stratification.ts` (motor puro), `src/pages/StratificationPage.tsx` (`#/visits/:visitId/stratification`),
pruebas `tests/stratification.test.ts` y pasos de E2E en `e2e/questionnaires.smoke.cjs`.

**Estado: el cálculo funciona en cualquier visita realizada, pero NO se guarda** (falta la tabla en la BD; ver §6).

## 1. Modelo tal como figura en M

- 23 variables en 4 dimensiones (Tablas 1-4, pp. 12-16), con pesos de 1 a 4. Máximos: demográfica 3, clínica 25,
  tratamiento 15, sociosanitaria 16 (15 sin «calidad de vida»). Total 59 (58 sin calidad de vida).
- Puntos de corte (p. 17): 20 → Prioridad 2; 28 → Prioridad 1. Fijados en un pretest (81 pacientes, 5 hospitales, mayo-junio
  2025) **sin** la variable calidad de vida.
- Excepciones (p. 17): terapia génica u otra terapia avanzada → Prioridad 1 sea cual sea la puntuación; < 18 años → modelo
  pediátrico.
- Periodicidad (pp. 18-19): al inicio de tratamiento, ante cambios de tratamiento o clínica, acontecimientos adversos y según
  prioridad (P1 mensual, P2 cada 6 meses, P3 cada 12 meses). El farmacéutico puede situar al paciente en un nivel superior.
- Decisión del IP (27/10/2026): se puede estratificar en cualquier visita.

## 2. Reglas de lectura adoptadas (y por qué)

| Punto | Decisión | Base |
|---|---|---|
| Variables con dos descripciones (Cambios en el régimen; Comorbilidades; Estilo de vida) | Las dos descripciones **suman** (26 preguntas para 23 variables) | Es la única lectura que reproduce los máximos 25/15/16 de M; el caso clínico 1 suma «cambio de tratamiento (2)» + «dosis adicionales (3)» |
| Puntos de corte | Inclusivos: ≥ 28 P1; ≥ 20 P2 | Redacción «20 puntos para el nivel de Prioridad 2»; la figura 4 no lo contradice |
| Vía subcutánea exclusiva | 0 puntos | M solo puntúa s.c.+i.v. (1) e i.v. (2); el caso clínico 1 (emicizumab s.c.) no puntúa vía |
| Gravedad hemofilia leve | 0 puntos (M: «>5 % – <40 %») | Literal; el protocolo define leve como >5 % sin límite superior |
| Dato ausente | No vale 0: intervalo [mín., máx.]; nivel solo si ambos extremos coinciden | Evita clasificar a la baja por falta de datos |
| Terapia avanzada sin responder | Nivel sin determinar | Si fuera «sí», sería P1 |
| Calidad de vida | Se incluye (M v2.0 la lista) y se **avisa** si el nivel depende de ese punto | Los puntos de corte se validaron sin ella |
| Elevación de nivel | Solo hacia arriba y con motivo obligatorio | M p. 19 |

Verificación: el caso clínico 1 de M (pp. 63-65) da 2 + 18 + 9 + 2 = 31 → Prioridad 1 en el motor (prueba automática).

## 3. Incoherencias o vacíos de M (a consultar con los autores; no suplidos con supuestos)

1. **Gravedad según tipo de hemorragia**: ingreso hospitalario = 2 puntos y manejo ambulatorio/domiciliario = 3. Es contraintuitivo
   (más puntos al caso menos grave). Se implementa literal, con aviso en pantalla. El caso clínico 1 puntúa «manejo domiciliario (3)», coherente con la tabla.
2. **Número de hemorragias**: la tabla dice «más de 2 al año»; el caso clínico dice «2 o más». Se usa la tabla (> 2).
3. **Patología articular degenerativa (2)** frente a **Estado/salud articular (3)**: M no aclara si un mismo daño articular puntúa en ambas.
   Se preguntan por separado y se avisa.
4. **Falta de adherencia (4)** y **baja calidad de vida (1)**: M no da umbral (ni % de dispensación ni punto de corte de EQ-5D):
   juicio profesional. VERITAS no interviene en el cálculo.
5. **Edad**: solo se registra la edad en la inclusión (sin fecha de nacimiento); en visitas posteriores la propuesta puede
   quedar desfasada en el límite de 50 años. El profesional confirma.
6. **Otra terapia avanzada**: el protocolo solo distingue «terapia génica»; otras terapias avanzadas deben indicarse a mano.

## 4. Correspondencia con los datos clínicos del protocolo (propuestas, siempre confirmables)

La página propone respuestas desde los datos clínicos de la visita o, si no tiene (visitas de seguimiento/contactos), del
registro V0/VF más reciente anterior, indicando su fecha. Nunca propone «No» a partir de un dato ausente ni cuando la variable
del protocolo cubre solo parte de la definición de M. Si el profesional cambia una propuesta, se marca «Difiere de la propuesta».

| Variable M | Dato COAMO | Cobertura |
|---|---|---|
| Edad | `age_at_inclusion` | Aproximada (ver §3.5) |
| Peso | `bmi` ≥ 30; si falta, `obesity` | Completa |
| Inhibidores | `inhibitors` | Completa |
| Dolor | `joint_pain` | Parcial: falta «dolor agudo por hemorragia activa» (3) |
| Estado articular | `hemophilic_arthropathy` = sí | Parcial: contracturas, deformidad, discapacidad, prótesis → a mano |
| Gravedad hemorragia | `bleeding_severity_last_year` | Completa |
| Gravedad hemofilia / EVW | `hemophilia_severity` / `vwd_type` | Completa |
| Nº hemorragias | `spontaneous_bleeds` > 2 | Parcial: confirmar periodo anual y que requirieron tratamiento |
| Comorbilidades | `infection_from_blood_products`, `diabetes` = sí | Parcial: resto de la lista de M → a mano |
| Art. degenerativa, vía, cambios de régimen, dosis adicionales, adherencia, transición, calidad de vida | — | **No recogidas por el protocolo** → a mano |
| Psicológicos | `psychological_problems` | Completa |
| Terapia avanzada | `treatment_type` = `gene_therapy` | Parcial |
| Dispensación domiciliaria | `dispensing_mode` | Completa |
| Régimen | `treatment_regimen` | Completa |
| Socioeconómica | `socioeconomic_status` | Parcial (M incluye falta de apoyo familiar, aislamiento…) |
| Estilo de vida | `physical_activity`; `hypertension`/`smoking`/obesidad | Parcial («entre otros») |
| Acceso | `hospital_access_difficulty` | Completa |
| Conocimiento | `disease_knowledge` | Completa |

Implicación: 7 preguntas del modelo no tienen variable en el protocolo/CRD. Si la estratificación es variable del estudio,
conviene decidir si se registran como datos propios (tabla de §6) o se añaden al CRD clínico.

## 5. Pruebas

`tests/stratification.test.ts` (16): estructura y máximos frente a las tablas, puntos de corte en los límites, caso clínico 1,
datos ausentes (intervalo), excepciones, aviso de calidad de vida, elevación solo hacia arriba y propuestas desde datos clínicos.
E2E: enlace desde la ficha en todas las visitas realizadas, propuestas desde V0 en VF, 23 puntos → Prioridad 2 (cada 6 meses),
elevación con motivo, sin desbordamiento a 1280 y 390 px.

## 6. Pendiente: persistencia en la BD (repositorio canónico `ramonmorillo/dermapex`)

Propuesta de tabla `public.coag_stratifications` (una por visita), con el mismo patrón que los cuestionarios:
`visit_id` (FK, único), `model_version`, `answers jsonb` (`{id_pregunta: valor}`; ausente = sin responder),
`suggestions jsonb` (propuesta y procedencia, para trazabilidad), puntuaciones por dimensión, `score`, `score_min`, `score_max`,
`model_priority`, `basis`, `final_priority`, `raised_reason`, `revision`, autoría y fechas; puntuación y prioridad del modelo
calculadas **por la BD** (espejo de `stratification.ts`, mismos ejemplos en `db-tests`), RLS por `can_access_visit`,
`coag_app_gate` y auditoría. Visitas admitidas: cualquiera no anulada (decisión del IP). Sin la tabla, la página solo calcula.
