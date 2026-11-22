// EVASAF (suma descriptiva, 22/11/2026) y dirección de VERITAS-PRN/VERITAS-Pro en todas las capas de texto y cálculo.
import { describe, expect, it } from 'vitest';

import type { QuestionnaireAdministration } from '../src/domain/questionnaires/administration';
import { compareInstrument } from '../src/domain/questionnaires/comparison';
import { INSTRUMENTS } from '../src/domain/questionnaires/instruments';
import { evasafDescriptiveSum, evasafScores, veritasPrnScores, veritasProScores, type Responses } from '../src/domain/questionnaires/scoring';

const all = (n: number, v: number): Responses => Object.fromEntries(Array.from({ length: n }, (_, i) => [`q${i + 1}`, v]));
const admin = (code: QuestionnaireAdministration['instrument_code'], responses: Responses, over: Partial<QuestionnaireAdministration> = {}): QuestionnaireAdministration => ({
  id: `${code}-${Math.random()}`, visit_id: 'v', instrument_code: code, instrument_version: 'x', status: 'completed', status_reason_code: null, status_reason_detail: null,
  administration_mode: 'self', data_source: 'electronic', administration_date: '2026-01-15', responses, item_applicability: {}, comments: null,
  scores: code === 'VERITAS_PRN' ? veritasPrnScores(responses) : code === 'VERITAS_PRO' ? veritasProScores(responses) : evasafScores(responses),
  scoring_version: 'x', revision: 1, last_correction_reason: null, last_corrected_at: null, completed_at: '2026-01-15', created_at: '', updated_at: '', ...over,
});

describe('EVASAF: suma descriptiva 10-50, solo completa, sin imputación', () => {
  it('rango 10-50 y dirección mayor = mejor', () => {
    expect(evasafDescriptiveSum(all(10, 1))).toBe(10);
    expect(evasafDescriptiveSum(all(10, 5))).toBe(50);
    expect(evasafDescriptiveSum({ ...all(10, 3), q10: 4 })).toBe(31);
  });
  it('un ítem ausente o fuera de rango → sin suma (nunca suma parcial)', () => {
    const missing = all(10, 4); delete missing.q7;
    expect(evasafDescriptiveSum(missing)).toBeNull();
    expect(evasafDescriptiveSum({ ...all(10, 4), q3: 6 })).toBeNull();
    expect(evasafDescriptiveSum({ ...all(10, 4), q3: 0 })).toBeNull();
    expect(evasafDescriptiveSum(null)).toBeNull();
  });
  it('la BD sigue sin puntuación total validada (summary_score null): la suma no se hace pasar por escala validada', () => {
    const s = evasafScores(all(10, 5));
    expect(s.summary_score).toBeNull();
    expect(s.summary_score_status).toBe('no_approved_rule');
    expect(INSTRUMENTS.EVASAF.scoringSummary).toMatch(/No es una puntuación total validada/);
    expect(INSTRUMENTS.EVASAF.directionNote).toMatch(/Mayor valor = valoración más favorable/);
  });
  it('V0-VF: aumento = mejor; un registro incompleto no se compara', () => {
    const cmp = compareInstrument('EVASAF', admin('EVASAF', all(10, 3)), admin('EVASAF', all(10, 4)));
    const m = cmp.metrics.find((x) => x.key === 'descriptive_sum')!;
    expect([m.v0, m.vf, m.delta, m.direction, m.change]).toEqual([30, 40, 10, 'higher_is_better', 'better']);
    const partial = all(10, 4); delete partial.q1;
    const inc = compareInstrument('EVASAF', admin('EVASAF', all(10, 3)), admin('EVASAF', partial)).metrics.find((x) => x.key === 'descriptive_sum')!;
    expect(inc.vf).toBeNull();
    expect(inc.delta).toBeNull();
    // Borrador (no completado): no se usa.
    const draft = compareInstrument('EVASAF', admin('EVASAF', all(10, 3), { status: 'in_progress' }), admin('EVASAF', all(10, 4))).metrics.find((x) => x.key === 'descriptive_sum')!;
    expect(draft.v0).toBeNull();
  });
});

describe('VERITAS-PRN y VERITAS-Pro: 24-120, mayor puntuación = MENOR adherencia', () => {
  it('textos de dirección en el catálogo', () => {
    for (const code of ['VERITAS_PRN', 'VERITAS_PRO'] as const) {
      expect(INSTRUMENTS[code].directionNote).toMatch(/^Menor puntuación = mayor adherencia/);
      expect(INSTRUMENTS[code].scoringSummary).toMatch(/de 24 \(máxima adherencia\) a 120 \(mínima\)/);
    }
  });
  it('un aumento del total entre V0 y VF se clasifica como empeoramiento (no se invierte)', () => {
    // Ítem no invertido: posición 1 (Siempre) = 1 punto. Todo «Siempre» en PRN: invertidos puntúan 5.
    for (const code of ['VERITAS_PRN', 'VERITAS_PRO'] as const) {
      const better = admin(code, all(24, 1));
      const worse = admin(code, all(24, 5));
      const tBetter = (better.scores as { total: number }).total;
      const tWorse = (worse.scores as { total: number }).total;
      expect(tBetter).toBeGreaterThanOrEqual(24);
      expect(tWorse).toBeLessThanOrEqual(120);
      const m = compareInstrument(code, better, worse).metrics.find((x) => x.key === 'total')!;
      expect(m.direction).toBe('lower_is_better');
      expect(m.change).toBe(tWorse > tBetter ? 'worse' : 'better');
      const back = compareInstrument(code, worse, better).metrics.find((x) => x.key === 'total')!;
      expect(back.change).toBe(tWorse > tBetter ? 'better' : 'worse');
    }
  });
});
