import { describe, expect, it } from 'vitest';

import type { QuestionnaireAdministration } from '../src/domain/questionnaires/administration';
import { buildSeries, SERIES_SPECS } from '../src/domain/questionnaires/evolutionSeries';

const adm = (visit_id: string, code: QuestionnaireAdministration['instrument_code'], over: Partial<QuestionnaireAdministration>): QuestionnaireAdministration => ({
  id: `${visit_id}-${code}`, visit_id, instrument_code: code, instrument_version: 'v1', status: 'completed', status_reason_code: null, status_reason_detail: null,
  administration_mode: 'self', data_source: 'electronic', administration_date: null, responses: {}, item_applicability: {}, comments: null, scores: {},
  scoring_version: 'x', revision: 1, last_correction_reason: null, last_corrected_at: null, completed_at: null, created_at: '', updated_at: '', ...over,
} as QuestionnaireAdministration);
const visits = [{ id: 'v0', visit_date: '2026-01-15', label: 'V0' }, { id: 'vf', visit_date: '2027-01-20', label: 'VF' }];

describe('series de evolución por instrumento', () => {
  it('escalas propias y dirección declarada (VERITAS: menor = mejor; resto: mayor = mejor)', () => {
    const by = Object.fromEntries(SERIES_SPECS.map((s) => [s.code, s]));
    expect([by.IEXPAC.min, by.IEXPAC.max, by.EQ5D3L.max, by.EVASAF.min, by.EVASAF.max, by.VERITAS_PRN.min, by.VERITAS_PRO.max]).toEqual([0, 10, 100, 10, 50, 24, 120]);
    expect(by.VERITAS_PRN.higherIsBetter).toBe(false);
    expect(by.VERITAS_PRO.higherIsBetter).toBe(false);
    expect(by.EVASAF.higherIsBetter && by.IEXPAC.higherIsBetter && by.EQ5D3L.higherIsBetter).toBe(true);
  });
  it('eje temporal con la fecha real de administración; si falta, la de la visita (marcada)', () => {
    const s = buildSeries('VERITAS_PRN', [
      adm('v0', 'VERITAS_PRN', { administration_date: '2026-01-20', scores: { total: 70 } as never }),
      adm('vf', 'VERITAS_PRN', { scores: { total: 60 } as never }),
    ], visits);
    expect(s.points.map((p) => [p.date, p.dateIsVisitDate, p.value])).toEqual([['2026-01-20', false, 70], ['2027-01-20', true, 60]]);
    expect(s.change).toMatchObject({ delta: -10, favorable: true });
  });
  it('datos ausentes: no se dibujan ni se interpolan; se listan con su motivo', () => {
    const s = buildSeries('IEXPAC', [adm('v0', 'IEXPAC', { scores: { global_0_10: null } as never }), adm('vf', 'IEXPAC', { status: 'not_done' })], visits);
    expect(s.points).toEqual([]);
    expect(s.missing.map((m) => m.reason)).toEqual(['Incompleto: sin puntuación (no se imputa)', 'No realizado']);
    expect(s.change).toBeNull();
    const none = buildSeries('EQ5D3L', [], visits);
    expect(none.missing.map((m) => m.reason)).toEqual(['Sin registro', 'Sin registro']);
  });
  it('EVASAF: suma descriptiva solo con 10 ítems; borradores no cuentan', () => {
    const full = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`q${i + 1}`, 4]));
    const s = buildSeries('EVASAF', [adm('v0', 'EVASAF', { responses: full }), adm('vf', 'EVASAF', { responses: full, status: 'in_progress' })], visits);
    expect(s.points.map((p) => p.value)).toEqual([40]);
    expect(s.missing[0].reason).toBe('En curso (no completado)');
  });
  it('versiones distintas del instrumento: no se calcula el cambio', () => {
    const s = buildSeries('EQ5D3L', [adm('v0', 'EQ5D3L', { scores: { vas: 50 } as never }), adm('vf', 'EQ5D3L', { scores: { vas: 70 } as never, instrument_version: 'v2' })], visits);
    expect(s.versionMismatch).toBe(true);
    expect(s.change).toBeNull();
  });
});
