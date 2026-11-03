// Resumen longitudinal individual V0–VF (Variable | V0 | VF | Cambio). Reglas:
//   · Numéricas: Δ = VF − V0 solo si ambas observaciones existen; el signo no se rotula como mejoría salvo
//     que la dirección de la escala esté documentada (IEXPAC, EVA, VERITAS). Variables clínicas: solo Δ.
//   · Categóricas y sí/no: transición «A → B» o «sin cambio»; nunca se resta.
//   · Estratificación CMO: prioridad 1 = mayor necesidad de atención (modelo SEFH v2.0). Se describe el
//     sentido del cambio de prioridad, no como mejoría clínica.
//   · Ausente ≠ cero: celda «—» y sin cambio calculado. Es un cambio individual: sin valores p.

import { CLINICAL_SECTIONS, type ClinicalValues } from './clinicalSchema';
import type { ItemChange } from './questionnaires/comparison';

export type LongitudinalRow = {
  group: string;
  variable: string;
  v0: string;
  vf: string;
  change: string;
  /** Sentido documentado del cambio, cuando existe. */
  direction?: ItemChange;
};

export type StrataPoint = { finalPriority: number | null; score: number | null; modelVersion: string | null } | null;

const fmt = (v: number | null | undefined, decimals = 0) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(decimals).replace('.', ',');
const signed = (v: number, decimals = 0) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(decimals).replace('.', ',')}`;

export function numericRow(group: string, variable: string, v0: number | null, vf: number | null, opts: { decimals?: number; higherIsBetter?: boolean } = {}): LongitudinalRow {
  const d = opts.decimals ?? 0;
  const both = v0 !== null && vf !== null;
  const delta = both ? Math.round((vf! - v0!) * 10 ** Math.max(d, 4)) / 10 ** Math.max(d, 4) : null;
  let direction: ItemChange | undefined;
  if (both && opts.higherIsBetter !== undefined) direction = delta === 0 ? 'same' : (delta! > 0) === opts.higherIsBetter ? 'better' : 'worse';
  return { group, variable, v0: fmt(v0, d), vf: fmt(vf, d), change: delta === null ? 'No calculable (falta V0 o VF)' : signed(delta, d), direction };
}

export function categoricalRow(group: string, variable: string, v0: string | null, vf: string | null): LongitudinalRow {
  const change = v0 === null || vf === null ? 'No comparable (falta V0 o VF)' : v0 === vf ? 'Sin cambio' : `${v0} → ${vf}`;
  return { group, variable, v0: v0 ?? '—', vf: vf ?? '—', change };
}

export function stratificationRows(v0: StrataPoint, vf: StrataPoint): LongitudinalRow[] {
  const p0 = v0?.finalPriority ?? null;
  const pf = vf?.finalPriority ?? null;
  let change = 'No comparable (estratificación no completada en V0 o VF)';
  if (p0 !== null && pf !== null) {
    change = p0 === pf ? `Sin cambio (prioridad ${p0})`
      : pf > p0 ? `Prioridad ${p0} → ${pf}: menor nivel de prioridad asistencial`
        : `Prioridad ${p0} → ${pf}: mayor nivel de prioridad asistencial`;
  }
  const rows: LongitudinalRow[] = [{ group: 'Estratificación CMO', variable: 'Prioridad asignada (1 = máxima)', v0: p0 ? `Prioridad ${p0}` : '—', vf: pf ? `Prioridad ${pf}` : '—', change }];
  rows.push(numericRow('Estratificación CMO', 'Puntuación CMO', v0?.score ?? null, vf?.score ?? null));
  if (v0?.modelVersion && vf?.modelVersion && v0.modelVersion !== vf.modelVersion) {
    rows[1].change += ` · versión del modelo distinta (${v0.modelVersion} / ${vf.modelVersion})`;
  }
  return rows;
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** Variables clínicas comparables del CRD (numéricas, categóricas y sí/no); se omiten textos libres. */
export function clinicalRows(v0: ClinicalValues | null, vf: ClinicalValues | null): LongitudinalRow[] {
  const rows: LongitudinalRow[] = [];
  for (const section of CLINICAL_SECTIONS) {
    for (const field of section.fields) {
      if (field.kind === 'text') continue;
      const a = v0?.[field.key];
      const b = vf?.[field.key];
      if ((a === null || a === undefined) && (b === null || b === undefined)) continue; // no registrado en ninguna: no aporta
      const label = 'unit' in field && field.unit ? `${field.label} (${field.unit})` : field.label;
      if (field.kind === 'integer' || field.kind === 'decimal') {
        rows.push(numericRow(section.title, label, num(a), num(b), { decimals: field.kind === 'decimal' ? 2 : 0 }));
      } else if (field.kind === 'boolean') {
        const yn = (x: unknown) => (x === true ? 'Sí' : x === false ? 'No' : null);
        rows.push(categoricalRow(section.title, label, yn(a), yn(b)));
      } else {
        const lab = (x: unknown) => (typeof x === 'string' ? field.options.find((o) => o.value === x)?.label ?? x : null);
        rows.push(categoricalRow(section.title, label, lab(a), lab(b)));
      }
    }
  }
  if (v0?.bmi !== undefined || vf?.bmi !== undefined) {
    rows.unshift(numericRow('Datos antropométricos', 'IMC (kg/m²)', num(v0?.bmi), num(vf?.bmi), { decimals: 1 }));
  }
  return rows;
}
