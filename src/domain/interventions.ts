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
  /** Fecha prevista (migración 20261122120000; ausente o null en registros previos o sin migración). */
  planned_date?: string | null;
  /** Actuación prevista en una visita anterior que este registro documenta como realizada. */
  origin_intervention_id?: string | null;
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

// ── Planificación y continuidad entre visitas (migración 20261122120000_coag_interventions_planning) ──
// Regla: el registro de la visita de origen NO se modifica cuando la actuación se realiza en una visita posterior.
// La realización es un registro nuevo de esa visita con origin_intervention_id; la BD impide duplicarla.

export type VisitRef = { id: string; visit_date: string; status: string; visit_type?: string };

/** Realización activa (no anulada) de una actuación prevista, documentada en otra visita. */
export function resolutionOf<T extends Pick<InterventionRecord, 'id' | 'status' | 'origin_intervention_id'>>(record: Pick<InterventionRecord, 'id'>, all: T[]): T | null {
  return all.find((r) => r.origin_intervention_id === record.id && r.status !== 'discarded') ?? null;
}

export type FollowUpState = 'pending' | 'overdue' | 'performed_same_visit' | 'performed_later' | 'performed' | 'discarded';

export const FOLLOWUP_STATE_LABEL: Record<FollowUpState, string> = {
  pending: 'Pendiente',
  overdue: 'Pendiente (fecha prevista superada)',
  performed_same_visit: 'Realizada',
  performed_later: 'Realizada en una visita posterior',
  performed: 'Realizada',
  discarded: 'Anulada',
};

/** Estado de seguimiento de un registro, sin modificarlo (deducido del vínculo). */
export function followUpState(record: InterventionRecord, all: InterventionRecord[], today: string): FollowUpState {
  if (record.status === 'discarded') return 'discarded';
  if (record.status === 'performed') return record.planned_date ? 'performed_same_visit' : 'performed';
  if (resolutionOf(record, all)) return 'performed_later';
  return record.planned_date && record.planned_date < today ? 'overdue' : 'pending';
}

/**
 * Actuaciones previstas en visitas ANTERIORES (por fecha; la misma fecha cuenta si es otra visita) que siguen
 * pendientes: sin realización activa vinculada. Visitas anuladas excluidas. Orden: fecha prevista, luego visita.
 */
export function pendingFromEarlierVisits(current: VisitRef, visits: VisitRef[], all: InterventionRecord[]): InterventionRecord[] {
  const byId = new Map(visits.map((v) => [v.id, v]));
  return all
    .filter((r) => {
      const v = byId.get(r.visit_id);
      return v && v.id !== current.id && v.status !== 'cancelled' && v.visit_date <= current.visit_date
        && r.status === 'planned' && !resolutionOf(r, all);
    })
    .sort((a, b) => String(a.planned_date ?? '9999').localeCompare(String(b.planned_date ?? '9999'))
      || (byId.get(a.visit_id)!.visit_date).localeCompare(byId.get(b.visit_id)!.visit_date));
}

/** Historial de actuaciones de visitas anteriores (todas, con su estado), de la más reciente a la más antigua. */
export function earlierVisitHistory(current: VisitRef, visits: VisitRef[], all: InterventionRecord[]): Array<{ visit: VisitRef; records: InterventionRecord[] }> {
  return visits
    .filter((v) => v.id !== current.id && v.visit_date <= current.visit_date)
    .sort((a, b) => b.visit_date.localeCompare(a.visit_date))
    .map((visit) => ({ visit, records: all.filter((r) => r.visit_id === visit.id) }))
    .filter((g) => g.records.length > 0);
}

/** Fecha prevista: obligatoria al prever y no anterior a la fecha de la visita (misma regla que la BD). */
export function validatePlannedDate(planned: string | null | undefined, visitDate: string): string[] {
  if (!planned) return ['Indique la fecha prevista de realización.'];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(planned)) return ['Fecha prevista no válida.'];
  if (planned < visitDate) return ['La fecha prevista no puede ser anterior a la fecha de la visita.'];
  return [];
}

/** Fecha de realización: obligatoria y nunca futura (misma regla que la BD). */
export function validatePerformedDate(performed: string | null | undefined, today: string): string[] {
  if (!performed) return ['Indique la fecha en que se realizó la actuación.'];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(performed)) return ['Fecha de realización no válida.'];
  if (performed > today) return ['La fecha de realización no puede ser futura: si aún no se ha hecho, use «Prever».'];
  return [];
}
