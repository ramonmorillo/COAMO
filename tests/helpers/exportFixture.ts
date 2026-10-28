// Datos 100 % sintéticos para probar la exportación (sin datos reales de pacientes) y un origen de
// datos en memoria que reproduce el comportamiento de PostgREST, incluido el corte silencioso de filas.
// El origen en memoria es el mismo que en DERMAPEX; los datos siguen el modelo COAMO (tablas coag_*).

import { ALL_CLINICAL_FIELDS } from '../../src/domain/clinicalSchema';
import { addMonths } from '../../src/domain/agenda';
import { instrumentItems, instrumentVersion, type InstrumentCode } from '../../src/domain/questionnaires/instruments';
import { computeScores, type Responses } from '../../src/domain/questionnaires/scoring';
import { STRAT_VARIABLES, STRATIFICATION_MODEL_VERSION, computeStratification, type StratAnswers } from '../../src/domain/stratification';
import type { RawData, TableKey } from '../../src/services/researchExport/datasets';
import { TABLE_REQUESTS } from '../../src/services/researchExport/datasets';
import type { DataSource, TableRequest } from '../../src/services/researchExport/reader';

type Row = Record<string, unknown>;

/** PRNG determinista (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function uuid(prefix: number, n: number): string {
  const hex = n.toString(16).padStart(12, '0');
  return `${prefix.toString(16).padStart(8, '0')}-0000-4000-8000-${hex}`;
}

/** Textos difíciles: separadores, comillas, saltos de línea, tildes, ñ, emoji, espacios, ceros a la izquierda. */
export const TRICKY_TEXTS = [
  'Factor VIII "recombinante", vida media extendida; 2 viales',
  'Línea 1\nLínea 2\r\nLínea 3',
  'Ñandú, acción, pingüino — «comillas latinas» y emoji 🩸',
  '  espacios al inicio y al final  ',
  '007',
  '=SUMA(A1:A2)',
  "Comilla simple ' y barra \\ invertida",
  'a;b;c,d,e',
];

const INSTRUMENTS_USED: InstrumentCode[] = ['IEXPAC', 'EQ5D3L', 'EVASAF', 'VERITAS_PRN'];

export function syntheticData(options: { patients: number; seed?: number; followupsPerPatient?: number }): RawData {
  const r = rng(options.seed ?? 42);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(r() * list.length)];
  const int = (min: number, max: number) => min + Math.floor(r() * (max - min + 1));
  const maybe = <T,>(value: T, pNull = 0.15): T | null => (r() < pNull ? null : value);

  const centers: Row[] = [
    { id: uuid(1, 1), code: 'LAFE', name: 'Centro sintético 1', city: 'Valencia', center_role: 'recruiting', study_number: 1, is_active: true },
    { id: uuid(1, 2), code: 'VALME', name: 'Centro sintético consultor', city: 'Sevilla', center_role: 'consulting', study_number: null, is_active: true },
  ];
  const patients: Row[] = [];
  const inclusions: Row[] = [];
  const visits: Row[] = [];
  const clinical: Row[] = [];
  const questionnaires: Row[] = [];
  const stratifications: Row[] = [];
  const schedule: Row[] = [];

  let vSeq = 0;
  let qSeq = 0;
  let sSeq = 0;
  const stamp = '2026-10-01T10:00:00.000000+00:00';

  const addQuestionnaires = (visitId: string, date: string) => {
    for (const code of INSTRUMENTS_USED) {
      if (r() < 0.1) {
        questionnaires.push({
          id: uuid(4, ++qSeq), visit_id: visitId, instrument_code: code, instrument_version: null, status: 'not_done', status_reason_code: 'patient_declined',
          administration_mode: null, data_source: null, administration_date: null, responses: {}, item_applicability: {}, scores: {}, scoring_version: 'coamo-q-1',
          revision: 1, last_corrected_at: null, completed_at: null, created_at: stamp, updated_at: stamp,
        });
        continue;
      }
      const responses: Responses = {};
      const applicability: Record<string, boolean> = {};
      for (const item of instrumentItems(code)) {
        if (item.condition) {
          applicability[item.code] = r() < 0.4;
          if (applicability[item.code]) responses[item.code] = int(1, 5);
          continue;
        }
        if (r() < 0.05) continue; // ítem sin responder
        if (item.kind === 'vas') responses[item.code] = int(0, 100);
        else if (code === 'EQ5D3L') responses[item.code] = int(1, 3);
        else responses[item.code] = int(1, 5);
      }
      const mode = pick(['self', 'assisted', 'interviewer'] as const);
      questionnaires.push({
        id: uuid(4, ++qSeq), visit_id: visitId, instrument_code: code, instrument_version: instrumentVersion(code, mode), status: 'completed', status_reason_code: null,
        administration_mode: mode, data_source: pick(['electronic', 'paper']), administration_date: date, responses,
        item_applicability: code === 'IEXPAC' ? applicability : {}, scores: computeScores(code, responses, applicability), scoring_version: 'coamo-q-1',
        revision: r() < 0.1 ? 2 : 1, last_corrected_at: null, completed_at: stamp, created_at: stamp, updated_at: stamp,
      });
    }
  };

  const addStratification = (visitId: string, diagnosis: 'HA' | 'HB' | 'EVW', complete: boolean) => {
    const answers: StratAnswers = {};
    const suggestions: Record<string, { value: string; from: string }> = {};
    for (const variable of STRAT_VARIABLES) {
      if (variable.appliesTo && !variable.appliesTo.includes(diagnosis)) continue;
      if (!complete && r() < 0.3) continue;
      answers[variable.id] = pick(variable.options).value;
      if (r() < 0.3) suggestions[variable.id] = { value: pick(variable.options).value, from: 'Datos clínicos de la visita basal' };
    }
    const result = computeStratification(diagnosis, answers);
    const raised = complete && result.modelPriority === 3 && r() < 0.2 ? 2 : null;
    stratifications.push({
      id: uuid(5, ++sSeq), visit_id: visitId, model_version: STRATIFICATION_MODEL_VERSION, status: complete ? 'completed' : 'in_progress', answers, suggestions,
      clinical_source_visit_id: visitId, raised_priority: raised, result: { status: result.status, model_priority: result.modelPriority, basis: result.basis, score: result.score, score_min: result.scoreMin, score_max: result.scoreMax, by_dimension: result.byDimension, missing: result.missing.map((v) => v.id) },
      score: result.score, score_min: result.scoreMin, score_max: result.scoreMax, model_priority: result.modelPriority, final_priority: raised ?? result.modelPriority,
      revision: 1, last_corrected_at: null, completed_at: complete ? stamp : null, created_at: stamp, updated_at: stamp,
    });
  };

  const clinicalRow = (visitId: string, diagnosis: string): Row => {
    const row: Row = { visit_id: visitId };
    for (const field of ALL_CLINICAL_FIELDS) {
      if (field.appliesTo && !field.appliesTo.includes(diagnosis as 'HA')) {
        row[field.key] = null;
        continue;
      }
      switch (field.kind) {
        case 'boolean': row[field.key] = maybe(r() < 0.4); break;
        case 'enum': row[field.key] = maybe(pick(field.options).value); break;
        case 'integer': row[field.key] = maybe(int(0, 30)); break;
        case 'decimal': row[field.key] = maybe(Math.round(r() * 1000) / 100); break;
        case 'text': row[field.key] = maybe(pick(TRICKY_TEXTS), 0.3); break;
      }
    }
    row.weight_kg = maybe(Math.round((55 + r() * 50) * 10) / 10);
    row.height_m = maybe(Math.round((1.55 + r() * 0.4) * 100) / 100);
    if (row.target_joint_present !== true) row.target_joint_detail = null;
    row.bmi = typeof row.weight_kg === 'number' && typeof row.height_m === 'number' ? Math.round((row.weight_kg / (row.height_m * row.height_m)) * 10) / 10 : null;
    row.updated_at = stamp;
    return row;
  };

  for (let i = 1; i <= options.patients; i += 1) {
    const id = uuid(2, i);
    const diagnosis = pick(['HA', 'HB', 'EVW'] as const);
    const included = r() > 0.08;
    const inclusionDate = included ? `2026-0${int(1, 9)}-${String(int(10, 28))}` : null;
    const status = !included ? pick(['screening', 'not_included'] as const) : pick(['included', 'included', 'included', 'withdrawn', 'completed'] as const);
    const code = `COAMO-1-${String(i).padStart(4, '0')}`;
    patients.push({
      id, study_code: code, center_id: centers[0].id, center_seq: i, age_at_inclusion: int(18, 80), sex: pick(['male', 'female']), diagnosis,
      status, status_reason: status === 'withdrawn' ? 'consent_withdrawn' : status === 'not_included' ? 'not_eligible' : null,
      inclusion_date: inclusionDate, status_changed_at: stamp, created_at: stamp, updated_at: stamp,
    });
    inclusions.push({
      patient_id: id, inc_age_18: true, inc_diagnosis: true, inc_written_consent: included, inc_no_limiting_condition: maybe(true), inc_hospital_pharmacy_followup: true,
      exc_unable_without_support: false, exc_unable_visits: false, exc_interfering_trial: maybe(false), questionnaire_support: maybe(pick(['none', 'family_or_caregiver', 'professional', 'other'])),
      consent_date: inclusionDate, consent_version: included ? pick(['v2 (25/09/2026)', TRICKY_TEXTS[4]]) : null, verified_in_clinical_record: maybe(true), updated_at: stamp,
    });

    if (!included || !inclusionDate) {
      schedule.push({ patient_id: id, baseline_date: null, final_due_date: null, final_window_start: null, final_window_end: null, final_date: null, final_status: null, final_deviation_days: null, final_in_window: null });
      continue;
    }

    const baselineDate = inclusionDate;
    const baselineId = uuid(3, ++vSeq);
    visits.push({ id: baselineId, patient_id: id, visit_type: 'baseline', visit_date: baselineDate, status: 'completed', modality: 'in_person', is_scheduled: true, created_at: stamp, updated_at: stamp });
    clinical.push(clinicalRow(baselineId, diagnosis));
    addQuestionnaires(baselineId, baselineDate);
    addStratification(baselineId, diagnosis, r() > 0.1);

    // Final programada y anulada sin otra activa (el hueco VF debe figurar como anulado, sin datos).
    const cancelledFinalOnly = i % 17 === 0;
    if (cancelledFinalOnly) {
      visits.push({ id: uuid(3, ++vSeq), patient_id: id, visit_type: 'final', visit_date: addMonths(baselineDate, 12), status: 'cancelled', modality: 'phone', is_scheduled: true, created_at: stamp, updated_at: stamp });
    }

    const followups = options.followupsPerPatient ?? 2;
    for (let f = 1; f <= followups; f += 1) {
      const date = addMonths(baselineDate, f * 2);
      const st = date < '2026-10-28' ? pick(['completed', 'completed', 'not_done', 'scheduled'] as const) : 'scheduled';
      visits.push({ id: uuid(3, ++vSeq), patient_id: id, visit_type: 'followup', visit_date: date, status: st, modality: pick(['in_person', 'phone', 'video', 'digital_platform']), is_scheduled: r() > 0.2, created_at: stamp, updated_at: stamp });
      if (r() < 0.3) visits.push({ id: uuid(3, ++vSeq), patient_id: id, visit_type: 'contact', visit_date: addMonths(date, 0), status: 'completed', modality: 'phone', is_scheduled: false, created_at: stamp, updated_at: stamp });
    }

    const window = { due: addMonths(baselineDate, 12), start: addMonths(baselineDate, 11), end: addMonths(baselineDate, 13) };
    let finalDate: string | null = null;
    let finalStatus: string | null = null;
    if (!cancelledFinalOnly && r() < 0.6) {
      finalDate = addMonths(baselineDate, pick([11, 12, 12, 14]));
      finalStatus = 'completed';
      const finalId = uuid(3, ++vSeq);
      visits.push({ id: finalId, patient_id: id, visit_type: 'final', visit_date: finalDate, status: finalStatus, modality: 'in_person', is_scheduled: true, created_at: '2026-10-02T10:00:00.000000+00:00', updated_at: stamp });
      clinical.push(clinicalRow(finalId, diagnosis));
      addQuestionnaires(finalId, finalDate);
      addStratification(finalId, diagnosis, true);
    }
    const deviation = finalDate ? Math.round((Date.parse(finalDate) - Date.parse(window.due)) / 86400000) : null;
    schedule.push({
      patient_id: id, baseline_date: baselineDate, final_due_date: window.due, final_window_start: window.start, final_window_end: window.end,
      final_date: finalDate, final_status: finalStatus, final_deviation_days: deviation, final_in_window: finalDate ? finalDate >= window.start && finalDate <= window.end : null,
    });
  }

  return { centers, patients, inclusions, visits, clinical, questionnaires, stratifications, schedule };
}

export type MemorySourceOptions = {
  /** Límite de filas por petición del «servidor» (PostgREST max-rows). */
  serverMaxRows?: number;
  /** Simula un fallo: devuelve como máximo N filas en total para esta tabla (corte silencioso). */
  truncateTable?: { table: string; maxTotal: number };
  /** Simula una inserción concurrente en esta tabla durante la lectura. */
  mutateTable?: string;
  /** Simula un orden inestable entre páginas (paginación incorrecta). */
  unstableOrderTable?: string;
};

const TABLE_TO_KEY = Object.fromEntries(Object.entries(TABLE_REQUESTS).map(([k, v]) => [v.table, k])) as Record<string, TableKey>;

export function memorySource(data: RawData, options: MemorySourceOptions = {}): DataSource {
  const tables: Record<string, Row[]> = {};
  for (const [table, key] of Object.entries(TABLE_TO_KEY)) tables[table] = [...data[key]];
  let mutated = false;
  return {
    async count(table) {
      return tables[table].length;
    },
    async page(request: TableRequest, from: number, to: number) {
      const columns = request.columns.split(',');
      let rows = [...tables[request.table]].sort((a, b) => String(a[request.orderBy]).localeCompare(String(b[request.orderBy])));
      if (options.unstableOrderTable === request.table && from > 0) rows = rows.reverse();
      if (options.truncateTable?.table === request.table) rows = rows.slice(0, options.truncateTable.maxTotal);
      const limit = Math.min(to - from + 1, options.serverMaxRows ?? Number.MAX_SAFE_INTEGER);
      const pageRows = rows.slice(from, from + limit).map((row) => Object.fromEntries(columns.map((col) => [col, row[col] ?? null])));
      if (options.mutateTable === request.table && !mutated) {
        mutated = true;
        tables[request.table].push({ ...tables[request.table][0], id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' });
      }
      return pageRows;
    },
  };
}
