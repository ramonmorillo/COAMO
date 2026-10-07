import { describe, expect, it } from 'vitest';

import { daysBetween, formatDate, inclusionGaps, type InclusionRecord } from '../src/domain/study';

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
