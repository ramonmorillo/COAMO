// Estratificación CMO (solo public.coag_stratifications). La BD calcula puntuación y prioridades
// (coag_private.stratification_result, migración 20261027120000 del historial canónico); el cliente
// escribe respuestas, propuestas con su procedencia, la elevación y los motivos. Nada en el navegador.

import { supabase } from '../lib/supabase';
import type { Priority, StratAnswers, Suggestion } from '../domain/stratification';

type Result<T> = { data: T; error: string | null };

export type StratificationRecord = {
  id: string;
  visit_id: string;
  model_version: string | null;
  status: 'in_progress' | 'completed';
  answers: StratAnswers;
  suggestions: Record<string, Suggestion>;
  clinical_source_visit_id: string | null;
  raised_priority: Priority | null;
  raised_reason: string | null;
  restratification_reason: string | null;
  score: number | null;
  score_min: number | null;
  score_max: number | null;
  model_priority: Priority | null;
  final_priority: Priority | null;
  revision: number;
  last_correction_reason: string | null;
  last_corrected_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

export type StratificationDraft = Pick<StratificationRecord,
  'status' | 'answers' | 'suggestions' | 'clinical_source_visit_id' | 'raised_priority' | 'raised_reason' | 'restratification_reason'>;

const COLUMNS =
  'id,visit_id,model_version,status,answers,suggestions,clinical_source_visit_id,raised_priority,raised_reason,restratification_reason,' +
  'score,score_min,score_max,model_priority,final_priority,revision,last_correction_reason,last_corrected_at,completed_at,updated_at';

function notConfigured<T>(data: T): Result<T> {
  return { data, error: 'Supabase no está configurado.' };
}

/** Carga útil: sin respuestas vacías; motivos solo cuando proceden (la BD vuelve a validarlo). */
export function buildStratificationPayload(draft: StratificationDraft, isBaseline: boolean): StratificationDraft {
  const answers = Object.fromEntries(Object.entries(draft.answers).filter(([, v]) => v != null && v !== ''));
  const raisedReason = draft.raised_priority ? draft.raised_reason?.trim() || null : null;
  return {
    status: draft.status,
    answers,
    suggestions: draft.suggestions,
    clinical_source_visit_id: draft.clinical_source_visit_id,
    raised_priority: draft.raised_priority,
    raised_reason: raisedReason,
    restratification_reason: isBaseline ? null : draft.restratification_reason?.trim() || null,
  };
}

export async function getStratification(visitId: string): Promise<Result<StratificationRecord | null>> {
  if (!supabase) return notConfigured(null);
  const { data, error } = await supabase.from('coag_stratifications').select(COLUMNS).eq('visit_id', visitId).maybeSingle();
  return { data: (data as StratificationRecord | null) ?? null, error: error?.message ?? null };
}

export async function listStratificationsForVisits(visitIds: string[]): Promise<Result<StratificationRecord[]>> {
  if (!supabase) return notConfigured([]);
  if (visitIds.length === 0) return { data: [], error: null };
  const { data, error } = await supabase.from('coag_stratifications').select(COLUMNS).in('visit_id', visitIds);
  return { data: (data ?? []) as unknown as StratificationRecord[], error: error?.message ?? null };
}

export async function createStratification(visitId: string, payload: StratificationDraft): Promise<Result<StratificationRecord | null>> {
  if (!supabase) return notConfigured(null);
  const { data, error } = await supabase.from('coag_stratifications').insert({ visit_id: visitId, ...payload }).select(COLUMNS).single();
  if (error?.code === '23505') {
    return { data: null, error: 'Ya existe una estratificación en esta visita (otra persona la ha creado). Recarga la página para verla antes de continuar.' };
  }
  return { data: (data as StratificationRecord | null) ?? null, error: error?.message ?? null };
}

/** Con control de concurrencia: solo se aplica si la revisión no ha cambiado desde que se cargó. */
export async function updateStratification(
  current: Pick<StratificationRecord, 'id' | 'revision'>,
  payload: StratificationDraft,
  correctionReason: string | null,
): Promise<Result<StratificationRecord | null>> {
  if (!supabase) return notConfigured(null);
  const { data, error } = await supabase
    .from('coag_stratifications')
    .update({ ...payload, ...(correctionReason ? { correction_reason: correctionReason } : {}) })
    .eq('id', current.id)
    .eq('revision', current.revision)
    .select(COLUMNS);
  if (error) return { data: null, error: error.message };
  const rows = (data ?? []) as unknown as StratificationRecord[];
  if (rows.length === 0) {
    return { data: null, error: 'No se guardó: la estratificación ha cambiado desde que la abriste (u otra persona la ha modificado), o no tienes permiso. Recarga la página; tus cambios siguen en pantalla.' };
  }
  return { data: rows[0], error: null };
}
