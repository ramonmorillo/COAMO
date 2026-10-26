// Estado de cumplimentación, motivos, aplicabilidad orientativa y validación previa al guardado.
// La BD aplica las mismas reglas (trigger enforce_questionnaire_administration); aquí guían y explican.

import type { Diagnosis } from '../clinicalSchema';
import { INSTRUMENTS, itemRange, type AdministrationMode, type InstrumentCode } from './instruments';
import type { Applicability, InstrumentScores, Responses } from './scoring';

export type AdministrationStatus = 'pending' | 'in_progress' | 'completed' | 'not_applicable' | 'not_done';
export type ReasonCode =
  | 'regimen_mismatch' | 'diagnosis_mismatch' | 'source_document_unavailable' | 'not_in_protocol'
  | 'patient_declined' | 'patient_unable' | 'not_administered' | 'other';
export type DataSource = 'electronic' | 'paper';
export type StudyVisit = 'V0' | 'VF';

export type QuestionnaireAdministration = {
  id: string;
  visit_id: string;
  instrument_code: InstrumentCode;
  instrument_version: string | null;
  status: AdministrationStatus;
  status_reason_code: ReasonCode | null;
  status_reason_detail: string | null;
  administration_mode: AdministrationMode | null;
  data_source: DataSource | null;
  administration_date: string | null;
  responses: Responses;
  item_applicability: Applicability;
  scores: InstrumentScores;
  scoring_version: string | null;
  revision: number;
  last_correction_reason: string | null;
  last_corrected_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export const STATUS_LABEL: Record<AdministrationStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  completed: 'Completado',
  not_applicable: 'No aplicable',
  not_done: 'No realizado',
};

export const STATUS_TONE: Record<AdministrationStatus, 'neutral' | 'info' | 'positive' | 'warning' | 'danger'> = {
  pending: 'neutral',
  in_progress: 'info',
  completed: 'positive',
  not_applicable: 'neutral',
  not_done: 'warning',
};

// Vocabulario PROVISIONAL (propuesta técnica, no definido en el protocolo): validar con el IP.
export const REASON_LABEL: Record<ReasonCode, string> = {
  regimen_mismatch: 'No corresponde al régimen de tratamiento del paciente',
  diagnosis_mismatch: 'No corresponde al diagnóstico del paciente',
  source_document_unavailable: 'Instrumento sin documento fuente aprobado',
  not_in_protocol: 'No previsto en el protocolo para este paciente o visita',
  patient_declined: 'El paciente no desea responder',
  patient_unable: 'El paciente no puede responder, ni con ayuda',
  not_administered: 'No se administró en la visita',
  other: 'Otro motivo (describir)',
};

export const REASONS_FOR_STATUS: Record<'not_applicable' | 'not_done', ReasonCode[]> = {
  not_applicable: ['regimen_mismatch', 'diagnosis_mismatch', 'source_document_unavailable', 'not_in_protocol', 'other'],
  not_done: ['patient_declined', 'patient_unable', 'not_administered', 'other'],
};

export const DATA_SOURCE_LABEL: Record<DataSource, string> = {
  electronic: 'Cumplimentación directa en la aplicación',
  paper: 'Transcrito desde el formulario en papel',
};

export const VISIT_LABEL: Record<StudyVisit, string> = { V0: 'V0 · Visita basal', VF: 'VF · Visita final' };

export function studyVisitOf(visitType: string): StudyVisit | null {
  return visitType === 'baseline' ? 'V0' : visitType === 'final' ? 'VF' : null;
}

/** Estado efectivo de un instrumento en una visita: sin registro = pendiente. */
export function effectiveStatus(admin: Pick<QuestionnaireAdministration, 'status'> | null | undefined): AdministrationStatus {
  return admin?.status ?? 'pending';
}

/** Resuelto = completado o no aplicable con motivo. «No realizado» queda como dato ausente justificado. */
export function isResolved(status: AdministrationStatus): boolean {
  return status === 'completed' || status === 'not_applicable';
}

// ── Aplicabilidad orientativa (NUNCA se impone: decide el profesional) ──────

export type ApplicabilityHint = { tone: 'info' | 'warning'; text: string };

export function applicabilityHints(
  code: InstrumentCode,
  context: { diagnosis: Diagnosis; treatmentRegimen: string | null; treatmentType: string | null },
): ApplicabilityHint[] {
  const hints: ApplicabilityHint[] = [];
  if (code === 'VERITAS_PRO') {
    hints.push({ tone: 'warning', text: INSTRUMENTS.VERITAS_PRO.unavailableReason! });
  }
  if (code === 'VERITAS_PRN' || code === 'VERITAS_PRO') {
    const target = code === 'VERITAS_PRN' ? 'on_demand' : 'prophylaxis';
    const targetLabel = code === 'VERITAS_PRN' ? 'a demanda' : 'en profilaxis';
    if (context.treatmentRegimen == null) {
      hints.push({ tone: 'info', text: `Régimen de tratamiento no registrado en los datos clínicos de esta visita. Este instrumento está orientado a pacientes ${targetLabel}.` });
    } else if (context.treatmentRegimen !== target) {
      hints.push({ tone: 'warning', text: `Según los datos clínicos de esta visita, el régimen no es ${targetLabel}: valore marcarlo como «No aplicable».` });
    } else {
      hints.push({ tone: 'info', text: `Régimen ${targetLabel} registrado en esta visita.` });
    }
    if (context.diagnosis === 'EVW') {
      hints.push({ tone: 'warning', text: 'El texto se refiere a hemofilia y factor de coagulación: aplicabilidad en enfermedad de von Willebrand pendiente de decisión del IP.' });
    }
    if (context.treatmentType && ['non_replacement', 'rebalancing', 'gene_therapy'].includes(context.treatmentType)) {
      hints.push({ tone: 'warning', text: 'Los ítems se refieren a infusiones de factor: aplicabilidad con terapia no sustitutiva, rebalanceadora o génica pendiente de decisión del IP.' });
    }
  }
  return hints;
}

// ── Validación previa al guardado (mensajes para el profesional) ─────────────

export type DraftState = {
  status: AdministrationStatus;
  reasonCode: ReasonCode | null;
  reasonDetail: string;
  mode: AdministrationMode | null;
  dataSource: DataSource | null;
  date: string;
  responses: Responses;
  applicability: Applicability;
};

export function validateDraft(code: InstrumentCode, draft: DraftState, today: string): string[] {
  const errors: string[] = [];
  const def = INSTRUMENTS[code];
  if (!def.available && Object.keys(draft.responses).length > 0) errors.push(`${def.shortName}: no admite respuestas (sin documento fuente).`);
  if (draft.mode && !def.modes.includes(draft.mode)) errors.push(`${def.shortName}: modalidad no prevista en los documentos.`);
  if (code === 'EQ5D3L' && (draft.status === 'in_progress' || draft.status === 'completed') && !draft.mode) {
    errors.push('EQ-5D-3L: elija la modalidad (el texto difiere entre la versión autoadministrada y la de entrevista).');
  }
  if (draft.date && draft.date > today) errors.push('La fecha de administración no puede ser futura.');
  for (const [item, value] of Object.entries(draft.responses)) {
    const range = itemRange(code, item);
    if (!range || !Number.isInteger(value) || value < range.min || value > range.max) errors.push(`Respuesta no válida en ${item}.`);
    if (code === 'IEXPAC' && ['q12', 'q13', 'q14', 'q15'].includes(item) && draft.applicability[item] !== true) {
      errors.push(`El ítem ${item.slice(1)} solo se responde si se cumple su condición.`);
    }
  }
  if (draft.status === 'not_applicable' || draft.status === 'not_done') {
    if (!draft.reasonCode) errors.push('Indique el motivo.');
    if (draft.reasonCode === 'other' && draft.reasonDetail.trim().length < 3) errors.push('Describa el motivo «otro».');
    if (Object.keys(draft.responses).length > 0 || Object.keys(draft.applicability).length > 0) {
      errors.push('Hay respuestas registradas: bórrelas antes de marcarlo como no aplicable o no realizado.');
    }
  }
  if (draft.status === 'completed') {
    if (!draft.date) errors.push('Indique la fecha de administración.');
    if (!draft.mode) errors.push('Indique la modalidad de administración.');
    if (Object.keys(draft.responses).length === 0) errors.push('No hay ninguna respuesta registrada.');
  }
  return errors;
}

/** Carga útil para la API (solo columnas con privilegio de escritura). */
export function buildAdministrationPayload(draft: DraftState) {
  const resolvedWithoutAnswers = draft.status === 'not_applicable' || draft.status === 'not_done';
  return {
    status: draft.status,
    status_reason_code: resolvedWithoutAnswers ? draft.reasonCode : null,
    status_reason_detail: resolvedWithoutAnswers && draft.reasonDetail.trim() ? draft.reasonDetail.trim().slice(0, 200) : null,
    administration_mode: draft.mode,
    data_source: draft.dataSource,
    administration_date: draft.date || null,
    responses: draft.responses,
    item_applicability: draft.applicability,
  };
}
