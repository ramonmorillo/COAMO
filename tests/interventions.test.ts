import { describe, expect, it } from 'vitest';

import {
  earlierVisitHistory, followUpState, interventionText, pendingFromEarlierVisits, performedInterventions, priorityAtVisit, recommendedActions, resolutionOf,
  validateCustomAction, validatePerformedDate, validatePlannedDate, type CatalogAction, type InterventionRecord as IR,
} from '../src/domain/interventions';

const a = (code: string, domain: CatalogAction['domain'], applies: number[], sort: number): CatalogAction =>
  ({ code, domain, applies_to_priorities: applies, sort_order: sort, catalog_version: 'v', source_table: 'Tabla 5', action_text: `texto ${code}`, is_active: true });
const catalog = [a('COO-01', 'care_coordination', [1, 2, 3], 1), a('SFT-06', 'pharmacotherapeutic_followup', [1, 2], 6), a('SFT-01', 'pharmacotherapeutic_followup', [1, 2, 3], 1),
  { ...a('EDU-99', 'patient_education', [3], 1), is_active: false }];

describe('actuaciones recomendadas por prioridad (tablas acumulativas)', () => {
  it('P3 solo las de la Tabla 5; P2 añade las de la Tabla 6; orden por ámbito y tabla; inactivas fuera', () => {
    expect(recommendedActions(catalog, 3).map((x) => x.code)).toEqual(['SFT-01', 'COO-01']);
    expect(recommendedActions(catalog, 2).map((x) => x.code)).toEqual(['SFT-01', 'SFT-06', 'COO-01']);
    expect(recommendedActions(catalog, null)).toEqual([]);
  });
  it('prioridad vigente: última estratificación completada con fecha ≤ visita; sin ella, null (no se supone)', () => {
    const strata = [
      { visitDate: '2026-01-10', status: 'completed', finalPriority: 2 },
      { visitDate: '2026-06-10', status: 'completed', finalPriority: 1 },
      { visitDate: '2026-09-10', status: 'in_progress', finalPriority: null },
      { visitDate: '2026-12-10', status: 'completed', finalPriority: 3 },
    ];
    expect(priorityAtVisit('2026-07-01', strata)).toEqual({ priority: 1, date: '2026-06-10' });
    expect(priorityAtVisit('2026-01-10', strata)).toEqual({ priority: 2, date: '2026-01-10' });
    expect(priorityAtVisit('2025-12-31', strata)).toBeNull();
  });
  it('recomendada ≠ realizada: solo cuentan las realizadas', () => {
    const recs = [{ status: 'planned' as const }, { status: 'performed' as const }, { status: 'discarded' as const }];
    expect(performedInterventions(recs)).toEqual([{ status: 'performed' }]);
  });
  it('texto de catálogo o adicional; validación de la adicional', () => {
    expect(interventionText({ catalog_code: 'SFT-01', custom_text: null }, catalog)).toBe('texto SFT-01');
    expect(interventionText({ catalog_code: null, custom_text: 'Llamada' }, catalog)).toBe('Llamada');
    expect(validateCustomAction('  a ')).toHaveLength(1);
    expect(validateCustomAction('x'.repeat(501))).toHaveLength(1);
    expect(validateCustomAction('Llamada a hematología')).toHaveLength(0);
  });
});

// ── Planificación y continuidad entre visitas (migración 20261122120000; secuencia de la fase 5.4) ──
const rec = (over: Partial<IR>): IR => ({
  id: 'x', visit_id: 'v1', catalog_code: 'EDU-08', custom_text: null, domain: 'patient_education', status: 'planned', performed_date: null,
  planned_date: null, origin_intervention_id: null, followup_note: null, priority_context: 2, recommended_for_priority: true, revision: 1,
  created_at: '2026-01-15T10:00:00Z', updated_at: '2026-01-15T10:00:00Z', ...over,
});

describe('Actuaciones: prevista → pendiente → realizada en visita posterior sin alterar el histórico', () => {
  const v1 = { id: 'v1', visit_date: '2026-01-15', status: 'completed' };
  const v2 = { id: 'v2', visit_date: '2026-06-15', status: 'completed' };
  const v3 = { id: 'v3', visit_date: '2026-09-15', status: 'scheduled' };
  const visits = [v1, v2, v3];

  it('fechas: la prevista no puede ser anterior a la visita; la realizada no puede ser futura', () => {
    expect(validatePlannedDate('2026-03-01', '2026-01-15')).toEqual([]);
    expect(validatePlannedDate('2026-01-15', '2026-01-15')).toEqual([]);
    expect(validatePlannedDate('2026-01-14', '2026-01-15')[0]).toMatch(/anterior/);
    expect(validatePlannedDate('', '2026-01-15')[0]).toMatch(/Indique/);
    expect(validatePerformedDate('2026-11-22', '2026-11-22')).toEqual([]);
    expect(validatePerformedDate('2026-11-23', '2026-11-22')[0]).toMatch(/futura/);
    expect(validatePerformedDate(null, '2026-11-22')[0]).toMatch(/Indique/);
  });

  it('secuencia completa: visita 1 conserva estado y fecha prevista; la ejecución consta una sola vez en la visita 2', () => {
    // 1. Prevista en la visita 1.
    const planned = rec({ id: 'a1', visit_id: 'v1', planned_date: '2026-03-01' });
    let all: IR[] = [planned];
    const snapshot = JSON.stringify(planned);
    expect(followUpState(planned, all, '2026-02-01')).toBe('pending');
    expect(followUpState(planned, all, '2026-04-01')).toBe('overdue');
    // 2. Visible como pendiente en la visita 2 (y no en la propia visita 1).
    expect(pendingFromEarlierVisits(v2, visits, all).map((r) => r.id)).toEqual(['a1']);
    expect(pendingFromEarlierVisits(v1, visits, all)).toEqual([]);
    // 3. Realización documentada en la visita 2 (registro nuevo vinculado).
    const done = rec({ id: 'a2', visit_id: 'v2', status: 'performed', performed_date: '2026-06-15', planned_date: '2026-03-01', origin_intervention_id: 'a1' });
    all = [planned, done];
    // 4-5. La visita 1 conserva exactamente su registro (no se ha tocado) y se ve como realizada después.
    expect(JSON.stringify(planned)).toBe(snapshot);
    expect(planned.status).toBe('planned');
    expect(planned.planned_date).toBe('2026-03-01');
    expect(followUpState(planned, all, '2026-11-22')).toBe('performed_later');
    expect(resolutionOf(planned, all)?.id).toBe('a2');
    // 6. Sin duplicaciones: ya no está pendiente en visitas posteriores y la realización consta una vez.
    expect(pendingFromEarlierVisits(v3, visits, all)).toEqual([]);
    expect(all.filter((r) => r.status === 'performed')).toHaveLength(1);
    expect(earlierVisitHistory(v3, visits, all).map((g) => g.visit.id)).toEqual(['v2', 'v1']);
  });

  it('anular la realización devuelve la prevista a pendiente; las visitas anuladas no generan pendientes', () => {
    const planned = rec({ id: 'a1', visit_id: 'v1', planned_date: '2026-03-01' });
    const voided = rec({ id: 'a2', visit_id: 'v2', status: 'discarded', performed_date: '2026-06-15', origin_intervention_id: 'a1' });
    expect(pendingFromEarlierVisits(v3, visits, [planned, voided]).map((r) => r.id)).toEqual(['a1']);
    const cancelledVisits = [{ ...v1, status: 'cancelled' }, v2, v3];
    expect(pendingFromEarlierVisits(v3, cancelledVisits, [planned])).toEqual([]);
  });

  it('no aparecen como pendientes las previstas en visitas posteriores ni las ya realizadas o anuladas', () => {
    const later = rec({ id: 'b1', visit_id: 'v3', planned_date: '2026-10-01' });
    const performed = rec({ id: 'b2', visit_id: 'v1', status: 'performed', performed_date: '2026-01-15' });
    const discarded = rec({ id: 'b3', visit_id: 'v1', status: 'discarded' });
    expect(pendingFromEarlierVisits(v2, visits, [later, performed, discarded])).toEqual([]);
  });
});
