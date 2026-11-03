// Cálculos con ejemplos verificados a mano. Los mismos ejemplos están en db-tests/70_coag_questionnaires.sql
// (repositorio canónico DERMAPEX) para garantizar que interfaz y base de datos calculan igual.

import { describe, expect, it } from 'vitest';

import { applicabilityHints, buildAdministrationPayload, isResolved, validateDraft, type DraftState } from '../src/domain/questionnaires/administration';
import { computeScores, eq5dScores, evasafScores, formatScore, iexpacScores, isComplete, progress, scoringVersion, VERITAS_REVERSED_ITEMS, veritasItemScore, veritasPrnScores, veritasProScores } from '../src/domain/questionnaires/scoring';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Ítems invertidos leídos del texto del documento de puntuación (opción «Siempre (5)»). */
function reversedFromDocument(file: string): number[] {
  const lines = readFileSync(join(__dirname, 'fixtures', 'source', file), 'utf8').split('\n');
  const out: number[] = [];
  let current: number | null = null;
  for (const line of lines) {
    const m = /^(\d+)\. /.exec(line);
    if (m) { current = Number(m[1]); continue; }
    if (current !== null && line.startsWith('☐ Siempre')) {
      if (/^☐ Siempre \(5\)/.test(line)) out.push(current);
      current = null;
    }
  }
  return out;
}

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

describe('EVASAF: sin puntuación total documentada', () => {
  it('completitud sin total', () => {
    expect(evasafScores(all(10, 4))).toMatchObject({ complete: true, summary_score: null });
  });
});

// Clave de los documentos «VERITAS-PRN puntuación» y «VERITAS-Pro puntuación» (IP, 03/11/2026): 1 = máxima
// adherencia … 5 = mínima; invertidos (Siempre = 5): PRN 6,7,12,13,17,19,20,23; Pro 6,7,11,13,14,16-20,23.
// Total = suma de los 24 ítems (24-120). Ejemplos calculados a mano.
const PRN_REV = [6, 7, 12, 13, 17, 19, 20, 23];
const PRO_REV = [6, 7, 11, 13, 14, 16, 17, 18, 19, 20, 23];
const pattern = (rev: number[], direct: number, inverted: number) =>
  Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`q${i + 1}`, rev.includes(i + 1) ? inverted : direct]));

describe('VERITAS-PRN (clave del documento de puntuación)', () => {
  it('la clave implementada coincide con el documento (opción «Siempre (5)» = invertido)', () => {
    expect(VERITAS_REVERSED_ITEMS.VERITAS_PRN).toEqual(reversedFromDocument('veritas_prn_scoring.txt'));
  });
  it('máxima adherencia = 24; mínima = 120', () => {
    expect(veritasPrnScores(pattern(PRN_REV, 1, 5))).toMatchObject({ total: 24, complete: true, scoring_status: 'scored' });
    expect(veritasPrnScores(pattern(PRN_REV, 5, 1)).total).toBe(120);
  });
  it('todo «Siempre» (1) → 16 × 1 + 8 × 5 = 56; todo «Nunca» (5) → 16 × 5 + 8 × 1 = 88; todo «A veces» → 72', () => {
    expect(veritasPrnScores(all(24, 1)).total).toBe(56);
    expect(veritasPrnScores(all(24, 5)).total).toBe(88);
    expect(veritasPrnScores(all(24, 3)).total).toBe(72);
  });
  it('puntuación por ítem: q1 directo, q6 invertido', () => {
    const s = veritasPrnScores({ q1: 2, q6: 2, q24: 3 });
    expect(s.item_scores).toEqual({ q1: 2, q6: 4, q24: 3 });
    expect(veritasItemScore('VERITAS_PRN', 13, 1)).toBe(5);
    expect(veritasItemScore('VERITAS_PRN', 14, 1)).toBe(1);
  });
  it('incompleto (23/24): sin total, sin imputación; recuentos por bloque', () => {
    const r = all(24, 1);
    delete r.q24;
    const s = veritasPrnScores(r);
    expect(s).toMatchObject({ items_answered: 23, complete: false, total: null, scoring_status: 'incomplete_no_total', subscale_scores: null });
    expect(veritasPrnScores({ q1: 1, q2: 2, q5: 5, q24: 3 }).block_items_answered)
      .toEqual({ treatment: 2, timing: 1, dosing: 0, planning: 0, remembering: 0, communicating: 1 });
  });
});

describe('VERITAS-Pro (clave del documento de puntuación)', () => {
  it('la clave implementada coincide con el documento', () => {
    expect(VERITAS_REVERSED_ITEMS.VERITAS_PRO).toEqual(reversedFromDocument('veritas_pro_scoring.txt'));
  });
  it('máxima adherencia = 24; mínima = 120', () => {
    expect(veritasProScores(pattern(PRO_REV, 1, 5)).total).toBe(24);
    expect(veritasProScores(pattern(PRO_REV, 5, 1)).total).toBe(120);
  });
  it('todo «Siempre» → 13 × 1 + 11 × 5 = 68; todo «Nunca» → 13 × 5 + 11 × 1 = 76 (difiere de PRN: clave distinta)', () => {
    expect(veritasProScores(all(24, 1)).total).toBe(68);
    expect(veritasProScores(all(24, 5)).total).toBe(76);
    expect(veritasPrnScores(all(24, 1)).total).not.toBe(veritasProScores(all(24, 1)).total);
  });
  it('ejemplo mixto: q11 «Siempre» (invertido) = 5 puntos; q12 «Siempre» = 1', () => {
    expect(veritasProScores({ q11: 1, q12: 1 }).item_scores).toEqual({ q11: 5, q12: 1 });
  });
  it('recuentos por bloque, completitud y estado', () => {
    const s = veritasProScores({ q1: 1, q4: 5, q8: 2, q13: 3, q17: 4, q24: 1 });
    expect(s.block_items_answered).toEqual({ routine: 2, dosing: 1, planning: 0, remembering: 1, skipping: 1, communicating: 1 });
    expect(s).toMatchObject({ items_expected: 24, items_answered: 6, complete: false, total: null, scoring_status: 'incomplete_no_total' });
    const full = computeScores('VERITAS_PRO', all(24, 3));
    expect(isComplete('VERITAS_PRO', full)).toBe(true);
    expect(isComplete('VERITAS_PRO', computeScores('VERITAS_PRO', { q1: 1 }))).toBe(false);
    expect(scoringVersion('VERITAS_PRO')).toBe('coamo-q-2');
    expect(scoringVersion('IEXPAC')).toBe('coamo-q-1');
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
  const base: DraftState = { status: 'in_progress', reasonCode: null, reasonDetail: '', mode: 'self', dataSource: 'paper', date: '2026-10-01', responses: {}, applicability: {}, comments: '' };
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
  it('EVASAF: comentarios opcionales (≤ 2000), solo en EVASAF y nunca en «no aplicable/no realizado»', () => {
    expect(validateDraft('EVASAF', { ...base, comments: 'Muy bien atendido' }, '2026-10-26')).toHaveLength(0);
    expect(validateDraft('EVASAF', { ...base, comments: 'x'.repeat(2001) }, '2026-10-26').join(' ')).toMatch(/2000/);
    expect(validateDraft('IEXPAC', { ...base, comments: 'texto' }, '2026-10-26').join(' ')).toMatch(/Solo EVASAF/);
    expect(validateDraft('EVASAF', { ...base, status: 'not_done', reasonCode: 'patient_declined', comments: 'x' }, '2026-10-26').join(' ')).toMatch(/comentarios/);
    expect(buildAdministrationPayload({ ...base, comments: '  Gracias  ' }).comments).toBe('Gracias');
    expect(buildAdministrationPayload({ ...base, comments: '   ' }).comments).toBeNull();
    expect(buildAdministrationPayload({ ...base, status: 'not_done', reasonCode: 'patient_declined', comments: 'x' }).comments).toBeNull();
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
