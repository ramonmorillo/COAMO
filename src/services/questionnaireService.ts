// Cuestionarios COAMO (solo public.coag_questionnaire_administrations y tablas coag_*). La RLS decide
// el ámbito: investigadores, pacientes de sus centros; coordinación, todos los centros COAMO.
// Nada clínico se guarda en el navegador: los borradores se guardan en la BD (estado «en curso»).

import { supabase } from '../lib/supabase';
import type { DraftState, QuestionnaireAdministration } from '../domain/questionnaires/administration';
import { buildAdministrationPayload } from '../domain/questionnaires/administration';
import type { InstrumentCode } from '../domain/questionnaires/instruments';

type Result<T> = { data: T; error: string | null };

const ADMIN_COLUMNS =
  'id,visit_id,instrument_code,instrument_version,status,status_reason_code,status_reason_detail,administration_mode,data_source,' +
  'administration_date,responses,item_applicability,scores,scoring_version,revision,last_correction_reason,last_corrected_at,' +
  'completed_at,created_at,updated_at';

const PAGE = 1000;

function notConfigured<T>(data: T): Result<T> {
  return { data, error: 'Supabase no está configurado.' };
}

/** Lee todas las filas en páginas deterministas (el servidor limita cada respuesta). */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Result<T[]>> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) return { data: rows, error: error.message };
    const chunk = (data ?? []) as T[];
    rows.push(...chunk);
    if (chunk.length < PAGE) return { data: rows, error: null };
  }
}

export async function listAdministrationsForVisits(visitIds: string[]): Promise<Result<QuestionnaireAdministration[]>> {
  if (!supabase) return notConfigured([]);
  if (visitIds.length === 0) return { data: [], error: null };
  const client = supabase;
  return fetchAll<QuestionnaireAdministration>((from, to) =>
    client.from('coag_questionnaire_administrations').select(ADMIN_COLUMNS).in('visit_id', visitIds).order('id').range(from, to));
}

export async function getAdministration(visitId: string, code: InstrumentCode): Promise<Result<QuestionnaireAdministration | null>> {
  if (!supabase) return notConfigured(null);
  const { data, error } = await supabase
    .from('coag_questionnaire_administrations')
    .select(ADMIN_COLUMNS)
    .eq('visit_id', visitId)
    .eq('instrument_code', code)
    .maybeSingle();
  return { data: (data as QuestionnaireAdministration | null) ?? null, error: error?.message ?? null };
}

export async function createAdministration(visitId: string, code: InstrumentCode, draft: DraftState): Promise<Result<QuestionnaireAdministration | null>> {
  if (!supabase) return notConfigured(null);
  const { data, error } = await supabase
    .from('coag_questionnaire_administrations')
    .insert({ visit_id: visitId, instrument_code: code, ...buildAdministrationPayload(draft) })
    .select(ADMIN_COLUMNS)
    .single();
  if (error?.code === '23505') {
    return { data: null, error: 'Ya existe un registro de este cuestionario en esta visita (otra persona lo ha creado). Recarga la página para verlo antes de continuar.' };
  }
  return { data: (data as QuestionnaireAdministration | null) ?? null, error: error?.message ?? null };
}

/**
 * Actualización con control de concurrencia: solo se aplica si la revisión no ha cambiado desde que
 * se cargó. Nunca sobrescribe en silencio el trabajo de otra persona.
 */
export async function updateAdministration(
  current: Pick<QuestionnaireAdministration, 'id' | 'revision'>,
  draft: DraftState,
  correctionReason: string | null,
): Promise<Result<QuestionnaireAdministration | null>> {
  if (!supabase) return notConfigured(null);
  const changes = { ...buildAdministrationPayload(draft), ...(correctionReason ? { correction_reason: correctionReason } : {}) };
  const { data, error } = await supabase
    .from('coag_questionnaire_administrations')
    .update(changes)
    .eq('id', current.id)
    .eq('revision', current.revision)
    .select(ADMIN_COLUMNS);
  if (error) return { data: null, error: error.message };
  const rows = (data ?? []) as unknown as QuestionnaireAdministration[];
  if (rows.length === 0) {
    return { data: null, error: 'No se guardó: el cuestionario ha cambiado desde que lo abriste (u otra persona lo ha modificado), o no tienes permiso. Recarga la página para ver la versión actual; tus cambios siguen en pantalla.' };
  }
  return { data: rows[0], error: null };
}

export type AuditEntry = {
  at: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  actor_id: string | null;
  old_data: Partial<QuestionnaireAdministration> | null;
  new_data: Partial<QuestionnaireAdministration> | null;
};

/** Historial de cambios (la RLS solo lo devuelve a coordinación COAMO). */
export async function listAuditHistory(administrationId: string): Promise<Result<AuditEntry[]>> {
  if (!supabase) return notConfigured([]);
  const { data, error } = await supabase
    .from('coag_audit_log')
    .select('at,action,actor_id,old_data,new_data')
    .eq('table_name', 'coag_questionnaire_administrations')
    .eq('row_id', administrationId)
    .order('at');
  return { data: (data ?? []) as AuditEntry[], error: error?.message ?? null };
}

export type StudyPatientRow = { id: string; center_id: string; study_code: string; diagnosis: string; status: string };
export type StudyVisitRow = { id: string; patient_id: string; visit_type: string; visit_date: string; status: string };
export type StudyCenterRow = { id: string; code: string; name: string };

/** Todo lo necesario para exportar y para el cuadro de mando, dentro del ámbito autorizado. */
export async function loadStudyQuestionnaireData(): Promise<Result<{
  patients: StudyPatientRow[];
  visits: StudyVisitRow[];
  administrations: QuestionnaireAdministration[];
  centers: StudyCenterRow[];
}>> {
  const empty = { patients: [], visits: [], administrations: [], centers: [] };
  if (!supabase) return notConfigured(empty);
  const client = supabase;
  const [patients, visits, administrations, centers] = await Promise.all([
    fetchAll<StudyPatientRow>((from, to) => client.from('coag_patients').select('id,center_id,study_code,diagnosis,status').order('id').range(from, to)),
    fetchAll<StudyVisitRow>((from, to) =>
      client.from('coag_visits').select('id,patient_id,visit_type,visit_date,status').in('visit_type', ['baseline', 'final']).order('id').range(from, to)),
    fetchAll<QuestionnaireAdministration>((from, to) => client.from('coag_questionnaire_administrations').select(ADMIN_COLUMNS).order('id').range(from, to)),
    fetchAll<StudyCenterRow>((from, to) => client.from('coag_centers').select('id,code,name').order('id').range(from, to)),
  ]);
  const error = patients.error ?? visits.error ?? administrations.error ?? centers.error;
  return {
    data: { patients: patients.data, visits: visits.data, administrations: administrations.data, centers: centers.data },
    error,
  };
}

/** Régimen y tipo de tratamiento registrados en la visita (para la aplicabilidad orientativa de VERITAS). */
export async function getTreatmentContext(visitId: string): Promise<Result<{ treatment_regimen: string | null; treatment_type: string | null } | null>> {
  if (!supabase) return notConfigured(null);
  const { data, error } = await supabase
    .from('coag_clinical_assessments')
    .select('treatment_regimen,treatment_type')
    .eq('visit_id', visitId)
    .maybeSingle();
  return { data: (data as { treatment_regimen: string | null; treatment_type: string | null } | null) ?? null, error: error?.message ?? null };
}
