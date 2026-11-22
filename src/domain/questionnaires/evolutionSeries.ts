// Series temporales por instrumento para los gráficos de evolución (fase 7, 22/11/2026).
// Reglas:
//   · Un gráfico por instrumento, con su propia escala: nunca se mezclan escalas incompatibles en un eje.
//   · Eje temporal = fecha real de administración (o, si falta, la de la visita, indicándolo).
//   · Solo registros COMPLETADOS con valor: un dato ausente no se dibuja como punto ni se interpola; se lista aparte.
//   · La dirección (si mejorar es subir o bajar) se declara; no hay umbrales de relevancia clínica.

import type { QuestionnaireAdministration } from './administration';
import { INSTRUMENTS, type InstrumentCode } from './instruments';
import { evasafDescriptiveSum, type Responses } from './scoring';

export type SeriesSpec = {
  code: InstrumentCode;
  label: string;
  min: number;
  max: number;
  decimals: number;
  higherIsBetter: boolean;
  directionText: string;
  caveat?: string;
  value: (a: QuestionnaireAdministration) => number | null;
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const score = (key: string) => (a: QuestionnaireAdministration) => num((a.scores as Record<string, unknown> | null)?.[key]);

export const SERIES_SPECS: SeriesSpec[] = [
  { code: 'IEXPAC', label: 'IEXPAC global', min: 0, max: 10, decimals: 2, higherIsBetter: true, directionText: 'Mayor = experiencia más favorable', value: score('global_0_10') },
  { code: 'EQ5D3L', label: 'EQ-5D-3L EVA', min: 0, max: 100, decimals: 0, higherIsBetter: true, directionText: 'Mayor = mejor salud percibida', value: score('vas') },
  { code: 'EVASAF', label: 'EVASAF suma descriptiva', min: 10, max: 50, decimals: 0, higherIsBetter: true, directionText: 'Mayor = mejor atención farmacéutica percibida',
    caveat: 'Suma descriptiva, no validada; sin puntos de corte.', value: (a) => evasafDescriptiveSum(a.responses as Responses) },
  { code: 'VERITAS_PRN', label: 'VERITAS-PRN total', min: 24, max: 120, decimals: 0, higherIsBetter: false, directionText: 'Menor = mayor adherencia', value: score('total') },
  { code: 'VERITAS_PRO', label: 'VERITAS-Pro total', min: 24, max: 120, decimals: 0, higherIsBetter: false, directionText: 'Menor = mayor adherencia', value: score('total') },
];

export type VisitInfo = { id: string; visit_date: string; label: string };
export type SeriesPoint = { date: string; dateIsVisitDate: boolean; value: number; visitId: string; visitLabel: string; version: string | null };
export type MissingPoint = { visitId: string; visitLabel: string; date: string; reason: string };
export type InstrumentSeries = {
  spec: SeriesSpec;
  points: SeriesPoint[];
  missing: MissingPoint[];
  /** Cambio último − primero, solo con dos o más mediciones y la misma versión del instrumento. */
  change: { from: SeriesPoint; to: SeriesPoint; delta: number; favorable: boolean | null } | null;
  versionMismatch: boolean;
};

export function buildSeries(code: InstrumentCode, admins: QuestionnaireAdministration[], visits: VisitInfo[]): InstrumentSeries {
  const spec = SERIES_SPECS.find((s) => s.code === code)!;
  const points: SeriesPoint[] = [];
  const missing: MissingPoint[] = [];
  for (const visit of visits) {
    const a = admins.find((x) => x.visit_id === visit.id && x.instrument_code === code) ?? null;
    const value = a && a.status === 'completed' ? spec.value(a) : null;
    if (a && value !== null) {
      points.push({ date: a.administration_date ?? visit.visit_date, dateIsVisitDate: !a.administration_date, value, visitId: visit.id, visitLabel: visit.label, version: a.instrument_version });
    } else {
      const reason = !a ? 'Sin registro' : a.status === 'not_applicable' ? 'No aplicable' : a.status === 'not_done' ? 'No realizado'
        : a.status !== 'completed' ? 'En curso (no completado)' : 'Incompleto: sin puntuación (no se imputa)';
      missing.push({ visitId: visit.id, visitLabel: visit.label, date: visit.visit_date, reason });
    }
  }
  points.sort((x, y) => x.date.localeCompare(y.date));
  const versionMismatch = new Set(points.map((p) => p.version)).size > 1;
  let change: InstrumentSeries['change'] = null;
  if (points.length >= 2 && !versionMismatch) {
    const from = points[0];
    const to = points[points.length - 1];
    const delta = Math.round((to.value - from.value) * 10000) / 10000;
    change = { from, to, delta, favorable: delta === 0 ? null : (delta > 0) === spec.higherIsBetter };
  }
  return { spec, points, missing, change, versionMismatch };
}

export const instrumentName = (code: InstrumentCode) => INSTRUMENTS[code].shortName;
