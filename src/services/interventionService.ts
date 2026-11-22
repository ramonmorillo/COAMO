// Actuaciones de AF (coag_intervention_catalog, coag_interventions). La RLS y el trigger de la BD son la autoridad:
// ámbito del catálogo, prioridad vigente, «recomendada», autoría y revisión los fija la BD. Un guardado solo se da por
// bueno si la BD devuelve la fila; con una revisión obsoleta no se sobrescribe nada.

import { supabase } from '../lib/supabase';
import type { CatalogAction, InterventionDomain, InterventionRecord, InterventionStatus } from '../domain/interventions';

type Result<T> = { data: T; error: string | null };
const notConfigured = <T>(data: T): Result<T> => ({ data, error: 'Supabase no está configurado.' });

const CATALOG_COLUMNS = 'code,catalog_version,domain,applies_to_priorities,source_table,sort_order,action_text,is_active';
const LEGACY_COLUMNS: string = 'id,visit_id,catalog_code,custom_text,domain,status,performed_date,followup_note,priority_context,recommended_for_priority,revision,created_at,updated_at';
// Columnas de la migración 20261122120000_coag_interventions_planning (pendiente de aplicar en Supabase).
const PLANNING_COLUMNS: string = `${LEGACY_COLUMNS},planned_date,origin_intervention_id`;

/**
 * ¿Está aplicada la migración de planificación? Se detecta una vez: si la BD no tiene las columnas, la interfaz
 * sigue funcionando como antes (sin fecha prevista ni seguimiento entre visitas) en lugar de dejar de cargar.
 */
let planningSchema: boolean | null = null;
const isMissingColumn = (error: { code?: string; message?: string } | null) =>
  !!error && (error.code === '42703' || error.code === 'PGRST204' || /column .* does not exist|Could not find the '.*' column/i.test(error.message ?? ''));
export const planningAvailable = () => planningSchema === true;
const COLUMNS = (): string => (planningSchema === false ? LEGACY_COLUMNS : PLANNING_COLUMNS);

export const INTERVENTION_CONCURRENCY_MESSAGE =
  'Otra persona ha modificado esta actuación desde que abriste la página. No se ha guardado tu cambio: recarga la página y vuelve a aplicarlo.';

export const PLANNING_UNAVAILABLE_MESSAGE =
  'La fecha prevista y el seguimiento entre visitas requieren la migración 20261122120000_coag_interventions_planning, que aún no está aplicada en la base de datos. No se ha guardado.';

export async function listCatalog(): Promise<Result<CatalogAction[]>> {
  if (!supabase) return notConfigured([]);
  const { data, error } = await supabase.from('coag_intervention_catalog').select(CATALOG_COLUMNS).order('code');
  return { data: (data as CatalogAction[] | null) ?? [], error: error?.message ?? null };
}

export async function listInterventionsForVisits(visitIds: string[]): Promise<Result<InterventionRecord[]>> {
  if (!supabase) return notConfigured([]);
  if (visitIds.length === 0) return { data: [], error: null };
  let { data, error } = await supabase.from('coag_interventions').select(COLUMNS()).in('visit_id', visitIds).order('created_at');
  if (planningSchema !== false && isMissingColumn(error)) {
    planningSchema = false;
    ({ data, error } = await supabase.from('coag_interventions').select(LEGACY_COLUMNS).in('visit_id', visitIds).order('created_at'));
  } else if (!error) planningSchema = planningSchema ?? true;
  return { data: (data as unknown as InterventionRecord[] | null) ?? [], error: error?.message ?? null };
}

export type NewIntervention = {
  visit_id: string;
  catalog_code: string | null;
  custom_text: string | null;
  domain: InterventionDomain;
  status: Exclude<InterventionStatus, 'discarded'>;
  performed_date: string | null;
  followup_note: string | null;
  planned_date?: string | null;
  origin_intervention_id?: string | null;
};

const withoutPlanning = <T extends Record<string, unknown>>(input: T) => {
  if (planningSchema !== false) return input;
  const { planned_date: _p, origin_intervention_id: _o, ...rest } = input;
  return rest;
};

export async function createIntervention(input: NewIntervention): Promise<Result<InterventionRecord | null>> {
  if (!supabase) return notConfigured(null);
  if (planningSchema === false && (input.planned_date || input.origin_intervention_id)) {
    return { data: null, error: PLANNING_UNAVAILABLE_MESSAGE };
  }
  const { data, error } = await supabase.from('coag_interventions').insert(withoutPlanning(input)).select(COLUMNS()).maybeSingle();
  if (error) {
    if (error.code === '23505') {
      return { data: null, error: input.origin_intervention_id
        ? 'Esta actuación prevista ya consta como realizada, o la misma actuación ya está registrada en esta visita (quizá por otra persona). Recarga la página.'
        : 'Esta actuación ya está registrada en la visita (quizá por otra persona). Recarga la página.' };
    }
    return { data: null, error: error.message };
  }
  return data ? { data: data as unknown as InterventionRecord, error: null } : { data: null, error: 'La base de datos no confirmó el guardado. No se ha guardado.' };
}

export async function updateIntervention(
  current: Pick<InterventionRecord, 'id' | 'revision'>,
  changes: Partial<Pick<InterventionRecord, 'status' | 'performed_date' | 'followup_note' | 'custom_text' | 'domain' | 'planned_date'>>,
): Promise<Result<InterventionRecord | null>> {
  if (!supabase) return notConfigured(null);
  if (planningSchema === false && 'planned_date' in changes) return { data: null, error: PLANNING_UNAVAILABLE_MESSAGE };
  const { data, error } = await supabase.from('coag_interventions').update(changes).eq('id', current.id).eq('revision', current.revision).select(COLUMNS());
  if (error) return { data: null, error: error.message };
  const rows = (data as unknown as InterventionRecord[] | null) ?? [];
  return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: INTERVENTION_CONCURRENCY_MESSAGE };
}
