import { describe, expect, it } from 'vitest';

import { buildClinicalNote, EVOLUTION_MAX_LENGTH, validateEvolution } from '../src/domain/evolution';

describe('evolución farmacéutica: validación (espejo de la BD)', () => {
  it('vacío o solo espacios: no se guarda', () => {
    expect(validateEvolution('')).toHaveLength(1);
    expect(validateEvolution('   \n ')).toHaveLength(1);
  });
  it('límite de 8000 caracteres tras recortar', () => {
    expect(validateEvolution('x'.repeat(EVOLUTION_MAX_LENGTH))).toHaveLength(0);
    expect(validateEvolution(` ${'x'.repeat(EVOLUTION_MAX_LENGTH)} `)).toHaveLength(0);
    expect(validateEvolution('x'.repeat(EVOLUTION_MAX_LENGTH + 1))).toHaveLength(1);
  });
});

describe('texto para la historia clínica', () => {
  const base = { visitType: 'followup' as const, visitDate: '2026-11-03', modality: 'phone' as const, evolutionText: '  Buena tolerancia.\nSe revisa la técnica de administración.  ' };
  it('encabezado, fecha, visita, estratificación y valoración; sin identificadores', () => {
    const note = buildClinicalNote({ ...base, stratification: { finalPriority: 1, modelPriority: 2, score: 25, raised: true, modelVersion: 'SEFH-coag-v2.0' } });
    expect(note).toBe([
      'EVOLUCIÓN FARMACÉUTICA — Atención farmacéutica (estudio COAMO, modelo CMO)',
      'Fecha: 03/11/2026 · Visita de seguimiento · Telefónica',
      'Estratificación CMO: prioridad 1 (puntuación 25; elevada por criterio farmacéutico desde prioridad 2; SEFH-coag-v2.0).',
      '',
      'Valoración y evolución:',
      'Buena tolerancia.\nSe revisa la técnica de administración.',
    ].join('\n'));
    expect(note).not.toMatch(/COAMO-\d/);
  });
  it('sin estratificación completada en la visita: lo indica, no la inventa', () => {
    expect(buildClinicalNote({ ...base, stratification: null })).toContain('Estratificación CMO: no completada en esta visita.');
  });
  it('incluye solo las actuaciones realizadas que se le pasan, con ámbito y fecha', () => {
    const note = buildClinicalNote({ ...base, stratification: null, performedActions: [{ domainLabel: 'Coordinación con el equipo asistencial', text: 'Llamada a hematología', date: '2026-11-02' }] });
    expect(note.endsWith('Actuaciones farmacéuticas realizadas:\n- Coordinación con el equipo asistencial: Llamada a hematología (02/11/2026)')).toBe(true);
    expect(buildClinicalNote({ ...base, stratification: null, performedActions: [] })).not.toContain('Actuaciones farmacéuticas');
  });
  it('prioridad del modelo sin elevación ni puntuación', () => {
    expect(buildClinicalNote({ ...base, stratification: { finalPriority: 3, modelPriority: 3, score: null, raised: false, modelVersion: null } }))
      .toContain('Estratificación CMO: prioridad 3.');
  });
});
