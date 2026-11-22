// Gráfico de evolución de UN instrumento (una serie, su propia escala). Puntos solo en mediciones reales, con su
// valor; el segmento une mediciones consecutivas reales y no sugiere valores intermedios (sin suavizado ni relleno).
// Las visitas sin dato se marcan en el eje con un aspa hueca y se listan debajo. Tooltip nativo (title) por punto.

import type { InstrumentSeries } from '../../domain/questionnaires/evolutionSeries';
import { formatDate } from '../../domain/study';

const W = 520;
const H = 250;
const PAD = { left: 48, right: 16, top: 24, bottom: 52 };
/** Margen interior del eje temporal: las fechas de los extremos no quedan cortadas ni sobre el eje Y. */
const INSET = 62;

const fmt = (v: number, d: number) => v.toFixed(d).replace('.', ',');
const toDay = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

export function InstrumentTrendChart({ series }: { series: InstrumentSeries }) {
  const { spec, points, missing, change } = series;
  const dates = [...points.map((p) => p.date), ...missing.map((m) => m.date)].sort();
  const t0 = dates.length ? toDay(dates[0]) : 0;
  const t1 = dates.length ? toDay(dates[dates.length - 1]) : 1;
  const span = Math.max(t1 - t0, 1);
  const x = (iso: string) => (dates.length <= 1 ? (PAD.left + W - PAD.right) / 2 : PAD.left + INSET + ((toDay(iso) - t0) / span) * (W - PAD.left - PAD.right - 2 * INSET));
  const y = (v: number) => PAD.top + (1 - (v - spec.min) / (spec.max - spec.min)) * (H - PAD.top - PAD.bottom);
  const ticks = [spec.min, spec.min + (spec.max - spec.min) / 2, spec.max];
  const baseY = H - PAD.bottom;
  const summary = points.length === 0
    ? 'sin mediciones completas'
    : points.map((p) => `${p.visitLabel} (${formatDate(p.date)}): ${fmt(p.value, spec.decimals)}`).join('; ');

  return (
    <figure className="coamo-trend" data-instrument={spec.code}>
      <figcaption>
        <span className="text-strong">{spec.label}</span>{' '}
        <span className="text-muted">({spec.min}-{spec.max}) · {spec.higherIsBetter ? '↑' : '↓'} {spec.directionText}</span>
        {spec.caveat ? <span className="coamo-field-hint" style={{ display: 'block' }}>{spec.caveat}</span> : null}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${spec.label}: ${summary}`} className="coamo-trend-svg">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="coamo-trend-grid" />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" className="coamo-trend-axis">{fmt(t, Number.isInteger(t) ? 0 : 1)}</text>
          </g>
        ))}
        {points.length > 1 ? (
          <polyline className="coamo-trend-line" fill="none" points={points.map((p) => `${x(p.date)},${y(p.value)}`).join(' ')} />
        ) : null}
        {points.map((p) => (
          <g key={p.visitId}>
            <circle cx={x(p.date)} cy={y(p.value)} r={6} className="coamo-trend-point">
              <title>{`${p.visitLabel} · ${formatDate(p.date)}${p.dateIsVisitDate ? ' (fecha de la visita)' : ''}: ${fmt(p.value, spec.decimals)}${p.version ? ` · versión ${p.version}` : ''}`}</title>
            </circle>
            <text x={x(p.date)} y={y(p.value) - 10} textAnchor="middle" className="coamo-trend-value">{fmt(p.value, spec.decimals)}</text>
            <text x={x(p.date)} y={baseY + 20} textAnchor="middle" className="coamo-trend-axis">{formatDate(p.date)}</text>
            <text x={x(p.date)} y={baseY + 38} textAnchor="middle" className="coamo-trend-axis">{p.visitLabel}</text>
          </g>
        ))}
        {missing.map((m) => (
          <g key={m.visitId} className="coamo-trend-missing">
            <path d={`M${x(m.date) - 6},${baseY - 6} l12,12 m0,-12 l-12,12`} />
            <title>{`${m.visitLabel} · ${formatDate(m.date)}: sin dato (${m.reason})`}</title>
            <text x={x(m.date)} y={baseY + 20} textAnchor="middle" className="coamo-trend-axis">{formatDate(m.date)}</text>
            <text x={x(m.date)} y={baseY + 38} textAnchor="middle" className="coamo-trend-axis">{m.visitLabel} · sin dato</text>
          </g>
        ))}
      </svg>
      <p className="coamo-field-hint">
        {change
          ? <>Cambio {change.to.visitLabel} − {change.from.visitLabel}: <strong>{change.delta > 0 ? '+' : ''}{fmt(change.delta, spec.decimals)}</strong>
            {change.favorable === null ? ' (sin cambio)' : change.favorable ? ' (en sentido favorable)' : ' (en sentido desfavorable)'}. Sin umbral de relevancia clínica documentado.</>
          : series.versionMismatch ? 'Versiones distintas del instrumento: no se calcula el cambio.' : 'Cambio no calculable: se necesitan dos mediciones completas.'}
      </p>
      {missing.length > 0 ? (
        <ul className="coamo-field-hint">{missing.map((m) => <li key={m.visitId}>{m.visitLabel} ({formatDate(m.date)}): {m.reason}</li>)}</ul>
      ) : null}
    </figure>
  );
}
