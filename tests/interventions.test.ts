import { describe, expect, it } from 'vitest';

import { interventionText, performedInterventions, priorityAtVisit, recommendedActions, validateCustomAction, type CatalogAction } from '../src/domain/interventions';

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
