// Comparación V0–VF, exportación CSV y cuadro de mando de cumplimiento.

import { describe, expect, it } from 'vitest';

import type { QuestionnaireAdministration } from '../src/domain/questionnaires/administration';
import { compareInstrument, ordinalChange } from '../src/domain/questionnaires/comparison';
import { completionPercentage, questionnaireCompletion } from '../src/domain/questionnaires/dashboard';
import { buildExport, dictionaryCsv, exportFiles, formatCell, PAIRED_COLUMNS, toCsv, WIDE_COLUMNS } from '../src/domain/questionnaires/exportCsv';
import type { InstrumentCode } from '../src/domain/questionnaires/instruments';
import { computeScores, type Applicability, type Responses } from '../src/domain/questionnaires/scoring';

let seq = 0;
function admin(visit: string, code: InstrumentCode, responses: Responses, extra: Partial<QuestionnaireAdministration> = {}, applicability: Applicability = {}): QuestionnaireAdministration {
  seq += 1;
  return {
    id: `a${seq}`, visit_id: visit, instrument_code: code, instrument_version: code === 'EQ5D3L' ? 'EQ-5D-3L-ES-ES-v2.0-self' : 'v',
    status: 'completed', status_reason_code: null, status_reason_detail: null, administration_mode: 'self', data_source: 'paper',
    administration_date: '2026-01-10', responses, item_applicability: applicability, scores: computeScores(code, responses, applicability),
    scoring_version: 'coamo-q-1', revision: 1, last_correction_reason: null, last_corrected_at: null, completed_at: null,
    created_at: '', updated_at: '', ...extra,
  };
}
const iex = (value: number) => Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`q${i + 1}`, value]));

describe('comparación V0–VF', () => {
  it('IEXPAC: Δ = VF − V0 solo con ambos completos', () => {
    const c = compareInstrument('IEXPAC', admin('v0', 'IEXPAC', iex(3)), admin('vf', 'IEXPAC', iex(5)));
    expect(c.paired).toBe(true);
    expect(c.metrics.find((m) => m.key === 'global')).toMatchObject({ v0: 5, vf: 10, delta: 5 });
    expect(c.items[0]).toMatchObject({ v0: 3, vf: 5, change: 'better' });
  });
  it('IEXPAC: Δ negativo se conserva con signo (VF peor que V0)', () => {
    const c = compareInstrument('IEXPAC', admin('v0', 'IEXPAC', iex(5)), admin('vf', 'IEXPAC', iex(4)));
    expect(c.metrics[0].delta).toBe(-2.5);
  });
  it('IEXPAC incompleto: sin Δ y con aviso', () => {
    const partial = iex(5);
    delete partial.q3;
    const c = compareInstrument('IEXPAC', admin('v0', 'IEXPAC', partial), admin('vf', 'IEXPAC', iex(5)));
    expect(c.paired).toBe(false);
    expect(c.metrics[0].delta).toBeNull();
    expect(c.warnings.join(' ')).toMatch(/incompleto/);
  });
  it('un borrador en curso no se usa para comparar', () => {
    const c = compareInstrument('IEXPAC', admin('v0', 'IEXPAC', iex(5), { status: 'in_progress' }), admin('vf', 'IEXPAC', iex(5)));
    expect(c.metrics[0].delta).toBeNull();
    expect(c.warnings.join(' ')).toMatch(/en curso/);
  });
  it('EQ-5D: dirección invertida en dimensiones (nivel menor = mejor) y Δ EVA', () => {
    const r0 = { mobility: 2, self_care: 1, usual_activities: 2, pain_discomfort: 3, anxiety_depression: 1, vas: 50 };
    const rf = { mobility: 1, self_care: 1, usual_activities: 3, pain_discomfort: 2, anxiety_depression: 1, vas: 65 };
    const c = compareInstrument('EQ5D3L', admin('v0', 'EQ5D3L', r0), admin('vf', 'EQ5D3L', rf, { administration_mode: 'interviewer', instrument_version: 'EQ-5D-3L-ES-ES-v1.0-interviewer' }));
    expect(c.items.map((i) => i.change)).toEqual(['better', 'same', 'worse', 'better', 'same']);
    expect(c.metrics[0]).toMatchObject({ v0: 50, vf: 65, delta: 15 });
    expect(c.warnings.join(' ')).toMatch(/Modalidad distinta/);
    expect(c.warnings.join(' ')).toMatch(/Versión distinta/);
    expect(c.warnings.join(' ')).toMatch(/utilidad no calculado/);
  });
  it('VERITAS-PRN: sin dirección del cambio (clave no documentada)', () => {
    const c = compareInstrument('VERITAS_PRN', admin('v0', 'VERITAS_PRN', { q1: 1 }), admin('vf', 'VERITAS_PRN', { q1: 5 }));
    expect(c.items[0]).toMatchObject({ v0: 1, vf: 5, change: null });
    expect(c.metrics).toHaveLength(0);
  });
  it('VERITAS-Pro: no disponible', () => {
    expect(compareInstrument('VERITAS_PRO', null, null).warnings[0]).toMatch(/No se ha aportado/);
  });
  it('dirección ordinal', () => {
    expect(ordinalChange(2, 2, true)).toBe('same');
    expect(ordinalChange(null, 2, true)).toBeNull();
    expect(ordinalChange(2, 1, false)).toBe('better');
  });
});

describe('exportación CSV', () => {
  const patients = [
    { id: 'p1', study_code: 'COAMO-1-0001', center_code: 'LAFE', diagnosis: 'HA', status: 'completed' },
    { id: 'p2', study_code: 'COAMO-1-0002', center_code: 'LAFE', diagnosis: 'HB', status: 'included' },
    { id: 'p3', study_code: 'COAMO-1-0003', center_code: 'LAFE', diagnosis: 'HB', status: 'screening' },
  ];
  const visits = [
    { id: 'v0', patient_id: 'p1', visit_type: 'baseline', visit_date: '2026-01-10', status: 'completed' },
    { id: 'vf', patient_id: 'p1', visit_type: 'final', visit_date: '2027-01-12', status: 'completed' },
    { id: 'v0b', patient_id: 'p2', visit_type: 'baseline', visit_date: '2026-02-01', status: 'completed' },
  ];
  const admins = [
    admin('v0', 'IEXPAC', { ...iex(3), q12: 2 }, {}, { q12: true, q13: false }),
    admin('vf', 'IEXPAC', iex(4), { administration_mode: 'assisted' }),
    admin('v0', 'VERITAS_PRO', {}, { status: 'not_applicable', status_reason_code: 'source_document_unavailable', status_reason_detail: 'texto libre' }),
    admin('v0b', 'EQ5D3L', { mobility: 1, vas: 0 }, { status: 'in_progress' }),
  ];
  const bundle = buildExport(patients, visits, admins);

  it('una fila por paciente incluido y visita V0/VF, aunque falte la final', () => {
    expect(bundle.wide.map((r) => `${r.study_code}/${r.visit}/${r.visit_registered}`))
      .toEqual(['COAMO-1-0001/V0/1', 'COAMO-1-0001/VF/1', 'COAMO-1-0002/V0/1', 'COAMO-1-0002/VF/0']);
  });
  it('respuestas, condicionados, derivados y estados', () => {
    const r = bundle.wide[0];
    expect(r).toMatchObject({ iexpac_status: 'completed', iexpac_q1: 3, iexpac_q12_applies: 1, iexpac_q13_applies: 0, iexpac_q12: 2, iexpac_sum: 33, iexpac_global: 5 });
    expect(r.iexpac_q14_applies).toBeNull();
    expect(r).toMatchObject({ vpro_status: 'not_applicable', vpro_reason: 'source_document_unavailable' });
    expect(Object.values(r)).not.toContain('texto libre');
    expect(bundle.wide[2]).toMatchObject({ eq5d_status: 'in_progress', eq5d_vas: 0, eq5d_mobility: 1, eq5d_self_care: null, eq5d_profile: null });
  });
  it('emparejado IEXPAC: Δ y cambio de modalidad', () => {
    expect(bundle.paired[0]).toMatchObject({ iexpac_v0_global: 5, iexpac_vf_global: 7.5, iexpac_delta: 2.5, iexpac_paired: 1, iexpac_mode_changed: 1 });
    expect(bundle.paired[1]).toMatchObject({ iexpac_paired: 0, iexpac_delta: null, iexpac_mode_changed: null });
  });
  it('columnas estables, únicas y documentadas en el diccionario', () => {
    const names = WIDE_COLUMNS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.slice(0, 8)).toEqual(['study_code', 'center_code', 'diagnosis', 'patient_status', 'visit', 'visit_registered', 'visit_date', 'visit_status']);
    expect(names.filter((n) => /^iexpac_q\d+$/.test(n))).toHaveLength(15);
    expect(names.filter((n) => /^vprn_q\d+$/.test(n))).toHaveLength(24);
    expect(names).not.toContain('eq5d_utility');
    const dict = dictionaryCsv('standard');
    for (const n of [...names, ...PAIRED_COLUMNS.map((c) => c.name)]) expect(dict).toContain(`,${n},`);
  });
  it('formato estándar (R/SPSS) y Excel España; ausentes vacíos', () => {
    const [wide] = exportFiles(bundle, 'standard');
    const header = wide.content.split('\r\n')[0];
    expect(header.startsWith('study_code,center_code')).toBe(true);
    expect(wide.content.charCodeAt(0)).not.toBe(0xfeff);
    const excel = exportFiles(bundle, 'excel_es')[1].content;
    expect(excel.charCodeAt(0)).toBe(0xfeff);
    expect(excel).toContain(';7,5;');
    expect(toCsv(['a', 'b'], [{ a: null, b: 0 }], 'standard')).toBe('a,b\r\n,0\r\n');
  });
  it('neutraliza fórmulas en texto y escapa separadores, sin alterar números negativos', () => {
    expect(formatCell('=HYPERLINK("x")', 'standard')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(formatCell('a;b', 'excel_es')).toBe('"a;b"');
    expect(formatCell(-2.5, 'standard')).toBe('-2.5');
    expect(formatCell(-2.5, 'excel_es')).toBe('-2,5');
  });
});

describe('cuadro de mando de cumplimiento', () => {
  const patients = [{ id: 'p1', center_id: 'c1' }, { id: 'p2', center_id: 'c2' }];
  const visits = [
    { id: 'v0', patient_id: 'p1', visit_type: 'baseline', status: 'completed' },
    { id: 'vf', patient_id: 'p1', visit_type: 'final', status: 'completed' },
    { id: 'w0', patient_id: 'p2', visit_type: 'baseline', status: 'completed' },
    { id: 'wf', patient_id: 'p2', visit_type: 'final', status: 'cancelled' },
  ];
  const full = (visit: string) => [
    admin(visit, 'IEXPAC', iex(4)), admin(visit, 'EQ5D3L', { mobility: 1 }), admin(visit, 'EVASAF', { q1: 1 }),
    admin(visit, 'VERITAS_PRN', { q1: 1 }), admin(visit, 'VERITAS_PRO', {}, { status: 'not_applicable', status_reason_code: 'source_document_unavailable' }),
  ];
  const admins = [...full('v0'), ...full('vf'), admin('w0', 'IEXPAC', iex(4), { status: 'not_done', responses: {} })];
  const { total, byCenter } = questionnaireCompletion(patients, visits, admins);

  it('V0/VF completas, pendientes, emparejados y porcentaje', () => {
    expect(total).toMatchObject({ patientsWithV0: 2, patientsWithV0Complete: 1, patientsWithVF: 1, patientsWithVFComplete: 1, pairedIexpac: 1, pairedAny: 1, notDone: 1 });
    expect(total.pendingByVisit).toEqual({ V0: 4, VF: 0 });
    // Esperados: 4 + 4 (p1) + 5 (p2 V0) = 13; completados 8.
    expect(total.expected).toBe(13);
    expect(total.completed).toBe(8);
    expect(completionPercentage(total)).toBe(61.5);
  });
  it('por centro solo con los datos recibidos (filtrados por RLS)', () => {
    expect(Object.keys(byCenter).sort()).toEqual(['c1', 'c2']);
    expect(byCenter.c2.patientsWithVF).toBe(0);
  });
  it('sin datos no hay porcentaje (no 0 %)', () => {
    expect(completionPercentage(questionnaireCompletion([], [], []).total)).toBeNull();
  });
});
