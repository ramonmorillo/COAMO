import { describe, expect, it } from 'vitest';

import { categoricalRow, clinicalRows, numericRow, stratificationRows } from '../src/domain/longitudinal';

describe('resumen longitudinal V0–VF', () => {
  it('numérica: Δ solo con ambas observaciones; ausente no es cero', () => {
    expect(numericRow('g', 'x', 10, 7)).toMatchObject({ v0: '10', vf: '7', change: '−3' });
    expect(numericRow('g', 'x', null, 7)).toMatchObject({ v0: '—', change: 'No calculable (falta V0 o VF)' });
    expect(numericRow('g', 'x', 0, 0)).toMatchObject({ v0: '0', change: '±0' });
  });
  it('dirección solo cuando está documentada: VERITAS menor = mejor; clínica sin rótulo', () => {
    expect(numericRow('g', 'VERITAS', 56, 24, { higherIsBetter: false }).direction).toBe('better');
    expect(numericRow('g', 'IEXPAC', 5, 4.5, { decimals: 2, higherIsBetter: true })).toMatchObject({ change: '−0,50', direction: 'worse' });
    expect(numericRow('g', 'Peso', 80, 75).direction).toBeUndefined();
  });
  it('categórica: transición, nunca resta', () => {
    expect(categoricalRow('g', 'x', 'Moderada', 'Intensa').change).toBe('Moderada → Intensa');
    expect(categoricalRow('g', 'x', 'Sí', 'Sí').change).toBe('Sin cambio');
    expect(categoricalRow('g', 'x', null, 'Sí').change).toMatch(/No comparable/);
  });
  it('estratificación: sentido según el modelo (1 = máxima prioridad), sin hablar de mejoría', () => {
    const [p] = stratificationRows({ finalPriority: 1, score: 30, modelVersion: 'v2' }, { finalPriority: 3, score: 15, modelVersion: 'v2' });
    expect(p.change).toBe('Prioridad 1 → 3: menor nivel de prioridad asistencial');
    expect(p.change).not.toMatch(/mejor/i);
    expect(stratificationRows({ finalPriority: 2, score: 22, modelVersion: 'v2' }, null)[0].change).toMatch(/No comparable/);
    expect(stratificationRows({ finalPriority: 2, score: 22, modelVersion: 'v2' }, { finalPriority: 2, score: 25, modelVersion: 'v2' })[1].change).toBe('+3');
  });
  it('variables clínicas: omite las no registradas y los textos libres; sí/no y categóricas como transición', () => {
    const rows = clinicalRows(
      { weight_kg: 80, physical_activity: 'moderate', diabetes: false, target_joint_detail: 'rodilla', bmi: 26.1 },
      { weight_kg: 78.5, physical_activity: 'intense', diabetes: true, target_joint_detail: 'rodilla', bmi: 25.6 },
    );
    expect(rows.find((r) => r.variable === 'Peso (kg)')).toMatchObject({ change: '−1,50' });
    expect(rows.find((r) => r.variable.startsWith('Nivel de actividad'))!.change).toBe('Moderada → Intensa');
    expect(rows.find((r) => r.variable === 'Diabetes')?.change ?? rows.find((r) => /iabetes/.test(r.variable))!.change).toBe('No → Sí');
    expect(rows.some((r) => /localizaci|detalle/i.test(r.variable))).toBe(false);
    expect(rows[0]).toMatchObject({ variable: 'IMC (kg/m²)', change: '−0,5' });
    expect(clinicalRows(null, null)).toHaveLength(0);
  });
});
