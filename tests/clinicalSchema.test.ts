import { describe, expect, it } from 'vitest';

import {
  ALL_CLINICAL_FIELDS, buildClinicalPayload, dispensingPercentage, fieldApplies, preservedHistoricValues,
} from '../src/domain/clinicalSchema';

const field = (key: string) => ALL_CLINICAL_FIELDS.find((f) => f.key === key)!;

describe('esquema clínico', () => {
  it('cada variable aparece una sola vez y cita su página del protocolo', () => {
    const keys = ALL_CLINICAL_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(ALL_CLINICAL_FIELDS.every((f) => /^P pp?\. \d/.test(f.source))).toBe(true);
  });

  it('gravedad de hemofilia solo para HA/HB y tipo de EVW solo para EVW', () => {
    expect(fieldApplies(field('hemophilia_severity'), 'HA')).toBe(true);
    expect(fieldApplies(field('hemophilia_severity'), 'EVW')).toBe(false);
    expect(fieldApplies(field('vwd_type'), 'EVW')).toBe(true);
    expect(fieldApplies(field('vwd_type'), 'HB')).toBe(false);
  });
});

describe('buildClinicalPayload', () => {
  it('vacío = no registrado (null), nunca «No» ni cero', () => {
    const { payload, errors } = buildClinicalPayload({ diabetes: null, spontaneous_bleeds: '', education_level: '' }, 'HA');
    expect(errors).toEqual([]);
    expect(payload.diabetes).toBeNull();
    expect(payload.spontaneous_bleeds).toBeNull();
    expect(payload.education_level).toBeNull();
  });

  it('convierte números con coma decimal y respeta booleanos', () => {
    const { payload, errors } = buildClinicalPayload({ weight_kg: '80,5', height_m: '1,75', inhibitors: false, spontaneous_bleeds: '3' }, 'HA');
    expect(errors).toEqual([]);
    expect(payload).toMatchObject({ weight_kg: 80.5, height_m: 1.75, inhibitors: false, spontaneous_bleeds: 3 });
  });

  it('descarta campos que no aplican al diagnóstico', () => {
    const { payload } = buildClinicalPayload({ hemophilia_severity: 'severe', vwd_type: '3' }, 'EVW');
    expect(payload.hemophilia_severity).toBeNull();
    expect(payload.vwd_type).toBe('3');
  });

  it('rechaza valores imposibles en lugar de enviarlos', () => {
    const { errors } = buildClinicalPayload({ spontaneous_bleeds: '-1', traumatic_bleeds: '2.5', weight_kg: 'abc', joint_pain: 'muy fuerte' }, 'HB');
    expect(errors).toHaveLength(4);
  });

  it('detecta la altura escrita en centímetros', () => {
    expect(buildClinicalPayload({ height_m: '175' }, 'HA').errors).toContain('Altura: indíquela en metros (p. ej., 1,75).');
  });

  it('la localización de la articulación diana solo se envía si hay articulación diana', () => {
    expect(buildClinicalPayload({ target_joint_present: false, target_joint_detail: 'Rodilla' }, 'HA').payload.target_joint_detail).toBeNull();
    expect(buildClinicalPayload({ target_joint_present: true, target_joint_detail: ' Rodilla derecha ' }, 'HA').payload.target_joint_detail).toBe('Rodilla derecha');
  });
});

describe('dispensingPercentage (P p. 12)', () => {
  it('recogidas / previstas en %', () => {
    expect(dispensingPercentage(11, 12)).toBe(91.7);
  });
  it('sin dispensaciones previstas o con datos ausentes no hay porcentaje (no se asume 100 %)', () => {
    expect(dispensingPercentage(0, 0)).toBeNull();
    expect(dispensingPercentage(null, 12)).toBeNull();
  });
  it('no trunca valores por encima de 100 (se señalan para revisión)', () => {
    expect(dispensingPercentage(13, 12)).toBe(108.3);
  });
});

// ── Formulario condicional por diagnóstico (22/11/2026): ocultar ≠ borrar ──
const FIELDS = ALL_CLINICAL_FIELDS; const build = buildClinicalPayload; const applies = fieldApplies;

describe('variables específicas de hemofilia', () => {
  const HEMO_ONLY = ['hemophilic_arthropathy', 'target_joint_present', 'target_joint_detail', 'annualized_joint_bleeding_rate'];
  const f = (key: string) => FIELDS.find((x) => x.key === key)!;

  it('se ofrecen en HA y HB y no en EVW', () => {
    for (const key of HEMO_ONLY) {
      expect(applies(f(key), 'HA')).toBe(true);
      expect(applies(f(key), 'HB')).toBe(true);
      expect(applies(f(key), 'EVW')).toBe(false);
    }
    expect(applies(f('vwd_type'), 'EVW')).toBe(true);
    expect(applies(f('hemophilia_severity'), 'EVW')).toBe(false);
  });

  it('EVW: el guardado no envía esas columnas, de modo que un valor anterior NO se borra', () => {
    const historic = { hemophilic_arthropathy: true, target_joint_present: true, target_joint_detail: 'rodilla derecha', annualized_joint_bleeding_rate: 1.5, vwd_type: '3' };
    const { payload, errors } = build(historic, 'EVW');
    expect(errors).toEqual([]);
    for (const key of HEMO_ONLY) expect(key in payload).toBe(false);
    expect(payload.vwd_type).toBe('3');
    expect(preservedHistoricValues(historic, 'EVW').map((h) => h.field.key).sort()).toEqual([...HEMO_ONLY].sort());
  });

  it('HA: se siguen guardando con normalidad (y la localización depende de la articulación diana)', () => {
    const { payload } = build({ hemophilic_arthropathy: 'true', target_joint_present: false, target_joint_detail: 'codo', annualized_joint_bleeding_rate: '0,5' }, 'HA');
    expect(payload.hemophilic_arthropathy).toBe(true);
    expect(payload.target_joint_present).toBe(false);
    expect(payload.target_joint_detail).toBeNull();
    expect(payload.annualized_joint_bleeding_rate).toBe(0.5);
    expect(preservedHistoricValues({ hemophilic_arthropathy: true }, 'HA')).toEqual([]);
  });

  it('las variables de protocolo no se han retirado del formulario (pendiente del documento «DATOS CLÍNICOS»)', () => {
    for (const key of ['hemophilia_severity', 'spontaneous_bleeds', 'traumatic_bleeds', 'head_us_score', 'hjhs_score', 'inhibitors', 'joint_pain',
      'bleeding_severity_last_year', 'socioeconomic_status', 'family_support', 'functional_autonomy', 'disease_knowledge', 'hospital_access_difficulty',
      'treatment_regimen', 'treatment_type', 'dispensing_mode', 'regimen_changed_since_last_visit', 'infection_from_blood_products']) {
      expect(FIELDS.some((x) => x.key === key)).toBe(true);
    }
  });
});
