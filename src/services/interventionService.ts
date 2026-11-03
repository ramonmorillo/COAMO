// Actuaciones de AF (coag_intervention_catalog, coag_interventions). La RLS y el trigger de la BD son la autoridad:
// ámbito del catálogo, prioridad vigente, «recomendada», autoría y revisión los fija la BD. Un guardado solo se da por
// bueno si la BD devuelve la fila; con una revisión obsoleta no se sobrescribe nada.

import { supabase } from '../lib/supabase';
import type { CatalogAction, InterventionDomain, InterventionRecord, InterventionStatus } from '../domain/interventions';

type Result<T> = { data: T; error: string | null };
const notConfigured = <T>(data: T): Result<T> => ({ data, error: 'Supabase no está configurado.' });

const CATALOG_COLUMNS = 'code,catalog_version,domain,applies_to_priorities,source_table,sort_order,action_text,is_active';
const COLUMNS = 'id,visit_id,catalog_code,custom_text,domain,status,performed_date,followup_note,priority_context,recommended_for_priority,revision,created_at,updated_at';

export const INTERVENTION_CONCURRENCY_MESSAGE =
  'Otra persona ha modificado esta actuación desde que abriste la página. No se ha guardado tu cambio: recarga la página y vuelve a aplicarlo.';

export async function listCatalog(): Promise<Result<CatalogAction[]>> {
  if (!supabase) return notConfigured([]);
  const { data, error } = await supabase.from('coag_intervention_catalog').select(CATALOG_COLUMNS).order('code');
  return { data: (data as CatalogAction[] | null) ?? [], error: error?.message ?? null };
}

export async function listInterventionsForVisits(visitIds: string[]): Promise<Result<InterventionRecord[]>> {
  if (!supabase) return notConfigured([]);
  if (visitIds.length === 0) return { data: [], error: null };
  const { data, error } = await supabase.from('coag_interventions').select(COLUMNS).in('visit_id', visitIds).order('created_at');
  return { data: (data as InterventionRecord[] | null) ?? [], error: error?.message ?? null };
}

export type NewIntervention = {
  visit_id: string;
  catalog_code: string | null;
  custom_text: string | null;
  domain: InterventionDomain;
  status: Exclude<InterventionStatus, 'discarded'>;
  performed_date: string | null;
  followup_note: string | null;
};

export async function createIntervention(input: NewIntervention): Promise<Result<InterventionRecord | null>> {
  if (!supabase) return notConfigured(null);
  const { data, error } = await supabase.from('coag_interventions').insert(input).select(COLUMNS).maybeSingle();
  if (error) {
    return { data: null, error: error.code === '23505' ? 'Esta actuación ya está registrada en la visita (quizá por otra persona). Recarga la página.' : error.message };
  }
  return data ? { data: data as InterventionRecord, error: null } : { data: null, error: 'La base de datos no confirmó el guardado. No se ha guardado.' };
}

export async function updateIntervention(
  current: Pick<InterventionRecord, 'id' | 'revision'>,
  changes: Partial<Pick<InterventionRecord, 'status' | 'performed_date' | 'followup_note' | 'custom_text' | 'domain'>>,
): Promise<Result<InterventionRecord | null>> {
  if (!supabase) return notConfigured(null);
  const { data, error } = await supabase.from('coag_interventions').update(changes).eq('id', current.id).eq('revision', current.revision).select(COLUMNS);
  if (error) return { data: null, error: error.message };
  const rows = (data as InterventionRecord[] | null) ?? [];
  return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: INTERVENTION_CONCURRENCY_MESSAGE };
}
