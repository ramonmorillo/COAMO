// Comparación V0–VF por instrumento. Reglas:
//   · Diferencia numérica solo para derivados continuos documentados (IEXPAC global y suma; EVA
//     EQ-5D) y solo con ambos completos. Δ = VF − V0.
//   · Ítems ordinales (dimensiones EQ-5D, EVASAF): solo dirección del cambio según el sentido
//     documentado de la escala; nunca se promedian ni se suman.
//   · VERITAS-PRN y VERITAS-Pro: sin dirección (clave de puntuación no documentada).
//   · Sin umbrales de mejoría/empeoramiento clínico.
//   · Cambio de modalidad o versión entre V0 y VF: se avisa expresamente.

import { INSTRUMENTS, instrumentItems, optionsFor, type InstrumentCode } from './instruments';
import { effectiveStatus, STATUS_LABEL, type AdministrationStatus, type QuestionnaireAdministration } from './administration';
import type { Eq5dScores, IexpacScores } from './scoring';

export type ItemChange = 'better' | 'worse' | 'same' | null;

export type ComparisonMetric = {
  key: string;
  label: string;
  v0: number | null;
  vf: number | null;
  delta: number | null;
  scale: string;
};

export type ComparisonItem = { code: string; label: string; v0: number | null; vf: number | null; v0Label: string; vfLabel: string; change: ItemChange };

export type InstrumentComparison = {
  code: InstrumentCode;
  v0Status: AdministrationStatus;
  vfStatus: AdministrationStatus;
  paired: boolean;
  metrics: ComparisonMetric[];
  items: ComparisonItem[];
  warnings: string[];
  directionNote: string;
};

export const CHANGE_LABEL: Record<Exclude<ItemChange, null>, string> = { better: 'Más favorable', worse: 'Menos favorable', same: 'Sin cambio' };

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function delta(v0: number | null, vf: number | null): number | null {
  return v0 === null || vf === null ? null : round4(vf - v0);
}

/** Dirección en ítems ordinales: higherIsBetter según el documento. */
export function ordinalChange(v0: number | null, vf: number | null, higherIsBetter: boolean): ItemChange {
  if (v0 === null || vf === null) return null;
  if (v0 === vf) return 'same';
  return (vf > v0) === higherIsBetter ? 'better' : 'worse';
}

function value(admin: QuestionnaireAdministration | null, item: string): number | null {
  if (!admin || admin.status === 'not_applicable' || admin.status === 'not_done') return null;
  const v = admin.responses?.[item];
  return Number.isInteger(v) ? v : null;
}

export function compareInstrument(
  code: InstrumentCode,
  v0: QuestionnaireAdministration | null,
  vf: QuestionnaireAdministration | null,
): InstrumentComparison {
  const def = INSTRUMENTS[code];
  const v0Status = effectiveStatus(v0);
  const vfStatus = effectiveStatus(vf);
  const warnings: string[] = [];
  const usable = (a: QuestionnaireAdministration | null) => a !== null && a.status === 'completed';

  if (!def.available) {
    return { code, v0Status, vfStatus, paired: false, metrics: [], items: [], warnings: [def.unavailableReason!], directionNote: def.directionNote };
  }
  for (const [label, admin] of [['V0', v0], ['VF', vf]] as const) {
    if (admin && admin.status !== 'completed') warnings.push(`${label}: ${STATUS_LABEL[admin.status].toLowerCase()} — no se usa para comparar.`);
    if (!admin) warnings.push(`${label}: pendiente.`);
  }
  if (usable(v0) && usable(vf)) {
    if (v0!.administration_mode !== vf!.administration_mode) {
      warnings.push(`Modalidad distinta en V0 y VF (${v0!.administration_mode ?? '—'} / ${vf!.administration_mode ?? '—'}): valore la comparabilidad antes de interpretar el cambio.`);
    }
    if (v0!.instrument_version !== vf!.instrument_version) {
      warnings.push(`Versión distinta del instrumento en V0 y VF (${v0!.instrument_version ?? '—'} / ${vf!.instrument_version ?? '—'}).`);
    }
    if (v0!.data_source && vf!.data_source && v0!.data_source !== vf!.data_source) {
      warnings.push('Origen del dato distinto (papel / electrónico) en V0 y VF.');
    }
  }

  const a0 = usable(v0) ? v0 : null;
  const af = usable(vf) ? vf : null;
  const metrics: ComparisonMetric[] = [];
  let paired = false;

  if (code === 'IEXPAC') {
    const s0 = a0?.scores as IexpacScores | undefined;
    const sf = af?.scores as IexpacScores | undefined;
    const g0 = s0?.complete ? s0.global_0_10 : null;
    const gf = sf?.complete ? sf.global_0_10 : null;
    paired = g0 !== null && gf !== null;
    if (a0 && !s0?.complete) warnings.push('V0 incompleto (faltan ítems 1-11): sin puntuación global.');
    if (af && !sf?.complete) warnings.push('VF incompleto (faltan ítems 1-11): sin puntuación global.');
    metrics.push({ key: 'global', label: 'IEXPAC global', v0: g0, vf: gf, delta: delta(g0, gf), scale: '0-10' });
    metrics.push({ key: 'sum', label: 'Suma ítems 1-11', v0: s0?.complete ? s0.sum : null, vf: sf?.complete ? sf.sum : null,
      delta: delta(s0?.complete ? s0.sum : null, sf?.complete ? sf.sum : null), scale: '11-55' });
  }
  if (code === 'EQ5D3L') {
    const s0 = a0?.scores as Eq5dScores | undefined;
    const sf = af?.scores as Eq5dScores | undefined;
    const vas0 = s0?.vas ?? null;
    const vasf = sf?.vas ?? null;
    metrics.push({ key: 'vas', label: 'EVA (EQ VAS)', v0: vas0, vf: vasf, delta: delta(vas0, vasf), scale: '0-100' });
    paired = (s0?.profile_complete === true && sf?.profile_complete === true) || (vas0 !== null && vasf !== null);
    if (a0 && !s0?.profile_complete) warnings.push('V0: perfil incompleto (falta alguna dimensión).');
    if (af && !sf?.profile_complete) warnings.push('VF: perfil incompleto (falta alguna dimensión).');
    warnings.push('Índice de utilidad no calculado: no hay tarifa de valoración aprobada.');
  }
  if (code === 'EVASAF' || code === 'VERITAS_PRN' || code === 'VERITAS_PRO') {
    paired = a0 !== null && af !== null;
  }

  const items: ComparisonItem[] = instrumentItems(code)
    .filter((item) => item.kind !== 'vas')
    .map((item) => {
      const x0 = value(a0, item.code);
      const xf = value(af, item.code);
      const options = optionsFor(code, item, null);
      const labelOf = (v: number | null) => (v === null ? '—' : options.find((o) => o.value === v)?.label ?? String(v));
      let change: ItemChange = null;
      if (code === 'IEXPAC' || code === 'EVASAF') change = ordinalChange(x0, xf, true);
      if (code === 'EQ5D3L') change = ordinalChange(x0, xf, false);
      return {
        code: item.code,
        label: item.number ? `${item.number}. ${item.title ?? item.text}` : item.title ?? item.text,
        v0: x0, vf: xf, v0Label: labelOf(x0), vfLabel: labelOf(xf), change,
      };
    });

  return { code, v0Status, vfStatus, paired, metrics, items, warnings, directionNote: def.directionNote };
}
