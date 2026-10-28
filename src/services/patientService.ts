// Acceso a pacientes, inclusión, visitas y datos clínicos COAMO (solo tablas coag_*).
// La RLS y los triggers de la base de datos son la autoridad: los errores que devuelven se muestran tal
// cual porque están redactados para el profesional.

import { supabase } from '../lib/supabase';
import type { ClinicalValues, Diagnosis } from '../domain/clinicalSchema';
import type { AgendaVisit } from '../domain/agenda';
import type { Priority } from '../domain/stratification';
import type { InclusionRecord, Modality, PatientStatus, StatusReason, VisitStatus, VisitType } from '../domain/study';

export type Patient = {
  id: string;
  center_id: string;
  study_code: string;
  center_seq: number;
  age_at_inclusion: number | null;
  sex: 'male' | 'female' | null;
  diagnosis: Diagnosis;
  status: PatientStatus;
  status_reason: StatusReason | null;
  inclusion_date: string | null;
  created_at: string;
};

export type Visit = {
  id: string;
  patient_id: string;
  visit_type: VisitType;
  visit_date: string;
  status: VisitStatus;
  modality: Modality;
  is_scheduled: boolean;
};

export type Schedule = {
  patient_id: string;
  baseline_date: string | null;
  final_due_date: string | null;
  final_window_start: string | null;
  final_window_end: string | null;
  final_date: string | null;
  final_status: VisitStatus | null;
  final_deviation_days: number | null;
  final_in_window: boolean | null;
};

type Result<T> = { data: T; error: string | null };

const PATIENT_COLUMNS = 'id,center_id,study_code,center_seq,age_at_inclusion,sex,diagnosis,status,status_reason,inclusion_date,created_at';

function notConfigured<T>(data: T): Result<T> {
  return { data, error: 'Supabase no está configurado.' };
}

// Índices únicos parciales de coag_visits (migración 20261007170100): una basal y una final no anuladas.
const UNIQUE_VISIT_MESSAGES: Record<string, string> = {
  uq_coag_visits_one_baseline: 'El paciente ya tiene una visita basal no anulada. Reprográmala desde la ficha o anúlala antes de crear otra.',
  uq_coag_visits_one_final: 'El paciente ya tiene una visita final no anulada. Reprográmala desde la ficha o anúlala antes de crear otra.',
};

export function visitErrorMessage(message: string | null | undefined): string | null {
  if (!message) return null;
  const index = Object.keys(UNIQUE_VISIT_MESSAGES).find((name) => message.includes(name));
  return index ? UNIQUE_VISIT_MESSAGES[index] : message;
}

const PAGE = 1000;

/** Lee todas las filas en páginas con orden estable (el servidor limita cada respuesta a 1000). */
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

export async function listPatients(): Promise<Result<Patient[]>> {
  if (!supabase) return notConfigured([]);
  const { data, error } = await supabase.from('coag_patients').select(PATIENT_COLUMNS).order('study_code');
  return { data: (data ?? []) as Patient[], error: error?.message ?? null };
}

export async function getPatient(id: string): Promise<Result<Patient | null>> {
  if (!supabase) return notConfigured(null);
  const { data, error } = await supabase.from('coag_patients').select(PATIENT_COLUMNS).eq('id', id).maybeSingle();
  return { data: (data as Patient | null) ?? null, error: error?.message ?? null };
}

export async function createPatient(input: { center_id: string; age_at_inclusion: number; sex: 'male' | 'female'; diagnosis: Diagnosis }): Promise<Result<Patient | null>> {
  if (!supabase) return notConfigured(null);
  const { data, error } = await supabase.from('coag_patients').insert(input).select(PATIENT_COLUMNS).single();
  return { data: (data as Patient | null) ?? null, error: error?.message ?? null };
}

export async function updatePatientStatus(id: string, status: PatientStatus, reason: StatusReason | null = null): Promise<Result<null>> {
  if (!supabase) return notConfigured(null);
  const { error } = await supabase.from('coag_patients').update({ status, status_reason: reason }).eq('id', id);
  return { data: null, error: error?.message ?? null };
}

export async function getInclusion(patientId: string): Promise<Result<InclusionRecord | null>> {
  if (!supabase) return notConfigured(null);
  const { data, error } = await supabase
    .from('coag_inclusions')
    .select('inc_age_18,inc_diagnosis,inc_written_consent,inc_no_limiting_condition,inc_hospital_pharmacy_followup,exc_unable_without_support,exc_unable_visits,exc_interfering_trial,questionnaire_support,consent_date,consent_version,verified_in_clinical_record')
    .eq('patient_id', patientId)
    .maybeSingle();
  return { data: (data as InclusionRecord | null) ?? null, error: error?.message ?? null };
}

export async function saveInclusion(patientId: string, record: InclusionRecord): Promise<Result<null>> {
  if (!supabase) return notConfigured(null);
  const { error, count } = await supabase
    .from('coag_inclusions')
    .update(record, { count: 'exact' })
    .eq('patient_id', patientId);
  if (!error && count === 0) return { data: null, error: 'No se guardó la evaluación: no tiene permiso sobre este paciente.' };
  return { data: null, error: error?.message ?? null };
}

export async function listVisits(patientId: string): Promise<Result<Visit[]>> {
  if (!supabase) return notConfigured([]);
  const { data, error } = await supabase
    .from('coag_visits')
    .select('id,patient_id,visit_type,visit_date,status,modality,is_scheduled')
    .eq('patient_id', patientId)
    .order('visit_date')
    .order('created_at');
  return { data: (data ?? []) as Visit[], error: error?.message ?? null };
}

export async function getVisit(visitId: string): Promise<Result<Visit | null>> {
  if (!supabase) return notConfigured(null);
  const { data, error } = await supabase
    .from('coag_visits')
    .select('id,patient_id,visit_type,visit_date,status,modality,is_scheduled')
    .eq('id', visitId)
    .maybeSingle();
  return { data: (data as Visit | null) ?? null, error: error?.message ?? null };
}

export async function createVisit(input: Omit<Visit, 'id'>): Promise<Result<null>> {
  if (!supabase) return notConfigured(null);
  const { error } = await supabase.from('coag_visits').insert(input);
  return { data: null, error: visitErrorMessage(error?.message) };
}

export async function updateVisit(visitId: string, changes: Partial<Pick<Visit, 'visit_date' | 'status' | 'modality' | 'is_scheduled'>>): Promise<Result<null>> {
  if (!supabase) return notConfigured(null);
  const { error } = await supabase.from('coag_visits').update(changes).eq('id', visitId);
  return { data: null, error: visitErrorMessage(error?.message) };
}

export async function getSchedule(patientId: string): Promise<Result<Schedule | null>> {
  if (!supabase) return notConfigured(null);
  const { data, error } = await supabase.from('coag_patient_schedule').select('*').eq('patient_id', patientId).maybeSingle();
  return { data: (data as Schedule | null) ?? null, error: error?.message ?? null };
}

export async function getClinicalAssessment(visitId: string): Promise<Result<ClinicalValues | null>> {
  if (!supabase) return notConfigured(null);
  const { data, error } = await supabase.from('coag_clinical_assessments').select('*').eq('visit_id', visitId).maybeSingle();
  return { data: (data as ClinicalValues | null) ?? null, error: error?.message ?? null };
}

/**
 * Alta o actualización explícitas (no upsert): el upsert reescribiría visit_id, que la base de datos
 * protege con privilegios por columna.
 */
export async function saveClinicalAssessment(visitId: string, payload: ClinicalValues, exists: boolean): Promise<Result<null>> {
  if (!supabase) return notConfigured(null);
  const { error } = exists
    ? await supabase.from('coag_clinical_assessments').update(payload).eq('visit_id', visitId)
    : await supabase.from('coag_clinical_assessments').insert({ visit_id: visitId, ...payload });
  return { data: null, error: error?.message ?? null };
}

type AgendaVisitRow = Omit<AgendaVisit, 'study_code'> & {
  coag_patients: { study_code: string | null } | Array<{ study_code: string | null }> | null;
};

/**
 * Todas las visitas visibles (la RLS limita a los centros del usuario; coordinación ve todos) con el
 * código del paciente. El filtrado por mes, paciente y estado se hace en el cliente (domain/agenda).
 */
export async function listAgendaVisits(): Promise<Result<AgendaVisit[]>> {
  if (!supabase) return notConfigured([]);
  const client = supabase;
  const result = await fetchAll<AgendaVisitRow>((from, to) =>
    client.from('coag_visits').select('id,patient_id,visit_type,visit_date,status,modality,coag_patients!inner(study_code)').order('id').range(from, to));
  const rows = result.data.map(({ coag_patients, ...visit }) => {
    const patient = Array.isArray(coag_patients) ? coag_patients[0] : coag_patients;
    return { ...visit, study_code: patient?.study_code ?? null };
  });
  return { data: rows, error: result.error };
}

/**
 * Prioridad CMO vigente por paciente: la de la estratificación completada en la visita realizada más
 * reciente (orientativa para la periodicidad del seguimiento).
 */
export async function listLatestPriorities(visits: Array<Pick<AgendaVisit, 'id' | 'patient_id' | 'visit_date'>>): Promise<Result<Record<string, Priority>>> {
  if (!supabase) return notConfigured({});
  const client = supabase;
  const result = await fetchAll<{ visit_id: string; final_priority: Priority | null }>((from, to) =>
    client.from('coag_stratifications').select('visit_id,final_priority').eq('status', 'completed').order('id').range(from, to));
  const visitById = new Map(visits.map((v) => [v.id, v]));
  const latest: Record<string, { date: string; priority: Priority }> = {};
  for (const row of result.data) {
    const visit = visitById.get(row.visit_id);
    if (!visit || !row.final_priority) continue;
    const current = latest[visit.patient_id];
    if (!current || visit.visit_date >= current.date) latest[visit.patient_id] = { date: visit.visit_date, priority: row.final_priority };
  }
  return { data: Object.fromEntries(Object.entries(latest).map(([id, v]) => [id, v.priority])), error: result.error };
}
