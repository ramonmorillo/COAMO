// Cálculos con ejemplos verificados a mano. Los mismos ejemplos están en db-tests/70_coag_questionnaires.sql
// (repositorio canónico DERMAPEX) para garantizar que interfaz y base de datos calculan igual.

import { describe, expect, it } from 'vitest';

import { applicabilityHints, buildAdministrationPayload, isResolved, validateDraft, type DraftState } from '../src/domain/questionnaires/administration';
import { computeScores, eq5dScores, evasafScores, formatScore, iexpacScores, isComplete, progress, veritasPrnScores, veritasProScores } from '../src/domain/questionnaires/scoring';

const all = (n: number, value: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`q${i + 1}`, value]));

describe('IEXPAC (protocolo p. 10: global = 10 × (suma − 11) / 44)', () => {
  it('11 × «siempre» (5) → suma 55 → global 10', () => {
    expect(iexpacScores(all(11, 5), {})).toMatchObject({ sum: 55, global_0_10: 10, complete: true });
  });
  it('11 × «nunca» (1) → suma 11 → global 0 (cero válido, no ausente)', () => {
    const s = iexpacScores(all(11, 1), {});
    expect(s.sum).toBe(11);
    expect(s.global_0_10).toBe(0);
  });
  it('5,4,3,2,1,5,4,3,2,1,3 → suma 33 → global 5', () => {
    const r = { q1: 5, q2: 4, q3: 3, q4: 2, q5: 1, q6: 5, q7: 4, q8: 3, q9: 2, q10: 1, q11: 3 };
    expect(iexpacScores(r, {})).toMatchObject({ sum: 33, global_0_10: 5 });
    expect(iexpacScores({ ...r, q1: 4 }, {})).toMatchObject({ sum: 32, global_0_10: 4.7727 });
  });
  it('11 × «a veces» (3) → suma 33 → 5; un ítem «casi siempre» más → 5,2273', () => {
    expect(iexpacScores(all(11, 3), {}).global_0_10).toBe(5);
    expect(iexpacScores({ ...all(11, 3), q1: 4 }, {}).global_0_10).toBe(5.2273);
  });
  it('parcial (10 de 11): sin suma ni global; no se imputa', () => {
    const r = all(11, 5);
    delete r.q11;
    expect(iexpacScores(r, {})).toMatchObject({ items_answered: 10, complete: false, sum: null, global_0_10: null });
  });
  it('los ítems condicionados no entran en la suma', () => {
    const s = iexpacScores({ ...all(11, 1), q12: 5, q13: 5 }, { q12: true, q13: true, q14: false });
    expect(s.sum).toBe(11);
    expect(s.conditional_applicable).toBe(2);
    expect(s.conditional_answered).toBe(2);
  });
});

describe('EQ-5D-3L', () => {
  it('perfil de 5 dígitos en el orden del documento', () => {
    expect(eq5dScores({ mobility: 1, self_care: 1, usual_activities: 2, pain_discomfort: 2, anxiety_depression: 3, vas: 70 }))
      .toMatchObject({ profile: '11223', profile_complete: true, vas: 70, utility_index: null });
  });
  it('perfil incompleto: sin código; la EVA disponible se conserva y 0 es un valor válido', () => {
    expect(eq5dScores({ mobility: 1, self_care: 1, usual_activities: 2, pain_discomfort: 2, vas: 0 }))
      .toMatchObject({ profile: null, profile_complete: false, dimensions_answered: 4, vas: 0 });
  });
  it('nunca calcula índice de utilidad (sin tarifa aprobada)', () => {
    expect(eq5dScores({ mobility: 1, self_care: 1, usual_activities: 1, pain_discomfort: 1, anxiety_depression: 1 }).utility_index).toBeNull();
  });
  it('completo exige perfil y EVA', () => {
    expect(isComplete('EQ5D3L', eq5dScores({ mobility: 1, self_care: 1, usual_activities: 1, pain_discomfort: 1, anxiety_depression: 1 }))).toBe(false);
  });
});

describe('EVASAF, VERITAS-PRN y VERITAS-Pro: sin puntuación no documentada', () => {
  it('EVASAF: completitud sin total', () => {
    expect(evasafScores(all(10, 4))).toMatchObject({ complete: true, summary_score: null });
  });
  it('VERITAS-PRN: recuentos por bloque y sin puntuación', () => {
    const s = veritasPrnScores({ q1: 1, q2: 2, q5: 5, q24: 3 });
    expect(s.block_items_answered).toEqual({ treatment: 2, timing: 1, dosing: 0, planning: 0, remembering: 0, communicating: 1 });
    expect(s.scores).toBeNull();
    expect(s.complete).toBe(false);
  });
  it('VERITAS-Pro: recuentos por bloque, completitud y sin puntuación', () => {
    const s = veritasProScores({ q1: 1, q4: 5, q8: 2, q13: 3, q17: 4, q24: 1 });
    expect(s.block_items_answered).toEqual({ routine: 2, dosing: 1, planning: 0, remembering: 1, skipping: 1, communicating: 1 });
    expect(s).toMatchObject({ items_expected: 24, items_answered: 6, complete: false, scores: null, scoring_status: 'scoring_key_not_provided' });
    const full = computeScores('VERITAS_PRO', all(24, 3));
    expect(isComplete('VERITAS_PRO', full)).toBe(true);
    expect(isComplete('VERITAS_PRO', computeScores('VERITAS_PRO', { q1: 1 }))).toBe(false);
  });
});

describe('progreso y formato', () => {
  it('los condicionados aplicables suman al esperado', () => {
    expect(progress('IEXPAC', Array.from({ length: 11 }, (_, i) => `q${i + 1}`), { q1: 1, q12: 3 }, { q12: true, q13: false }))
      .toEqual({ answered: 2, expected: 12 });
  });
  it('formato con coma decimal; ausente como guion', () => {
    expect(formatScore(4.7727)).toBe('4,77');
    expect(formatScore(0)).toBe('0,00');
    expect(formatScore(null)).toBe('—');
  });
});

describe('validación del borrador', () => {
  const base: DraftState = { status: 'in_progress', reasonCode: null, reasonDetail: '', mode: 'self', dataSource: 'paper', date: '2026-10-01', responses: {}, applicability: {} };
  it('completar exige fecha, modalidad y alguna respuesta', () => {
    expect(validateDraft('IEXPAC', { ...base, status: 'completed', date: '', mode: null }, '2026-10-26')).toHaveLength(3);
  });
  it('rechaza fecha futura, valores fuera de escala y condicionados sin condición', () => {
    const errors = validateDraft('IEXPAC', { ...base, date: '2026-12-01', responses: { q1: 6, q12: 3 } }, '2026-10-26');
    expect(errors.join(' ')).toMatch(/futura/);
    expect(errors.join(' ')).toMatch(/q1/);
    expect(errors.join(' ')).toMatch(/condición/);
  });
  it('EQ-5D-3L exige modalidad y no admite la asistida', () => {
    expect(validateDraft('EQ5D3L', { ...base, mode: null }, '2026-10-26').join(' ')).toMatch(/modalidad/);
    expect(validateDraft('EQ5D3L', { ...base, mode: 'assisted' }, '2026-10-26').join(' ')).toMatch(/modalidad/);
  });
  it('no aplicable exige motivo y no conserva respuestas', () => {
    expect(validateDraft('VERITAS_PRN', { ...base, status: 'not_applicable', responses: { q1: 1 } }, '2026-10-26')).toHaveLength(2);
    expect(validateDraft('VERITAS_PRN', { ...base, status: 'not_applicable', reasonCode: 'other', reasonDetail: '' }, '2026-10-26')).toHaveLength(1);
    expect(validateDraft('VERITAS_PRN', { ...base, status: 'not_applicable', reasonCode: 'regimen_mismatch' }, '2026-10-26')).toHaveLength(0);
  });
  it('VERITAS-Pro admite respuestas 1-5 y rechaza valores o ítems fuera del documento', () => {
    expect(validateDraft('VERITAS_PRO', { ...base, responses: { q1: 1, q24: 5 } }, '2026-10-26')).toHaveLength(0);
    expect(validateDraft('VERITAS_PRO', { ...base, responses: { q1: 6 } }, '2026-10-26').join(' ')).toMatch(/q1/);
    expect(validateDraft('VERITAS_PRO', { ...base, responses: { q25: 1 } }, '2026-10-26').length).toBeGreaterThan(0);
  });
  it('la carga útil solo incluye motivo en estados que lo requieren', () => {
    expect(buildAdministrationPayload({ ...base, reasonCode: 'other', reasonDetail: 'x' }).status_reason_code).toBeNull();
    expect(buildAdministrationPayload({ ...base, status: 'not_done', reasonCode: 'patient_declined' }).status_reason_code).toBe('patient_declined');
  });
  it('«no realizado» no cuenta como resuelto; «no aplicable» sí', () => {
    expect(isResolved('not_done')).toBe(false);
    expect(isResolved('not_applicable')).toBe(true);
  });
});

describe('aplicabilidad orientativa de VERITAS (nunca impuesta)', () => {
  it('PRN en profilaxis: sugiere «no aplicable»', () => {
    const hints = applicabilityHints('VERITAS_PRN', { diagnosis: 'HA', treatmentRegimen: 'prophylaxis', treatmentType: null });
    expect(hints.some((h) => h.tone === 'warning' && /no aplicable/i.test(h.text))).toBe(true);
  });
  it('PRN a demanda: informa sin aviso', () => {
    expect(applicabilityHints('VERITAS_PRN', { diagnosis: 'HB', treatmentRegimen: 'on_demand', treatmentType: 'plasma_derived' }).every((h) => h.tone === 'info')).toBe(true);
  });
  it('EVW y terapia no sustitutiva: avisa de decisión pendiente del IP', () => {
    const hints = applicabilityHints('VERITAS_PRN', { diagnosis: 'EVW', treatmentRegimen: 'on_demand', treatmentType: 'non_replacement' });
    expect(hints.filter((h) => h.tone === 'warning')).toHaveLength(2);
  });
  it('otros instrumentos: sin sugerencias', () => {
    expect(applicabilityHints('IEXPAC', { diagnosis: 'HA', treatmentRegimen: 'prophylaxis', treatmentType: null })).toEqual([]);
  });
});
