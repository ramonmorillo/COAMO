import { describe, expect, it } from 'vitest';

import {
  ALL_CLINICAL_FIELDS, buildClinicalPayload, dispensingPercentage, fieldApplies,
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
