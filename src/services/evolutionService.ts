// Evolución farmacéutica por visita (public.coag_visit_evolutions). La RLS y el trigger de la BD son la
// autoridad: autoría, fechas y revisión las fija la BD. Un guardado solo se da por bueno si la BD devuelve
// la fila guardada; con una revisión obsoleta (otra persona guardó antes) no se sobrescribe nada.

import { supabase } from '../lib/supabase';
import type { EvolutionRecord } from '../domain/evolution';

type Result<T> = { data: T; error: string | null };

const COLUMNS = 'visit_id,evolution_text,revision,created_by,updated_by,created_at,updated_at';
const notConfigured = <T>(data: T): Result<T> => ({ data, error: 'Supabase no está configurado.' });

export const CONCURRENCY_MESSAGE =
  'Otra persona ha modificado esta evolución desde que la abriste. No se ha guardado tu cambio: copia tu texto, recarga la página y vuelve a aplicarlo.';

export async function getEvolution(visitId: string): Promise<Result<EvolutionRecord | null>> {
  if (!supabase) return notConfigured(null);
  const { data, error } = await supabase.from('coag_visit_evolutions').select(COLUMNS).eq('visit_id', visitId).maybeSingle();
  return { data: (data as EvolutionRecord | null) ?? null, error: error?.message ?? null };
}

export async function listEvolutionsForVisits(visitIds: string[]): Promise<Result<EvolutionRecord[]>> {
  if (!supabase) return notConfigured([]);
  if (visitIds.length === 0) return { data: [], error: null };
  const { data, error } = await supabase.from('coag_visit_evolutions').select(COLUMNS).in('visit_id', visitIds);
  return { data: (data as EvolutionRecord[] | null) ?? [], error: error?.message ?? null };
}

/** Alta (loadedRevision = null) o modificación condicionada a la revisión cargada. */
export async function saveEvolution(visitId: string, text: string, loadedRevision: number | null): Promise<Result<EvolutionRecord | null>> {
  if (!supabase) return notConfigured(null);
  if (loadedRevision === null) {
    const { data, error } = await supabase.from('coag_visit_evolutions').insert({ visit_id: visitId, evolution_text: text }).select(COLUMNS).maybeSingle();
    if (error) {
      return { data: null, error: error.code === '23505' ? CONCURRENCY_MESSAGE : error.message };
    }
    return data ? { data: data as EvolutionRecord, error: null } : { data: null, error: 'La base de datos no confirmó el guardado. No se ha guardado.' };
  }
  const { data, error } = await supabase
    .from('coag_visit_evolutions')
    .update({ evolution_text: text })
    .eq('visit_id', visitId)
    .eq('revision', loadedRevision)
    .select(COLUMNS);
  if (error) return { data: null, error: error.message };
  const rows = (data as EvolutionRecord[] | null) ?? [];
  if (rows.length !== 1) return { data: null, error: CONCURRENCY_MESSAGE };
  return { data: rows[0], error: null };
}

export type EvolutionAuditEntry = {
  at: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  actor_id: string | null;
  old_data: Partial<EvolutionRecord> | null;
  new_data: Partial<EvolutionRecord> | null;
};

/** Versiones anteriores (coag_audit_log; la RLS solo las devuelve a coordinación COAMO). */
export async function listEvolutionHistory(visitId: string): Promise<Result<EvolutionAuditEntry[]>> {
  if (!supabase) return notConfigured([]);
  const { data, error } = await supabase
    .from('coag_audit_log')
    .select('at,action,actor_id,old_data,new_data')
    .eq('table_name', 'coag_visit_evolutions')
    .eq('row_id', visitId)
    .order('at');
  return { data: (data ?? []) as EvolutionAuditEntry[], error: error?.message ?? null };
}
