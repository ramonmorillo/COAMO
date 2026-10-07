// Reglas y vocabulario del estudio COAMO para la interfaz. La base de datos aplica las mismas reglas
// (migración 20261007170100 del historial canónico): aquí solo sirven para guiar y explicar.

import type { Diagnosis } from './clinicalSchema';

export type PatientStatus = 'screening' | 'included' | 'not_included' | 'withdrawn' | 'lost_to_followup' | 'completed';
export type StatusReason = 'not_eligible' | 'declined' | 'consent_withdrawn' | 'investigator_decision' | 'transfer_other_center' | 'other';
export type VisitType = 'baseline' | 'followup' | 'final' | 'contact';
export type VisitStatus = 'scheduled' | 'completed' | 'cancelled' | 'not_done';
export type Modality = 'in_person' | 'phone' | 'video' | 'digital_platform';
export type QuestionnaireSupport = 'none' | 'family_or_caregiver' | 'professional' | 'other';

export const DIAGNOSIS_LABEL: Record<Diagnosis, string> = {
  HA: 'Hemofilia A',
  HB: 'Hemofilia B',
  EVW: 'Enfermedad de von Willebrand',
};

export const SEX_LABEL: Record<'male' | 'female', string> = { male: 'Masculino', female: 'Femenino' };

export const STATUS_LABEL: Record<PatientStatus, string> = {
  screening: 'Cribado',
  included: 'Incluido',
  not_included: 'No incluido',
  withdrawn: 'Retirado',
  lost_to_followup: 'Pérdida de seguimiento',
  completed: 'Seguimiento completado',
};

export const STATUS_TONE: Record<PatientStatus, 'info' | 'positive' | 'warning' | 'danger' | 'neutral'> = {
  screening: 'info',
  included: 'positive',
  not_included: 'neutral',
  withdrawn: 'warning',
  lost_to_followup: 'warning',
  completed: 'positive',
};

// Vocabulario PROVISIONAL: el protocolo no define motivos (blueprint C18). Validar con el IP.
export const STATUS_REASON_LABEL: Record<StatusReason, string> = {
  not_eligible: 'No cumple criterios de elegibilidad',
  declined: 'No acepta participar',
  consent_withdrawn: 'Retirada del consentimiento',
  investigator_decision: 'Decisión del investigador',
  transfer_other_center: 'Traslado a otro centro',
  other: 'Otro motivo',
};

export const REASONS_FOR: Record<'not_included' | 'withdrawn' | 'lost_to_followup', StatusReason[]> = {
  not_included: ['not_eligible', 'declined', 'other'],
  withdrawn: ['consent_withdrawn', 'investigator_decision', 'other'],
  lost_to_followup: ['transfer_other_center', 'other'],
};

export const VISIT_TYPE_LABEL: Record<VisitType, string> = {
  baseline: 'Visita basal',
  followup: 'Visita de seguimiento',
  final: 'Visita final',
  contact: 'Contacto asistencial',
};

export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  scheduled: 'Programada',
  completed: 'Realizada',
  cancelled: 'Anulada',
  not_done: 'No realizada',
};

export const MODALITY_LABEL: Record<Modality, string> = {
  in_person: 'Presencial',
  phone: 'Telefónica',
  video: 'Videollamada',
  digital_platform: 'Plataforma digital',
};

export const QUESTIONNAIRE_SUPPORT_LABEL: Record<QuestionnaireSupport, string> = {
  none: 'Sin apoyo (autocumplimentado)',
  family_or_caregiver: 'Con apoyo de familiar o cuidador',
  professional: 'Con apoyo de un profesional',
  other: 'Otro apoyo',
};

// ── Elegibilidad (protocolo p. 9) ──────────────────────────────────────────

export type InclusionRecord = {
  inc_age_18: boolean | null;
  inc_diagnosis: boolean | null;
  inc_written_consent: boolean | null;
  inc_no_limiting_condition: boolean | null;
  inc_hospital_pharmacy_followup: boolean | null;
  exc_unable_without_support: boolean | null;
  exc_unable_visits: boolean | null;
  exc_interfering_trial: boolean | null;
  questionnaire_support: QuestionnaireSupport | null;
  consent_date: string | null;
  consent_version: string | null;
  verified_in_clinical_record: boolean | null;
};

export const INCLUSION_CRITERIA: Array<{ key: keyof InclusionRecord; label: string }> = [
  { key: 'inc_age_18', label: 'Edad ≥ 18 años' },
  { key: 'inc_diagnosis', label: 'Diagnóstico de hemofilia A, hemofilia B o enfermedad de von Willebrand' },
  { key: 'inc_written_consent', label: 'Otorga su consentimiento informado de participación por escrito' },
  { key: 'inc_no_limiting_condition', label: 'Sin enfermedad o condición que limite los procedimientos del estudio (cuestionarios, visitas presenciales o telemáticas)' },
  { key: 'inc_hospital_pharmacy_followup', label: 'En seguimiento en consulta externa de farmacia hospitalaria con medicamentos de uso hospitalario para esta patología' },
];

export const EXCLUSION_CRITERIA: Array<{ key: keyof InclusionRecord; label: string }> = [
  { key: 'exc_unable_without_support', label: 'Discapacidad o estado que le impide rellenar los cuestionarios por sí mismo y no dispone de apoyo suficiente para hacerlo' },
  { key: 'exc_unable_visits', label: 'No es capaz de completar las visitas del estudio a juicio del investigador' },
  { key: 'exc_interfering_trial', label: 'Participa en un ensayo clínico o estudio intervencionista que puede interferir con las variables del estudio, a juicio del investigador' },
];

export function inclusionGaps(record: InclusionRecord, patient: { age_at_inclusion: number | null; sex: string | null }): string[] {
  const gaps: string[] = [];
  for (const criterion of INCLUSION_CRITERIA) {
    if (record[criterion.key] !== true) gaps.push(`Criterio de inclusión no confirmado: ${criterion.label}.`);
  }
  for (const criterion of EXCLUSION_CRITERIA) {
    if (record[criterion.key] === true) gaps.push(`Criterio de exclusión presente: ${criterion.label}.`);
    else if (record[criterion.key] !== false) gaps.push(`Criterio de exclusión sin evaluar: ${criterion.label}.`);
  }
  if (!record.consent_date) gaps.push('Falta la fecha del consentimiento escrito.');
  if (patient.age_at_inclusion == null) gaps.push('Falta la edad del paciente.');
  else if (patient.age_at_inclusion < 18) gaps.push('El paciente es menor de 18 años.');
  if (!patient.sex) gaps.push('Falta el sexo del paciente.');
  return gaps;
}

// ── Seguimiento según prioridad (modelo CMO, p. 18; protocolo p. 15) ────────

export const FOLLOWUP_BY_PRIORITY: Record<1 | 2 | 3, string> = {
  1: 'Valoración cada mes',
  2: 'Valoración cada 6 meses',
  3: 'Valoración cada 12 meses: sin visita de seguimiento intermedia',
};

// ── Fechas (ISO yyyy-mm-dd, sin zona horaria) ───────────────────────────────

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10));
  const to = Date.UTC(+toIso.slice(0, 4), +toIso.slice(5, 7) - 1, +toIso.slice(8, 10));
  return Math.round((to - from) / 86400000);
}
