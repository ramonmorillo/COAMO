// Actuaciones de atención farmacéutica por prioridad CMO (catálogo de las Tablas 5-7 del modelo SEFH v2.0, en la BD).
// Reglas: recomendada ≠ realizada (solo hay registro si el profesional lo crea); la prioridad vigente es la de la última
// estratificación completada hasta la fecha de la visita (la BD la fija igual al guardar). Si el catálogo cargado no
// contiene la Tabla 7, la interfaz avisa de que el de Prioridad 1 está incompleto.

import type { Priority } from './stratification';

export type InterventionDomain = 'pharmacotherapeutic_followup' | 'patient_education' | 'care_coordination';
export type InterventionStatus = 'planned' | 'performed' | 'discarded';

export const DOMAIN_ORDER: InterventionDomain[] = ['pharmacotherapeutic_followup', 'patient_education', 'care_coordination'];
export const DOMAIN_LABEL: Record<InterventionDomain, string> = {
  pharmacotherapeutic_followup: 'Seguimiento farmacoterapéutico',
  patient_education: 'Educación, formación y seguimiento del paciente',
  care_coordination: 'Coordinación con el equipo asistencial',
};
export const INTERVENTION_STATUS_LABEL: Record<InterventionStatus, string> = {
  planned: 'Prevista',
  performed: 'Realizada',
  discarded: 'Anulada (registro erróneo)',
};

export const CUSTOM_TEXT_MIN = 3;
export const CUSTOM_TEXT_MAX = 500;
export const FOLLOWUP_MAX = 1000;

export type CatalogAction = {
  code: string;
  catalog_version: string;
  domain: InterventionDomain;
  applies_to_priorities: number[];
  source_table: string;
  sort_order: number;
  action_text: string;
  is_active: boolean;
};

export type InterventionRecord = {
  id: string;
  visit_id: string;
  catalog_code: string | null;
  custom_text: string | null;
  domain: InterventionDomain;
  status: InterventionStatus;
  performed_date: string | null;
  followup_note: string | null;
  priority_context: number | null;
  recommended_for_priority: boolean | null;
  revision: number;
  created_at: string;
  updated_at: string;
};

/** Actuaciones del catálogo recomendadas para una prioridad (activas, ordenadas por ámbito y orden de la tabla). */
export function recommendedActions(catalog: CatalogAction[], priority: Priority | null): CatalogAction[] {
  if (!priority) return [];
  return catalog
    .filter((a) => a.is_active && a.applies_to_priorities.includes(priority))
    .sort((a, b) => DOMAIN_ORDER.indexOf(a.domain) - DOMAIN_ORDER.indexOf(b.domain) || a.sort_order - b.sort_order);
}

/**
 * Prioridad vigente en una visita: la de la última estratificación COMPLETADA del paciente con fecha de visita
 * ≤ la de esta visita (espejo de coag_private.enforce_intervention). Sin estratificación → null (no se supone).
 */
export function priorityAtVisit(
  visitDate: string,
  strata: Array<{ visitDate: string; status: string; finalPriority: number | null; completedAt?: string | null }>,
): { priority: Priority; date: string } | null {
  const candidates = strata
    .filter((s) => s.status === 'completed' && s.finalPriority && s.visitDate <= visitDate)
    .sort((a, b) => b.visitDate.localeCompare(a.visitDate) || String(b.completedAt ?? '').localeCompare(String(a.completedAt ?? '')));
  const best = candidates[0];
  return best ? { priority: best.finalPriority as Priority, date: best.visitDate } : null;
}

export function validateCustomAction(text: string): string[] {
  const t = text.trim();
  if (t.length < CUSTOM_TEXT_MIN) return [`Describa la actuación (mínimo ${CUSTOM_TEXT_MIN} caracteres).`];
  if (t.length > CUSTOM_TEXT_MAX) return [`Máximo ${CUSTOM_TEXT_MAX} caracteres.`];
  return [];
}

/** Texto de una actuación registrada (catálogo o adicional). */
export function interventionText(record: Pick<InterventionRecord, 'catalog_code' | 'custom_text'>, catalog: CatalogAction[]): string {
  if (record.catalog_code) return catalog.find((a) => a.code === record.catalog_code)?.action_text ?? record.catalog_code;
  return record.custom_text ?? '';
}

/** Actuaciones REALIZADAS (no previstas ni anuladas), para la historia clínica y los recuentos. */
export function performedInterventions<T extends Pick<InterventionRecord, 'status'>>(records: T[]): T[] {
  return records.filter((r) => r.status === 'performed');
}
