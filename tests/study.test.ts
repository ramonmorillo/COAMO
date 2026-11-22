import { describe, expect, it } from 'vitest';

import { daysBetween, formatDate, inclusionGaps, type InclusionRecord } from '../src/domain/study';
import { STRAT_VARIABLES } from '../src/domain/stratification';

const complete: InclusionRecord = {
  inc_age_18: true,
  inc_diagnosis: true,
  inc_written_consent: true,
  inc_no_limiting_condition: true,
  inc_hospital_pharmacy_followup: true,
  exc_unable_without_support: false,
  exc_unable_visits: false,
  exc_interfering_trial: false,
  questionnaire_support: 'family_or_caregiver',
  consent_date: '2026-10-01',
  consent_version: 'v1.0',
  verified_in_clinical_record: true,
};
const adult = { age_at_inclusion: 40, sex: 'male' };

describe('inclusionGaps (protocolo p. 9; misma regla que la base de datos)', () => {
  it('todos los criterios cumplidos y consentimiento con fecha → incluible, aunque haya apoyo en cuestionarios', () => {
    expect(inclusionGaps(complete, adult)).toEqual([]);
  });

  it('un criterio de inclusión sin confirmar bloquea', () => {
    expect(inclusionGaps({ ...complete, inc_hospital_pharmacy_followup: null }, adult)).toHaveLength(1);
  });

  it('un criterio de exclusión presente o sin evaluar bloquea', () => {
    expect(inclusionGaps({ ...complete, exc_interfering_trial: true }, adult)[0]).toMatch(/exclusión presente/);
    expect(inclusionGaps({ ...complete, exc_unable_visits: null }, adult)[0]).toMatch(/sin evaluar/);
  });

  it('sin fecha de consentimiento, menor de 18 o sin sexo no se incluye', () => {
    expect(inclusionGaps({ ...complete, consent_date: null }, adult)).toEqual(['Falta la fecha del consentimiento escrito.']);
    expect(inclusionGaps(complete, { age_at_inclusion: 17, sex: 'female' })).toEqual(['El paciente es menor de 18 años.']);
    expect(inclusionGaps(complete, { age_at_inclusion: 40, sex: null })).toEqual(['Falta el sexo del paciente.']);
  });
});

describe('fechas', () => {
  it('formatea ISO a dd/mm/aaaa sin desplazamiento de zona horaria', () => {
    expect(formatDate('2026-10-07')).toBe('07/10/2026');
    expect(formatDate(null)).toBe('—');
  });
  it('cuenta días entre fechas, incluido el cambio de año', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2027-02-01', '2026-02-01')).toBe(-365);
  });
});

// ── Fase 2: elegibilidad por edad y transición (protocolo p. 9; HIP/CI solo de adultos v2 25/09/2026) ──
// El protocolo aprobado incluye solo pacientes ≥ 18 años; no prevé menores en transición ni un consentimiento de
// menores. La transición pediátrico-adulto es una VARIABLE del modelo CMO para pacientes ya incluidos (≥ 18 años),
// no una vía de inclusión. Misma regla en la BD: coag_private.inclusion_ready exige age_at_inclusion >= 18.


describe('escenarios de elegibilidad (fase 2)', () => {
  it('adulto elegible: incluible', () => {
    expect(inclusionGaps(complete, { age_at_inclusion: 18, sex: 'female' })).toEqual([]);
  });
  it('adulto no elegible (criterio de exclusión presente): no incluible, con motivo explícito', () => {
    const gaps = inclusionGaps({ ...complete, exc_unable_without_support: true }, { age_at_inclusion: 45, sex: 'male' });
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatch(/Criterio de exclusión presente/);
  });
  it('menor «en transición»: el protocolo no lo autoriza → no incluible aunque el resto se cumpla', () => {
    const gaps = inclusionGaps(complete, { age_at_inclusion: 17, sex: 'male' });
    expect(gaps).toEqual(['El paciente es menor de 18 años.']);
  });
  it('menor excluido: además el criterio «Edad ≥ 18» no puede darse por cumplido', () => {
    const gaps = inclusionGaps({ ...complete, inc_age_18: false }, { age_at_inclusion: 12, sex: 'female' });
    expect(gaps).toContain('El paciente es menor de 18 años.');
    expect(gaps.some((g) => /Edad ≥ 18 años/.test(g))).toBe(true);
  });
  it('la transición es una variable del modelo para incluidos (≥ 18), sin efecto en la elegibilidad', () => {
    const t = STRAT_VARIABLES.find((v) => v.id === 'transition')!;
    expect(t.hint).toMatch(/No modifica la elegibilidad/);
    expect(t.options.find((o) => o.value === 'yes')!.points).toBe(4);
  });
});
