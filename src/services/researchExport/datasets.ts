// Construcción de los conjuntos exportados a partir de las tablas leídas (función pura, sin red).
// Adaptado del motor de exportación de DERMAPEX al modelo de datos COAMO (tablas coag_*).
//
// · raw/: cada tabla tal cual está almacenada (mismas columnas y valores), para reconstruir y auditar.
//   Se excluyen solo columnas técnicas, de identificación del profesional o de texto libre (ver
//   EXCLUDED_COLUMNS), documentadas en el manifiesto.
// · analisis/: conjuntos para el análisis estadístico (LONG por visita, WIDE por paciente con V0/VF,
//   ítems de cuestionarios, respuestas de la estratificación CMO, incidencias de integridad).
//
// Puntuaciones: las de la BD (columna scores, versión scoring_version; coag_private.questionnaire_scores)
// y las de la estratificación (coag_private.stratification_result). Aquí no se recalcula nada clínico:
// solo se reorganiza. Identificadores: study_code para el paciente y el UUID de cada registro.

import { ALL_CLINICAL_FIELDS, type ClinicalField } from '../../domain/clinicalSchema';
import { INSTRUMENT_CODES, INSTRUMENTS, instrumentItems, type InstrumentCode } from '../../domain/questionnaires/instruments';
import { DIMENSION_LABEL, STRAT_VARIABLES, STRATIFICATION_MODEL_VERSION } from '../../domain/stratification';
import {
  DIAGNOSIS_LABEL, MODALITY_LABEL, QUESTIONNAIRE_SUPPORT_LABEL, SEX_LABEL, STATUS_LABEL, STATUS_REASON_LABEL, VISIT_STATUS_LABEL, VISIT_TYPE_LABEL,
} from '../../domain/study';
import type { TableRequest } from './reader';
import type { ColumnSpec, ColumnType, Dataset } from './spec';

/** Algoritmos aplicados por la BD (para el manifiesto). */
export const QUESTIONNAIRE_SCORING_VERSION = 'coamo-q-1 (coag_private.questionnaire_scores; ver columna scoring_version de cada registro)';
export const STRATIFICATION_SCORING_VERSION = `${STRATIFICATION_MODEL_VERSION} (coag_private.stratification_result; ver columna model_version)`;

// ── Tablas a leer ──────────────────────────────────────────────────────────

const CLINICAL_KEYS = ALL_CLINICAL_FIELDS.map((f) => f.key);

export const TABLE_REQUESTS = {
  centers: { table: 'coag_centers', columns: 'id,code,name,city,center_role,study_number,is_active', orderBy: 'id' },
  patients: {
    table: 'coag_patients',
    columns: 'id,study_code,center_id,center_seq,age_at_inclusion,sex,diagnosis,status,status_reason,inclusion_date,status_changed_at,created_at,updated_at',
    orderBy: 'id',
  },
  inclusions: {
    table: 'coag_inclusions',
    columns:
      'patient_id,inc_age_18,inc_diagnosis,inc_written_consent,inc_no_limiting_condition,inc_hospital_pharmacy_followup,exc_unable_without_support,exc_unable_visits,exc_interfering_trial,questionnaire_support,consent_date,consent_version,verified_in_clinical_record,updated_at',
    orderBy: 'patient_id',
  },
  visits: { table: 'coag_visits', columns: 'id,patient_id,visit_type,visit_date,status,modality,is_scheduled,created_at,updated_at', orderBy: 'id' },
  clinical: { table: 'coag_clinical_assessments', columns: ['visit_id', ...CLINICAL_KEYS, 'bmi', 'updated_at'].join(','), orderBy: 'visit_id' },
  questionnaires: {
    table: 'coag_questionnaire_administrations',
    columns:
      'id,visit_id,instrument_code,instrument_version,status,status_reason_code,administration_mode,data_source,administration_date,responses,item_applicability,scores,scoring_version,revision,last_corrected_at,completed_at,created_at,updated_at',
    orderBy: 'id',
  },
  stratifications: {
    table: 'coag_stratifications',
    columns:
      'id,visit_id,model_version,status,answers,suggestions,clinical_source_visit_id,raised_priority,result,score,score_min,score_max,model_priority,final_priority,revision,last_corrected_at,completed_at,created_at,updated_at',
    orderBy: 'id',
  },
  // Vista: fecha esperada y ventana de la visita final (basal + 12 meses ±1 mes, protocolo p. 14).
  schedule: {
    table: 'coag_patient_schedule',
    columns: 'patient_id,baseline_date,final_due_date,final_window_start,final_window_end,final_date,final_status,final_deviation_days,final_in_window',
    orderBy: 'patient_id',
  },
} satisfies Record<string, TableRequest>;

export type TableKey = keyof typeof TABLE_REQUESTS;

/** Columnas de la base de datos que NO se exportan, con motivo (se listan en el manifiesto). */
export const EXCLUDED_COLUMNS: Array<{ table: string; columns: string; reason: string }> = [
  { table: '(todas)', columns: 'created_by, updated_by, assessed_by, last_corrected_by', reason: 'Identificador del profesional: no es una variable del estudio (consta en coag_audit_log).' },
  {
    table: 'coag_questionnaire_administrations',
    columns: 'status_reason_detail, last_correction_reason, correction_reason',
    reason: 'Texto libre (puede contener datos identificativos). El motivo codificado se exporta en status_reason_code; la existencia de corrección, en revision y last_corrected_at.',
  },
  {
    table: 'coag_stratifications',
    columns: 'raised_reason, restratification_reason, last_correction_reason, correction_reason',
    reason: 'Texto libre. La elevación de prioridad se exporta en raised_priority (y en la variable derivada prioridad_elevada).',
  },
  { table: 'coag_audit_log, coag_profiles, coag_center_memberships', columns: '(tablas completas)', reason: 'Datos de los profesionales y de auditoría: no son variables del estudio.' },
];

type Row = Record<string, unknown>;

export type RawData = Record<TableKey, Row[]>;

// ── Diccionarios de valores ───────────────────────────────────────────────

const YES_NO = { '1': 'Sí', '0': 'No' };
const PRIORITY_VALUES = { '1': 'Prioridad 1', '2': 'Prioridad 2', '3': 'Prioridad 3' };
const CENTER_ROLE_VALUES = { recruiting: 'Reclutador', consulting: 'Consultor (sin inclusión)' };
const QSTATUS_VALUES = { pending: 'Pendiente', in_progress: 'En curso', completed: 'Completado', not_applicable: 'No aplicable', not_done: 'No realizado' };
const QREASON_VALUES = {
  regimen_mismatch: 'No corresponde al régimen de tratamiento',
  diagnosis_mismatch: 'No corresponde al diagnóstico',
  source_document_unavailable: 'Instrumento sin documento fuente aprobado',
  not_in_protocol: 'No previsto en el protocolo',
  patient_declined: 'El paciente no desea responder',
  patient_unable: 'El paciente no puede responder',
  not_administered: 'No se administró',
  other: 'Otro motivo',
};
const MODE_VALUES = { self: 'Autoadministrado', assisted: 'Con ayuda', interviewer: 'Por entrevista' };
const DATA_SOURCE_VALUES = { electronic: 'Electrónico', paper: 'Papel' };
const STRAT_STATUS_VALUES = { in_progress: 'En curso (borrador)', completed: 'Completada' };

const c = (name: string, label: string, type: ColumnType, source: string, extra: Partial<ColumnSpec> = {}): ColumnSpec => ({ name, label, type, source, ...extra });
const createdAt = (table: string) => c('created_at', 'Fecha y hora de creación del registro (UTC)', 'datetime', `${table}.created_at`, { definition: 'Momento de introducción del dato; no es la fecha clínica.' });
const updatedAt = (table: string) => c('updated_at', 'Fecha y hora de la última modificación (UTC)', 'datetime', `${table}.updated_at`);

/** Especificación de una variable clínica del protocolo a partir del esquema declarativo. */
function clinicalColumn(field: ClinicalField, name = field.key, labelSuffix = '', visit?: string): ColumnSpec {
  const type: ColumnType = field.kind === 'enum' || field.kind === 'text' ? 'string' : field.kind;
  return c(name, `${field.label}${labelSuffix}`, type, `coag_clinical_assessments.${field.key}`, {
    values: field.kind === 'enum' ? Object.fromEntries(field.options.map((o) => [o.value, o.label])) : field.kind === 'boolean' ? YES_NO : undefined,
    unit: 'unit' in field ? field.unit : undefined,
    definition: field.hint,
    visit,
    notes: [field.source, field.appliesTo ? `Solo ${field.appliesTo.join('/')}: vacío en el resto de diagnósticos.` : null].filter(Boolean).join('. '),
  });
}

const BMI_FIELD = (name: string, suffix = '', visit?: string) =>
  c(name, `Índice de masa corporal${suffix}`, 'decimal', 'coag_clinical_assessments.bmi', { unit: 'kg/m²', visit, rule: 'Calculado por la BD: peso / altura², 1 decimal (columna generada).' });

// ── Momentos del estudio para el formato WIDE ─────────────────────────────

export const VISIT_SLOTS: Array<{ type: 'baseline' | 'final'; suffix: string; label: string }> = [
  { type: 'baseline', suffix: 'v0', label: 'V0 basal' },
  { type: 'final', suffix: 'vf', label: 'VF final' },
];

const Q_PREFIX: Record<InstrumentCode, string> = { IEXPAC: 'iexpac', EQ5D3L: 'eq5d', EVASAF: 'evasaf', VERITAS_PRN: 'vprn', VERITAS_PRO: 'vpro' };

type Metric = { key: string; suffix: string; label: string; type: ColumnType; rule: string };

/** Derivados documentados que calcula la BD (columna scores). Sin métricas inventadas. */
const Q_METRICS: Record<InstrumentCode, Metric[]> = {
  IEXPAC: [
    { key: 'items_answered', suffix: 'n_respondidos', label: 'IEXPAC ítems 1-11 respondidos (0-11)', type: 'integer', rule: 'scores.items_answered.' },
    { key: 'sum', suffix: 'suma', label: 'IEXPAC suma ítems 1-11 (11-55)', type: 'integer', rule: 'scores.sum; solo con los 11 ítems (sin imputación).' },
    { key: 'global_0_10', suffix: 'global', label: 'IEXPAC puntuación global (0-10). Variable principal', type: 'decimal', rule: 'scores.global_0_10 = 10 × (suma − 11) / 44, 4 decimales (protocolo p. 10); vacío si falta algún ítem 1-11.' },
  ],
  EQ5D3L: [
    { key: 'dimensions_answered', suffix: 'n_dimensiones', label: 'EQ-5D-3L dimensiones respondidas (0-5)', type: 'integer', rule: 'scores.dimensions_answered.' },
    { key: 'profile', suffix: 'perfil', label: 'EQ-5D-3L perfil de salud (5 dígitos, texto)', type: 'string', rule: 'scores.profile; solo con las 5 dimensiones. Sin índice de utilidad (no hay tarifa aprobada).' },
    { key: 'vas', suffix: 'eva', label: 'EQ-5D-3L escala visual analógica (0-100)', type: 'integer', rule: 'scores.vas (valor registrado).' },
  ],
  EVASAF: [{ key: 'items_answered', suffix: 'n_respondidos', label: 'EVASAF ítems respondidos (0-10)', type: 'integer', rule: 'scores.items_answered. Sin puntuación total (no hay regla aprobada).' }],
  VERITAS_PRN: [{ key: 'items_answered', suffix: 'n_respondidos', label: 'VERITAS-PRN ítems respondidos (0-24)', type: 'integer', rule: 'scores.items_answered. Sin puntuación (clave de corrección no aportada).' }],
  VERITAS_PRO: [{ key: 'items_answered', suffix: 'n_respondidos', label: 'VERITAS-Pro ítems respondidos (0-24)', type: 'integer', rule: 'scores.items_answered. Sin puntuación (clave de corrección no aportada).' }],
};

const IEXPAC_ITEM_LABELS = { '1': 'Nunca', '2': 'Casi nunca', '3': 'A veces', '4': 'Casi siempre', '5': 'Siempre' };

// ── Utilidades ────────────────────────────────────────────────────────────

const ITEM_COLLATOR = new Intl.Collator('es', { numeric: true });

function daysBetween(fromIso: string | null | undefined, toIso: string | null | undefined): number | null {
  if (!fromIso || !toIso) return null;
  const [y1, m1, d1] = fromIso.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = toIso.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function scoreValue(scores: unknown, key: string, type: ColumnType): unknown {
  if (!scores || typeof scores !== 'object') return null;
  const value = (scores as Row)[key];
  if (value === null || value === undefined) return null;
  if (type === 'string') return typeof value === 'string' ? value : null;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export type IntegrityIssue = {
  tipo: string;
  gravedad: 'error' | 'revisar';
  tabla: string;
  registro_id: string | null;
  study_code: string | null;
  detalle: string;
};

export type BuildResult = { datasets: Dataset[]; issues: IntegrityIssue[] };

// ── Construcción ──────────────────────────────────────────────────────────

export function buildDatasets(raw: RawData, todayIso: string): BuildResult {
  const issues: IntegrityIssue[] = [];
  const centerById = new Map(raw.centers.map((r) => [r.id as string, r]));
  const patientById = new Map(raw.patients.map((r) => [r.id as string, r]));
  const visitById = new Map(raw.visits.map((r) => [r.id as string, r]));
  const inclusionByPatient = new Map(raw.inclusions.map((r) => [r.patient_id as string, r]));
  const scheduleByPatient = new Map(raw.schedule.map((r) => [r.patient_id as string, r]));
  const clinicalByVisit = new Map(raw.clinical.map((r) => [r.visit_id as string, r]));
  const strataByVisit = new Map(raw.stratifications.map((r) => [r.visit_id as string, r]));

  const studyCodeOfPatient = (patientId: unknown) => (patientById.get(patientId as string)?.study_code as string | undefined) ?? null;
  const studyCodeOfVisit = (visitId: unknown) => studyCodeOfPatient(visitById.get(visitId as string)?.patient_id);
  const centerOfPatient = (patientId: unknown) => centerById.get(patientById.get(patientId as string)?.center_id as string);
  const issue = (tipo: string, gravedad: IntegrityIssue['gravedad'], tabla: string, registro_id: string | null, study_code: string | null, detalle: string) =>
    issues.push({ tipo, gravedad, tabla, registro_id, study_code, detalle });

  // ── Integridad referencial y reglas del estudio dentro de la extracción ──
  for (const p of raw.patients) {
    if (!centerById.has(p.center_id as string)) issue('centro_no_exportado', 'error', 'coag_patients', p.id as string, p.study_code as string, 'El centro del paciente no está en la extracción.');
    if (p.status !== 'screening' && p.status !== 'not_included' && !inclusionByPatient.has(p.id as string)) {
      issue('dato_incompleto', 'error', 'coag_inclusions', p.id as string, p.study_code as string, 'Paciente incluido sin registro de elegibilidad y consentimiento.');
    }
  }
  for (const i of raw.inclusions) {
    if (!patientById.has(i.patient_id as string)) issue('registro_huerfano', 'error', 'coag_inclusions', i.patient_id as string, null, 'El paciente del registro de inclusión no está en la extracción.');
  }
  const checkVisitRef = (table: string, rows: Row[], idKey: string) => {
    for (const r of rows) {
      if (!visitById.has(r.visit_id as string)) issue('registro_huerfano', 'error', table, r[idKey] as string, null, 'La visita referenciada no está en la extracción.');
    }
  };
  for (const v of raw.visits) {
    const p = patientById.get(v.patient_id as string);
    if (!p) {
      issue('registro_huerfano', 'error', 'coag_visits', v.id as string, null, 'El paciente de la visita no está en la extracción.');
      continue;
    }
    const code = p.study_code as string;
    const date = v.visit_date as string;
    if (v.status === 'completed' && date > todayIso) issue('fecha_futura', 'revisar', 'coag_visits', v.id as string, code, `Visita realizada con fecha posterior a la extracción (${date}).`);
    if (v.status === 'scheduled' && date < todayIso) issue('cita_vencida', 'revisar', 'coag_visits', v.id as string, code, `Visita programada para ${date} sin registrar su realización (sigue en estado «programada»).`);
    if (p.inclusion_date && date < (p.inclusion_date as string) && v.status !== 'cancelled') {
      issue('cronologia', 'revisar', 'coag_visits', v.id as string, code, `Visita ${String(v.visit_type)} anterior a la fecha de inclusión (${date} < ${String(p.inclusion_date)}).`);
    }
  }
  checkVisitRef('coag_clinical_assessments', raw.clinical, 'visit_id');
  checkVisitRef('coag_questionnaire_administrations', raw.questionnaires, 'id');
  checkVisitRef('coag_stratifications', raw.stratifications, 'id');
  for (const ca of raw.clinical) {
    const v = visitById.get(ca.visit_id as string);
    if (v && v.visit_type !== 'baseline' && v.visit_type !== 'final') {
      issue('regla_estudio', 'error', 'coag_clinical_assessments', ca.visit_id as string, studyCodeOfVisit(ca.visit_id), `Datos clínicos en una visita de tipo ${String(v.visit_type)} (solo basal y final).`);
    }
  }
  for (const s of raw.stratifications) {
    if (s.status === 'completed' && s.final_priority == null) {
      issue('dato_incompleto', 'revisar', 'coag_stratifications', s.id as string, studyCodeOfVisit(s.visit_id), 'Estratificación completada sin prioridad asignada (respuestas que no permiten fijar el nivel).');
    }
  }
  for (const sch of raw.schedule) {
    if (sch.final_date && sch.final_in_window === false) {
      issue('fuera_de_ventana', 'revisar', 'coag_patient_schedule', sch.patient_id as string, studyCodeOfPatient(sch.patient_id), `Visita final fuera de la ventana de 12 meses ±1 mes (${Number(sch.final_deviation_days) > 0 ? '+' : ''}${String(sch.final_deviation_days)} días respecto a la fecha esperada).`);
    }
  }
  // Basal/final activas duplicadas (no debería ocurrir: índices únicos uq_coag_visits_one_baseline/final).
  const activeByPatientType = new Map<string, Row[]>();
  for (const v of raw.visits) {
    if ((v.visit_type !== 'baseline' && v.visit_type !== 'final') || v.status === 'cancelled') continue;
    const key = `${String(v.patient_id)}|${String(v.visit_type)}`;
    activeByPatientType.set(key, [...(activeByPatientType.get(key) ?? []), v]);
  }
  for (const list of activeByPatientType.values()) {
    if (list.length > 1) issue('visita_duplicada', 'error', 'coag_visits', list.map((v) => v.id).join('|'), studyCodeOfPatient(list[0].patient_id), `${list.length} visitas ${String(list[0].visit_type)} no anuladas.`);
  }

  // ── RAW ──
  const visitStatusValues = VISIT_STATUS_LABEL as Record<string, string>;
  const rawDatasets: Dataset[] = [
    {
      id: 'centros', folder: 'raw', title: 'Centros participantes', grain: 'Un centro', key: ['id'],
      columns: [
        c('id', 'Identificador del centro (UUID)', 'string', 'coag_centers.id'),
        c('code', 'Código del centro', 'string', 'coag_centers.code'),
        c('name', 'Nombre del centro', 'string', 'coag_centers.name'),
        c('city', 'Ciudad', 'string', 'coag_centers.city'),
        c('center_role', 'Papel del centro', 'string', 'coag_centers.center_role', { values: CENTER_ROLE_VALUES }),
        c('study_number', 'Número de centro en el código de paciente', 'integer', 'coag_centers.study_number'),
        c('is_active', 'Centro activo', 'boolean', 'coag_centers.is_active', { values: YES_NO }),
      ],
      rows: raw.centers,
    },
    {
      id: 'pacientes', folder: 'raw', title: 'Pacientes (seudonimizados)', grain: 'Un paciente', key: ['id'],
      columns: [
        c('id', 'Identificador interno del paciente (UUID)', 'string', 'coag_patients.id'),
        c('study_code', 'Código de estudio del paciente', 'string', 'coag_patients.study_code', { definition: 'Código seudonimizado asignado por la BD (COAMO-<n.º centro>-NNNN).' }),
        c('center_id', 'Identificador del centro (UUID)', 'string', 'coag_patients.center_id'),
        c('center_seq', 'Correlativo del paciente en el centro', 'integer', 'coag_patients.center_seq'),
        c('age_at_inclusion', 'Edad en la inclusión', 'integer', 'coag_patients.age_at_inclusion', { unit: 'años' }),
        c('sex', 'Sexo', 'string', 'coag_patients.sex', { values: SEX_LABEL }),
        c('diagnosis', 'Diagnóstico', 'string', 'coag_patients.diagnosis', { values: DIAGNOSIS_LABEL }),
        c('status', 'Estado en el estudio', 'string', 'coag_patients.status', { values: STATUS_LABEL }),
        c('status_reason', 'Motivo del estado', 'string', 'coag_patients.status_reason', { values: STATUS_REASON_LABEL, notes: 'Vocabulario provisional (el protocolo no define motivos).' }),
        c('inclusion_date', 'Fecha de inclusión', 'date', 'coag_patients.inclusion_date'),
        c('status_changed_at', 'Fecha y hora del último cambio de estado (UTC)', 'datetime', 'coag_patients.status_changed_at'),
        createdAt('coag_patients'),
        updatedAt('coag_patients'),
      ],
      rows: raw.patients,
    },
    {
      id: 'inclusion', folder: 'raw', title: 'Elegibilidad y consentimiento (protocolo p. 9)', grain: 'Un paciente', key: ['patient_id'],
      columns: [
        c('patient_id', 'Identificador del paciente (UUID)', 'string', 'coag_inclusions.patient_id'),
        c('inc_age_18', 'Inclusión: edad ≥ 18 años', 'boolean', 'coag_inclusions.inc_age_18', { values: YES_NO }),
        c('inc_diagnosis', 'Inclusión: diagnóstico de HA, HB o EVW', 'boolean', 'coag_inclusions.inc_diagnosis', { values: YES_NO }),
        c('inc_written_consent', 'Inclusión: consentimiento escrito', 'boolean', 'coag_inclusions.inc_written_consent', { values: YES_NO }),
        c('inc_no_limiting_condition', 'Inclusión: sin condición limitante', 'boolean', 'coag_inclusions.inc_no_limiting_condition', { values: YES_NO }),
        c('inc_hospital_pharmacy_followup', 'Inclusión: seguimiento en consulta externa de FH', 'boolean', 'coag_inclusions.inc_hospital_pharmacy_followup', { values: YES_NO }),
        c('exc_unable_without_support', 'Exclusión: no puede cumplimentar sin apoyo suficiente', 'boolean', 'coag_inclusions.exc_unable_without_support', { values: YES_NO }),
        c('exc_unable_visits', 'Exclusión: no puede completar las visitas', 'boolean', 'coag_inclusions.exc_unable_visits', { values: YES_NO }),
        c('exc_interfering_trial', 'Exclusión: ensayo que interfiere', 'boolean', 'coag_inclusions.exc_interfering_trial', { values: YES_NO }),
        c('questionnaire_support', 'Apoyo para cumplimentar cuestionarios', 'string', 'coag_inclusions.questionnaire_support', { values: QUESTIONNAIRE_SUPPORT_LABEL }),
        c('consent_date', 'Fecha del consentimiento escrito', 'date', 'coag_inclusions.consent_date'),
        c('consent_version', 'Versión de la HIP/CI', 'string', 'coag_inclusions.consent_version', { notes: 'Versión aprobada por el CEIm: HIP/CI adultos v2 de 25/09/2026.' }),
        c('verified_in_clinical_record', 'Criterios verificados en la historia clínica', 'boolean', 'coag_inclusions.verified_in_clinical_record', { values: YES_NO }),
        updatedAt('coag_inclusions'),
      ],
      rows: raw.inclusions,
    },
    {
      id: 'visitas', folder: 'raw', title: 'Visitas y contactos', grain: 'Una visita o contacto', key: ['id'],
      columns: [
        c('id', 'Identificador de la visita (UUID)', 'string', 'coag_visits.id'),
        c('patient_id', 'Identificador del paciente (UUID)', 'string', 'coag_visits.patient_id'),
        c('visit_type', 'Tipo de visita', 'string', 'coag_visits.visit_type', { values: VISIT_TYPE_LABEL }),
        c('visit_date', 'Fecha de la visita', 'date', 'coag_visits.visit_date', { definition: 'Fecha realizada o, si status = scheduled, fecha programada.' }),
        c('status', 'Estado de la visita', 'string', 'coag_visits.status', { values: visitStatusValues }),
        c('modality', 'Modalidad', 'string', 'coag_visits.modality', { values: MODALITY_LABEL }),
        c('is_scheduled', 'Visita programada (frente a no programada)', 'boolean', 'coag_visits.is_scheduled', { values: YES_NO }),
        createdAt('coag_visits'),
        updatedAt('coag_visits'),
      ],
      rows: raw.visits,
    },
    {
      id: 'datos_clinicos', folder: 'raw', title: 'Datos clínicos y de tratamiento (visitas basal y final; protocolo pp. 10-12)', grain: 'Una visita basal o final', key: ['visit_id'],
      columns: [
        c('visit_id', 'Identificador de la visita (UUID)', 'string', 'coag_clinical_assessments.visit_id'),
        ...ALL_CLINICAL_FIELDS.map((f) => clinicalColumn(f)),
        BMI_FIELD('bmi'),
        updatedAt('coag_clinical_assessments'),
      ],
      rows: raw.clinical,
    },
    {
      id: 'cuestionarios_registros', folder: 'raw', title: 'Cuestionarios (registro original)', grain: 'Un instrumento administrado en una visita', key: ['id'],
      columns: [
        c('id', 'Identificador del registro (UUID)', 'string', 'coag_questionnaire_administrations.id'),
        c('visit_id', 'Identificador de la visita (UUID)', 'string', 'coag_questionnaire_administrations.visit_id'),
        c('instrument_code', 'Instrumento', 'string', 'coag_questionnaire_administrations.instrument_code', { values: Object.fromEntries(INSTRUMENT_CODES.map((code) => [code, INSTRUMENTS[code].shortName])) }),
        c('instrument_version', 'Versión del instrumento', 'string', 'coag_questionnaire_administrations.instrument_version'),
        c('status', 'Estado de cumplimentación', 'string', 'coag_questionnaire_administrations.status', { values: QSTATUS_VALUES }),
        c('status_reason_code', 'Motivo (no aplicable / no realizado)', 'string', 'coag_questionnaire_administrations.status_reason_code', { values: QREASON_VALUES, notes: 'Vocabulario provisional.' }),
        c('administration_mode', 'Modalidad de administración', 'string', 'coag_questionnaire_administrations.administration_mode', { values: MODE_VALUES }),
        c('data_source', 'Origen del dato', 'string', 'coag_questionnaire_administrations.data_source', { values: DATA_SOURCE_VALUES }),
        c('administration_date', 'Fecha de administración', 'date', 'coag_questionnaire_administrations.administration_date'),
        c('responses', 'Respuestas originales (JSON)', 'json', 'coag_questionnaire_administrations.responses', { definition: 'Clave = ítem; valor = código de opción. Clave ausente = no respondido. Desglose en analisis/cuestionarios_items.' }),
        c('item_applicability', 'Aplicabilidad de ítems condicionados (JSON)', 'json', 'coag_questionnaire_administrations.item_applicability', { definition: 'Solo IEXPAC q12-q15: true = se cumple la condición; false = no aplica.' }),
        c('scores', 'Derivados calculados por la BD (JSON)', 'json', 'coag_questionnaire_administrations.scores'),
        c('scoring_version', 'Versión del algoritmo de derivados', 'string', 'coag_questionnaire_administrations.scoring_version'),
        c('revision', 'Número de revisión del registro', 'integer', 'coag_questionnaire_administrations.revision', { definition: '>1 = editado o corregido tras su creación.' }),
        c('last_corrected_at', 'Fecha y hora de la última corrección tras completarse (UTC)', 'datetime', 'coag_questionnaire_administrations.last_corrected_at'),
        c('completed_at', 'Fecha y hora en que se completó (UTC)', 'datetime', 'coag_questionnaire_administrations.completed_at'),
        createdAt('coag_questionnaire_administrations'),
        updatedAt('coag_questionnaire_administrations'),
      ],
      rows: raw.questionnaires,
    },
    {
      id: 'estratificaciones', folder: 'raw', title: `Estratificaciones CMO (${STRATIFICATION_MODEL_VERSION})`, grain: 'Una estratificación por visita', key: ['id'],
      columns: [
        c('id', 'Identificador de la estratificación (UUID)', 'string', 'coag_stratifications.id'),
        c('visit_id', 'Identificador de la visita (UUID)', 'string', 'coag_stratifications.visit_id'),
        c('model_version', 'Versión del modelo CMO', 'string', 'coag_stratifications.model_version'),
        c('status', 'Estado', 'string', 'coag_stratifications.status', { values: STRAT_STATUS_VALUES }),
        c('answers', 'Respuestas del profesional (JSON)', 'json', 'coag_stratifications.answers', { definition: 'Clave = pregunta del modelo; valor = código de opción. Clave ausente = sin responder (no equivale a 0 puntos). Desglose en analisis/estratificaciones_respuestas.' }),
        c('suggestions', 'Propuestas desde los datos clínicos (JSON)', 'json', 'coag_stratifications.suggestions'),
        c('clinical_source_visit_id', 'Visita de la que proceden las propuestas (UUID)', 'string', 'coag_stratifications.clinical_source_visit_id'),
        c('raised_priority', 'Prioridad elevada por criterio profesional', 'integer', 'coag_stratifications.raised_priority', { values: PRIORITY_VALUES }),
        c('result', 'Resultado calculado por la BD (JSON)', 'json', 'coag_stratifications.result', { definition: 'status, basis, score, score_min, score_max, by_dimension, missing, qol_dependent.' }),
        c('score', 'Puntuación CMO total', 'integer', 'coag_stratifications.score', { definition: 'Vacía si hay preguntas puntuables sin responder (ver score_min/score_max).' }),
        c('score_min', 'Puntuación mínima posible con las respuestas dadas', 'integer', 'coag_stratifications.score_min'),
        c('score_max', 'Puntuación máxima posible con las respuestas dadas', 'integer', 'coag_stratifications.score_max'),
        c('model_priority', 'Prioridad según el modelo', 'integer', 'coag_stratifications.model_priority', { values: PRIORITY_VALUES, rule: '≥ 28 → 1; ≥ 20 → 2; resto → 3; terapia avanzada → 1 (modelo SEFH v2.0, p. 17).' }),
        c('final_priority', 'Prioridad asignada', 'integer', 'coag_stratifications.final_priority', { values: PRIORITY_VALUES, definition: 'La del modelo o la elevada por criterio profesional (solo hacia arriba).' }),
        c('revision', 'Número de revisión del registro', 'integer', 'coag_stratifications.revision'),
        c('last_corrected_at', 'Fecha y hora de la última corrección (UTC)', 'datetime', 'coag_stratifications.last_corrected_at'),
        c('completed_at', 'Fecha y hora en que se completó (UTC)', 'datetime', 'coag_stratifications.completed_at'),
        createdAt('coag_stratifications'),
        updatedAt('coag_stratifications'),
      ],
      rows: raw.stratifications,
    },
    {
      id: 'calendario_final', folder: 'raw', title: 'Ventana de la visita final (vista coag_patient_schedule)', grain: 'Un paciente', key: ['patient_id'],
      columns: [
        c('patient_id', 'Identificador del paciente (UUID)', 'string', 'coag_patient_schedule.patient_id'),
        c('baseline_date', 'Fecha de la visita basal', 'date', 'coag_patient_schedule.baseline_date'),
        c('final_due_date', 'Fecha esperada de la visita final', 'date', 'coag_patient_schedule.final_due_date', { rule: 'Basal + 12 meses (protocolo p. 14).' }),
        c('final_window_start', 'Inicio de la ventana de la visita final', 'date', 'coag_patient_schedule.final_window_start', { rule: 'Basal + 11 meses.' }),
        c('final_window_end', 'Fin de la ventana de la visita final', 'date', 'coag_patient_schedule.final_window_end', { rule: 'Basal + 13 meses.' }),
        c('final_date', 'Fecha de la visita final', 'date', 'coag_patient_schedule.final_date'),
        c('final_status', 'Estado de la visita final', 'string', 'coag_patient_schedule.final_status', { values: visitStatusValues }),
        c('final_deviation_days', 'Desviación de la visita final respecto a la fecha esperada', 'integer', 'coag_patient_schedule.final_deviation_days', { unit: 'días' }),
        c('final_in_window', 'Visita final dentro de la ventana', 'boolean', 'coag_patient_schedule.final_in_window', { values: YES_NO }),
      ],
      rows: raw.schedule,
    },
  ];

  // ── Cuestionarios por visita e instrumento ──
  const adminByVisit = new Map<string, Map<string, Row>>();
  for (const q of raw.questionnaires) {
    if (!adminByVisit.has(q.visit_id as string)) adminByVisit.set(q.visit_id as string, new Map());
    adminByVisit.get(q.visit_id as string)!.set(q.instrument_code as string, q);
  }

  const instrumentColumns = (suffix: string, visitLabel: string, visit?: string): ColumnSpec[] =>
    INSTRUMENT_CODES.flatMap((code) => {
      const p = Q_PREFIX[code];
      const name = INSTRUMENTS[code].shortName;
      return [
        c(`${p}_estado${suffix}`, `${name}: estado${visitLabel}`, 'string', 'coag_questionnaire_administrations.status', { instrument: name, visit, values: QSTATUS_VALUES, notes: 'Vacío = sin registro en la visita (pendiente de iniciar).' }),
        c(`${p}_motivo${suffix}`, `${name}: motivo no aplicable / no realizado${visitLabel}`, 'string', 'coag_questionnaire_administrations.status_reason_code', { instrument: name, visit, values: QREASON_VALUES }),
        ...Q_METRICS[code].map((m) => c(`${p}_${m.suffix}${suffix}`, `${m.label}${visitLabel}`, m.type, 'coag_questionnaire_administrations.scores', { instrument: name, visit, rule: `${m.rule} Calculado por la BD (${QUESTIONNAIRE_SCORING_VERSION}).` })),
      ];
    });
  const instrumentValues = (visitId: string | null, suffix: string): Row => {
    const out: Row = {};
    const byCode = visitId ? adminByVisit.get(visitId) : undefined;
    for (const code of INSTRUMENT_CODES) {
      const p = Q_PREFIX[code];
      const a = byCode?.get(code);
      out[`${p}_estado${suffix}`] = a?.status ?? null;
      out[`${p}_motivo${suffix}`] = a?.status_reason_code ?? null;
      for (const m of Q_METRICS[code]) out[`${p}_${m.suffix}${suffix}`] = a ? scoreValue(a.scores, m.key, m.type) : null;
    }
    return out;
  };

  const strataColumns = (suffix: string, visitLabel: string, visit?: string): ColumnSpec[] => [
    c(`cmo_estado${suffix}`, `Estratificación CMO: estado${visitLabel}`, 'string', 'coag_stratifications.status', { visit, values: STRAT_STATUS_VALUES, notes: 'Vacío = sin estratificación en la visita.' }),
    c(`cmo_puntuacion${suffix}`, `Puntuación CMO total${visitLabel}`, 'integer', 'coag_stratifications.score', { visit }),
    c(`cmo_puntuacion_min${suffix}`, `Puntuación CMO mínima posible${visitLabel}`, 'integer', 'coag_stratifications.score_min', { visit }),
    c(`cmo_puntuacion_max${suffix}`, `Puntuación CMO máxima posible${visitLabel}`, 'integer', 'coag_stratifications.score_max', { visit }),
    c(`cmo_prioridad_modelo${suffix}`, `Prioridad CMO según el modelo${visitLabel}`, 'integer', 'coag_stratifications.model_priority', { visit, values: PRIORITY_VALUES }),
    c(`cmo_prioridad${suffix}`, `Prioridad CMO asignada${visitLabel}`, 'integer', 'coag_stratifications.final_priority', { visit, values: PRIORITY_VALUES }),
    c(`cmo_prioridad_elevada${suffix}`, `Prioridad elevada por criterio profesional${visitLabel}`, 'boolean', 'derivada', { visit, values: YES_NO, rule: 'raised_priority no vacío. Vacío si no hay estratificación.' }),
  ];
  const strataValues = (visitId: string | null, suffix: string): Row => {
    const s = visitId ? strataByVisit.get(visitId) : undefined;
    return {
      [`cmo_estado${suffix}`]: s?.status ?? null,
      [`cmo_puntuacion${suffix}`]: s?.score ?? null,
      [`cmo_puntuacion_min${suffix}`]: s?.score_min ?? null,
      [`cmo_puntuacion_max${suffix}`]: s?.score_max ?? null,
      [`cmo_prioridad_modelo${suffix}`]: s?.model_priority ?? null,
      [`cmo_prioridad${suffix}`]: s?.final_priority ?? null,
      [`cmo_prioridad_elevada${suffix}`]: s ? s.raised_priority != null : null,
    };
  };

  const sortedVisits = [...raw.visits].sort(
    (a, b) => String(studyCodeOfPatient(a.patient_id) ?? '').localeCompare(String(studyCodeOfPatient(b.patient_id) ?? ''))
      || String(a.visit_date).localeCompare(String(b.visit_date))
      || String(a.id).localeCompare(String(b.id)),
  );

  // ── LONG: una fila por visita ──
  const longColumns: ColumnSpec[] = [
    c('study_code', 'Código de estudio del paciente', 'string', 'coag_patients.study_code'),
    c('center_code', 'Código del centro', 'string', 'coag_centers.code'),
    c('diagnosis', 'Diagnóstico', 'string', 'coag_patients.diagnosis', { values: DIAGNOSIS_LABEL }),
    c('visit_id', 'Identificador de la visita (UUID)', 'string', 'coag_visits.id'),
    c('visit_type', 'Tipo de visita', 'string', 'coag_visits.visit_type', { values: VISIT_TYPE_LABEL }),
    c('visit_date', 'Fecha de la visita', 'date', 'coag_visits.visit_date'),
    c('visit_status', 'Estado de la visita', 'string', 'coag_visits.status', { values: visitStatusValues }),
    c('modality', 'Modalidad', 'string', 'coag_visits.modality', { values: MODALITY_LABEL }),
    c('is_scheduled', 'Visita programada (frente a no programada)', 'boolean', 'coag_visits.is_scheduled', { values: YES_NO }),
    c('dias_desde_basal', 'Días desde la visita basal', 'integer', 'derivada', { unit: 'días', rule: 'visit_date − fecha de la basal no anulada; vacío si no hay basal.' }),
    c('datos_clinicos_registrados', 'Datos clínicos registrados en la visita', 'boolean', 'derivada', { values: YES_NO, rule: 'Existe registro en coag_clinical_assessments (solo basal y final).' }),
    ...strataColumns('', ''),
    ...instrumentColumns('', ''),
  ];
  const longRows = sortedVisits.map((v) => {
    const p = patientById.get(v.patient_id as string);
    const schedule = scheduleByPatient.get(v.patient_id as string);
    return {
      study_code: p?.study_code ?? null,
      center_code: centerOfPatient(v.patient_id)?.code ?? null,
      diagnosis: p?.diagnosis ?? null,
      visit_id: v.id,
      visit_type: v.visit_type,
      visit_date: v.visit_date,
      visit_status: v.status,
      modality: v.modality,
      is_scheduled: v.is_scheduled,
      dias_desde_basal: daysBetween(schedule?.baseline_date as string | null, v.visit_date as string),
      datos_clinicos_registrados: clinicalByVisit.has(v.id as string),
      ...strataValues(v.id as string, ''),
      ...instrumentValues(v.id as string, ''),
    };
  });

  // ── WIDE: una fila por paciente (V0 basal y VF final) ──
  const visitsByPatient = new Map<string, Row[]>();
  for (const v of raw.visits) visitsByPatient.set(v.patient_id as string, [...(visitsByPatient.get(v.patient_id as string) ?? []), v]);

  const iexpacItems = instrumentItems('IEXPAC');
  const wideColumns: ColumnSpec[] = [
    c('study_code', 'Código de estudio del paciente', 'string', 'coag_patients.study_code'),
    c('center_code', 'Código del centro', 'string', 'coag_centers.code'),
    c('diagnosis', 'Diagnóstico', 'string', 'coag_patients.diagnosis', { values: DIAGNOSIS_LABEL }),
    c('sex', 'Sexo', 'string', 'coag_patients.sex', { values: SEX_LABEL }),
    c('age_at_inclusion', 'Edad en la inclusión', 'integer', 'coag_patients.age_at_inclusion', { unit: 'años' }),
    c('status', 'Estado en el estudio', 'string', 'coag_patients.status', { values: STATUS_LABEL }),
    c('status_reason', 'Motivo del estado', 'string', 'coag_patients.status_reason', { values: STATUS_REASON_LABEL }),
    c('inclusion_date', 'Fecha de inclusión', 'date', 'coag_patients.inclusion_date'),
    c('consent_date', 'Fecha del consentimiento escrito', 'date', 'coag_inclusions.consent_date'),
    c('consent_version', 'Versión de la HIP/CI', 'string', 'coag_inclusions.consent_version'),
    c('questionnaire_support', 'Apoyo para cumplimentar cuestionarios', 'string', 'coag_inclusions.questionnaire_support', { values: QUESTIONNAIRE_SUPPORT_LABEL }),
    c('final_due_date', 'Fecha esperada de la visita final', 'date', 'coag_patient_schedule.final_due_date'),
    c('final_deviation_days', 'Desviación de la visita final (días)', 'integer', 'coag_patient_schedule.final_deviation_days', { unit: 'días' }),
    c('final_in_window', 'Visita final dentro de la ventana (12 meses ±1)', 'boolean', 'coag_patient_schedule.final_in_window', { values: YES_NO }),
    c('n_seguimientos_realizados', 'Número de visitas de seguimiento realizadas', 'integer', 'derivada', { rule: 'Visitas followup con estado completed.' }),
    c('n_contactos_realizados', 'Número de contactos asistenciales realizados', 'integer', 'derivada', { rule: 'Visitas contact con estado completed.' }),
    c('n_visitas_no_realizadas', 'Número de visitas no realizadas', 'integer', 'derivada', { rule: 'Visitas con estado not_done.' }),
  ];
  for (const slot of VISIT_SLOTS) {
    const s = `_${slot.suffix}`;
    const l = ` (${slot.label})`;
    wideColumns.push(
      c(`estado${s}`, `Estado de la visita${l}`, 'string', 'coag_visits.status', { visit: slot.label, values: visitStatusValues, rule: 'Visita no anulada de este tipo; si solo hay anuladas, «cancelled»; vacío si no existe.' }),
      c(`fecha${s}`, `Fecha de la visita${l}`, 'date', 'coag_visits.visit_date', { visit: slot.label }),
      c(`modalidad${s}`, `Modalidad${l}`, 'string', 'coag_visits.modality', { visit: slot.label, values: MODALITY_LABEL }),
      ...ALL_CLINICAL_FIELDS.map((f) => clinicalColumn(f, `${f.key}${s}`, l, slot.label)),
      BMI_FIELD(`bmi${s}`, l, slot.label),
      ...strataColumns(s, l, slot.label),
      ...instrumentColumns(s, l, slot.label),
      ...iexpacItems.map((item) => c(`iexpac_${item.code}${s}`, `IEXPAC ítem ${item.number ?? item.code}${l}`, 'integer', 'coag_questionnaire_administrations.responses', {
        visit: slot.label, instrument: 'IEXPAC', values: IEXPAC_ITEM_LABELS,
        notes: item.condition ? 'Ítem condicionado: vacío = no aplica o no contestado (ver iexpac_<ítem>_aplica).' : undefined,
      })),
      ...iexpacItems.filter((item) => item.condition).map((item) => c(`iexpac_${item.code}_aplica${s}`, `IEXPAC ítem ${item.number ?? item.code}: se cumple la condición${l}`, 'boolean', 'coag_questionnaire_administrations.item_applicability', { visit: slot.label, instrument: 'IEXPAC', values: YES_NO, notes: 'Vacío = no registrado.' })),
    );
  }
  const changeVars: Array<{ name: string; label: string; from: string; type: ColumnType }> = [
    { name: 'iexpac_global_cambio_vf_v0', label: 'Cambio en IEXPAC global (VF − V0). Variable principal', from: 'iexpac_global', type: 'decimal' },
    { name: 'eq5d_eva_cambio_vf_v0', label: 'Cambio en EQ-5D-3L EVA (VF − V0)', from: 'eq5d_eva', type: 'integer' },
    { name: 'cmo_puntuacion_cambio_vf_v0', label: 'Cambio en la puntuación CMO (VF − V0)', from: 'cmo_puntuacion', type: 'integer' },
  ];
  for (const ch of changeVars) {
    wideColumns.push(c(ch.name, ch.label, ch.type, 'derivada', { rule: `${ch.from}_vf − ${ch.from}_v0; vacío si falta alguno (solo pares completos). Redondeo a 4 decimales.` }));
  }

  const wideRows = [...raw.patients]
    .sort((a, b) => String(a.study_code).localeCompare(String(b.study_code)))
    .map((p) => {
      const visits = visitsByPatient.get(p.id as string) ?? [];
      const inclusion = inclusionByPatient.get(p.id as string);
      const schedule = scheduleByPatient.get(p.id as string);
      const row: Row = {
        study_code: p.study_code,
        center_code: centerById.get(p.center_id as string)?.code ?? null,
        diagnosis: p.diagnosis,
        sex: p.sex,
        age_at_inclusion: p.age_at_inclusion,
        status: p.status,
        status_reason: p.status_reason,
        inclusion_date: p.inclusion_date,
        consent_date: inclusion?.consent_date ?? null,
        consent_version: inclusion?.consent_version ?? null,
        questionnaire_support: inclusion?.questionnaire_support ?? null,
        final_due_date: schedule?.final_due_date ?? null,
        final_deviation_days: schedule?.final_deviation_days ?? null,
        final_in_window: schedule?.final_in_window ?? null,
        n_seguimientos_realizados: visits.filter((v) => v.visit_type === 'followup' && v.status === 'completed').length,
        n_contactos_realizados: visits.filter((v) => v.visit_type === 'contact' && v.status === 'completed').length,
        n_visitas_no_realizadas: visits.filter((v) => v.status === 'not_done').length,
      };
      for (const slot of VISIT_SLOTS) {
        const s = `_${slot.suffix}`;
        const ofType = visits.filter((v) => v.visit_type === slot.type);
        const active = ofType.filter((v) => v.status !== 'cancelled').sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
        const v = active[active.length - 1];
        const visitId = v ? (v.id as string) : null;
        row[`estado${s}`] = v ? v.status : ofType.length > 0 ? 'cancelled' : null;
        row[`fecha${s}`] = v?.visit_date ?? null;
        row[`modalidad${s}`] = v?.modality ?? null;
        const clinical = visitId ? clinicalByVisit.get(visitId) : undefined;
        for (const f of ALL_CLINICAL_FIELDS) row[`${f.key}${s}`] = clinical?.[f.key] ?? null;
        row[`bmi${s}`] = clinical?.bmi ?? null;
        Object.assign(row, strataValues(visitId, s), instrumentValues(visitId, s));
        const iexpac = visitId ? adminByVisit.get(visitId)?.get('IEXPAC') : undefined;
        const responses = (iexpac?.responses ?? {}) as Row;
        const applicability = (iexpac?.item_applicability ?? {}) as Row;
        for (const item of iexpacItems) {
          const value = responses[item.code];
          if (value !== undefined && value !== null && !(typeof value === 'number' && Number.isInteger(value))) {
            issue('valor_no_numerico', 'error', 'coag_questionnaire_administrations', iexpac?.id as string, p.study_code as string, `IEXPAC ${item.code} con valor no entero (${JSON.stringify(value)}): conservado en cuestionarios_items, vacío en WIDE.`);
            row[`iexpac_${item.code}${s}`] = null;
          } else {
            row[`iexpac_${item.code}${s}`] = value ?? null;
          }
          if (item.condition) {
            const applies = applicability[item.code];
            row[`iexpac_${item.code}_aplica${s}`] = typeof applies === 'boolean' ? applies : null;
          }
        }
      }
      for (const ch of changeVars) {
        const a = row[`${ch.from}_v0`];
        const b = row[`${ch.from}_vf`];
        row[ch.name] = typeof a === 'number' && typeof b === 'number' ? Number((b - a).toFixed(4)) : null;
      }
      return row;
    });

  // ── Ítems de cuestionarios (formato largo) ──
  const itemRows: Row[] = [];
  for (const q of [...raw.questionnaires].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const responses = (q.responses ?? {}) as Row;
    const applicability = (q.item_applicability ?? {}) as Row;
    const keys = [...new Set([...Object.keys(responses), ...Object.keys(applicability)])].sort((a, b) => ITEM_COLLATOR.compare(a, b));
    const visit = visitById.get(q.visit_id as string);
    for (const item of keys) {
      const value = responses[item];
      const applies = applicability[item];
      itemRows.push({
        administration_id: q.id,
        study_code: studyCodeOfVisit(q.visit_id),
        visit_id: q.visit_id,
        visit_type: visit?.visit_type ?? null,
        instrument_code: q.instrument_code,
        instrument_version: q.instrument_version,
        status: q.status,
        item,
        valor: typeof value === 'number' && Number.isFinite(value) ? value : null,
        valor_original: value === undefined || value === null ? null : typeof value === 'string' ? value : JSON.stringify(value),
        aplica: typeof applies === 'boolean' ? applies : null,
      });
    }
  }

  // ── Respuestas de la estratificación (formato largo) ──
  const variableById = new Map(STRAT_VARIABLES.map((v) => [v.id, v]));
  const strataRows: Row[] = [];
  for (const s of [...raw.stratifications].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const answers = (s.answers ?? {}) as Row;
    const suggestions = (s.suggestions ?? {}) as Record<string, { value?: unknown; from?: unknown } | undefined>;
    const visit = visitById.get(s.visit_id as string);
    const keys = [...new Set([...Object.keys(answers), ...Object.keys(suggestions)])].sort((a, b) => {
      const ia = STRAT_VARIABLES.findIndex((v) => v.id === a);
      const ib = STRAT_VARIABLES.findIndex((v) => v.id === b);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b);
    });
    for (const question of keys) {
      const variable = variableById.get(question);
      const answer = answers[question];
      const answerText = answer === undefined || answer === null ? null : String(answer);
      const option = variable?.options.find((o) => o.value === answerText);
      const suggestion = suggestions[question];
      const suggested = suggestion?.value === undefined || suggestion?.value === null ? null : String(suggestion.value);
      if (answerText !== null && variable && !option) {
        issue('valor_no_valido', 'error', 'coag_stratifications', s.id as string, studyCodeOfVisit(s.visit_id), `Respuesta «${answerText}» no prevista en la pregunta ${question} del modelo.`);
      }
      strataRows.push({
        stratification_id: s.id,
        study_code: studyCodeOfVisit(s.visit_id),
        visit_id: s.visit_id,
        visit_type: visit?.visit_type ?? null,
        model_version: s.model_version,
        status: s.status,
        pregunta: question,
        variable_modelo: variable?.modelVariable ?? null,
        dimension: variable?.dimension ?? null,
        respuesta: answerText,
        puntos: variable?.exception ? null : (option?.points ?? null),
        sugerencia: suggested,
        sugerencia_origen: suggestion?.from === undefined || suggestion?.from === null ? null : String(suggestion.from),
        coincide_con_sugerencia: suggested !== null && answerText !== null ? suggested === answerText : null,
      });
    }
  }

  const analysisDatasets: Dataset[] = [
    { id: 'long_visitas', folder: 'analisis', title: 'Formato longitudinal (LONG): una fila por visita o contacto', grain: 'Una visita', key: ['visit_id'], columns: longColumns, rows: longRows },
    { id: 'wide_pacientes', folder: 'analisis', title: 'Formato transversal (WIDE): una fila por paciente con V0 y VF', grain: 'Un paciente', key: ['study_code'], columns: wideColumns, rows: wideRows },
    {
      id: 'cuestionarios_items', folder: 'analisis', title: 'Respuestas individuales a cuestionarios (formato largo)', grain: 'Un ítem de un instrumento en una visita', key: ['administration_id', 'item'],
      columns: [
        c('administration_id', 'Identificador del registro de cuestionario (UUID)', 'string', 'coag_questionnaire_administrations.id'),
        c('study_code', 'Código de estudio del paciente', 'string', 'coag_patients.study_code'),
        c('visit_id', 'Identificador de la visita (UUID)', 'string', 'coag_questionnaire_administrations.visit_id'),
        c('visit_type', 'Tipo de visita', 'string', 'coag_visits.visit_type', { values: VISIT_TYPE_LABEL }),
        c('instrument_code', 'Instrumento', 'string', 'coag_questionnaire_administrations.instrument_code'),
        c('instrument_version', 'Versión del instrumento', 'string', 'coag_questionnaire_administrations.instrument_version'),
        c('status', 'Estado de cumplimentación', 'string', 'coag_questionnaire_administrations.status', { values: QSTATUS_VALUES }),
        c('item', 'Ítem (clave original)', 'string', 'coag_questionnaire_administrations.responses (clave)'),
        c('valor', 'Código de respuesta', 'integer', 'coag_questionnaire_administrations.responses (valor)', { notes: 'VERITAS: código de posición (1 Siempre … 5 Nunca), no puntuación. EQ-5D-3L: 1-3 (1 = sin problemas); vas 0-100.' }),
        c('valor_original', 'Respuesta tal como está almacenada (texto JSON)', 'string', 'coag_questionnaire_administrations.responses (valor)'),
        c('aplica', 'Ítem condicionado: se cumple la condición', 'boolean', 'coag_questionnaire_administrations.item_applicability', { values: YES_NO, notes: 'Solo IEXPAC q12-q15; vacío en el resto.' }),
      ],
      rows: itemRows,
    },
    {
      id: 'estratificaciones_respuestas', folder: 'analisis', title: 'Respuestas de la estratificación CMO (formato largo)', grain: 'Una pregunta de una estratificación', key: ['stratification_id', 'pregunta'],
      columns: [
        c('stratification_id', 'Identificador de la estratificación (UUID)', 'string', 'coag_stratifications.id'),
        c('study_code', 'Código de estudio del paciente', 'string', 'coag_patients.study_code'),
        c('visit_id', 'Identificador de la visita (UUID)', 'string', 'coag_stratifications.visit_id'),
        c('visit_type', 'Tipo de visita', 'string', 'coag_visits.visit_type', { values: VISIT_TYPE_LABEL }),
        c('model_version', 'Versión del modelo CMO', 'string', 'coag_stratifications.model_version'),
        c('status', 'Estado de la estratificación', 'string', 'coag_stratifications.status', { values: STRAT_STATUS_VALUES }),
        c('pregunta', 'Pregunta del modelo (código)', 'string', 'coag_stratifications.answers (clave)'),
        c('variable_modelo', 'Variable del modelo SEFH v2.0', 'string', 'derivada', { rule: 'Nombre de la variable en el modelo (src/domain/stratification.ts).' }),
        c('dimension', 'Dimensión', 'string', 'derivada', { values: DIMENSION_LABEL }),
        c('respuesta', 'Respuesta (código de opción)', 'string', 'coag_stratifications.answers (valor)', { notes: 'Vacío = sin responder (no equivale a 0 puntos).' }),
        c('puntos', 'Puntos de la respuesta', 'integer', 'derivada', { rule: `Puntos de la opción en el modelo ${STRATIFICATION_MODEL_VERSION}. Vacío si no hay respuesta o la pregunta activa una excepción (no puntúa). La puntuación oficial es la de la BD (coag_stratifications.score).` }),
        c('sugerencia', 'Propuesta desde los datos clínicos (código)', 'string', 'coag_stratifications.suggestions'),
        c('sugerencia_origen', 'Procedencia de la propuesta', 'string', 'coag_stratifications.suggestions'),
        c('coincide_con_sugerencia', 'La respuesta coincide con la propuesta', 'boolean', 'derivada', { values: YES_NO, rule: 'Vacío si falta la respuesta o la propuesta.' }),
      ],
      rows: strataRows,
    },
  ];

  const issuesDataset: Dataset = {
    id: 'incidencias_integridad', folder: 'analisis', title: 'Incidencias de integridad detectadas en la extracción', grain: 'Una incidencia', key: ['tipo', 'tabla', 'registro_id', 'detalle'],
    columns: [
      c('tipo', 'Tipo de incidencia', 'string', 'derivada'),
      c('gravedad', 'Gravedad', 'string', 'derivada', { values: { error: 'Error de integridad', revisar: 'Valor a revisar (puede ser correcto)' } }),
      c('tabla', 'Tabla', 'string', 'derivada'),
      c('registro_id', 'Registro afectado', 'string', 'derivada'),
      c('study_code', 'Código de estudio del paciente', 'string', 'derivada'),
      c('detalle', 'Detalle', 'string', 'derivada'),
    ],
    rows: issues,
  };

  return { datasets: [...rawDatasets, ...analysisDatasets, issuesDataset], issues };
}
