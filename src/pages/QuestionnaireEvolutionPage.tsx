import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import {
  DATA_SOURCE_LABEL, effectiveStatus, REASON_LABEL, STATUS_LABEL, STATUS_TONE, studyVisitOf, VISIT_LABEL,
  type QuestionnaireAdministration, type StudyVisit,
} from '../domain/questionnaires/administration';
import { CHANGE_LABEL, compareInstrument, type ComparisonMetric, type InstrumentComparison } from '../domain/questionnaires/comparison';
import { ADMINISTRATION_MODE_LABEL, INSTRUMENTS, INSTRUMENT_CODES, type InstrumentCode } from '../domain/questionnaires/instruments';
import { formatScore, isComplete } from '../domain/questionnaires/scoring';
import { DIAGNOSIS_LABEL, formatDate, todayIso } from '../domain/study';
import { listAdministrationsForVisits } from '../services/questionnaireService';
import { getPatient, listVisits, type Patient, type Visit } from '../services/patientService';

export function QuestionnaireEvolutionPage() {
  const { id = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [visits, setVisits] = useState<Partial<Record<StudyVisit, Visit>>>({});
  const [admins, setAdmins] = useState<QuestionnaireAdministration[]>([]);

  useEffect(() => {
    void (async () => {
      const [p, v] = await Promise.all([getPatient(id), listVisits(id)]);
      const study = v.data.filter((x) => (x.visit_type === 'baseline' || x.visit_type === 'final') && x.status !== 'cancelled');
      const a = await listAdministrationsForVisits(study.map((x) => x.id));
      const byMoment: Partial<Record<StudyVisit, Visit>> = {};
      for (const x of study) byMoment[studyVisitOf(x.visit_type)!] = x;
      setPatient(p.data);
      setVisits(byMoment);
      setAdmins(a.data);
      setError(p.error ?? v.error ?? a.error);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <LoadingState label="Cargando evolución..." />;
  if (error) return <ErrorState title="No se pudo cargar la evolución" message={error} />;
  if (!patient) return <ErrorState title="Paciente no encontrado" message="No existe o no tienes acceso a su centro." />;

  const find = (moment: StudyVisit, code: InstrumentCode) => {
    const visit = visits[moment];
    return visit ? admins.find((a) => a.visit_id === visit.id && a.instrument_code === code) ?? null : null;
  };
  const comparisons = INSTRUMENT_CODES.map((code) => ({ code, v0: find('V0', code), vf: find('VF', code), cmp: compareInstrument(code, find('V0', code), find('VF', code)) }));
  const pending = comparisons.flatMap(({ code, cmp }) =>
    (['V0', 'VF'] as const)
      .filter((m) => visits[m] && (m === 'V0' ? cmp.v0Status : cmp.vfStatus) !== 'completed' && (m === 'V0' ? cmp.v0Status : cmp.vfStatus) !== 'not_applicable')
      .map((m) => `${INSTRUMENTS[code].shortName} · ${m}: ${STATUS_LABEL[m === 'V0' ? cmp.v0Status : cmp.vfStatus]}`));
  const iexpac = comparisons[0].cmp.metrics.find((m) => m.key === 'global')!;
  const vas = comparisons[1].cmp.metrics.find((m) => m.key === 'vas')!;

  return (
    <div className="page-stack coamo-report">
      <PageHeader
        eyebrow={`${patient.study_code} · ${DIAGNOSIS_LABEL[patient.diagnosis]}`}
        title="Evolución de cuestionarios V0–VF"
        description={`V0: ${visits.V0 ? formatDate(visits.V0.visit_date) : 'sin registrar'} · VF: ${visits.VF ? formatDate(visits.VF.visit_date) : 'sin registrar'} · Resumen generado el ${formatDate(todayIso())}. Datos seudonimizados.`}
        actions={
          <>
            <button type="button" className="button-secondary coamo-no-print" onClick={() => window.print()}>Imprimir / guardar PDF</button>
            <Link className="button-link button-secondary coamo-no-print" to={`/patients/${patient.id}`}>Volver a la ficha</Link>
          </>
        }
      />

      <section className="card" aria-labelledby="evo-summary">
        <h2 id="evo-summary">Resumen</h2>
        <dl className="metric-grid metric-grid-3">
          <Metric label="IEXPAC global V0 (0-10)" value={formatScore(iexpac.v0)} />
          <Metric label="IEXPAC global VF (0-10)" value={formatScore(iexpac.vf)} />
          <Metric label="Δ IEXPAC (VF − V0)" value={iexpac.delta === null ? '—' : signed(iexpac.delta)}
            hint={iexpac.delta === null ? 'Requiere V0 y VF completos (11 ítems)' : 'Variable principal. Mayor = experiencia más favorable'} />
        </dl>
        {pending.length > 0 ? (
          <Notice tone="warning" title="Cuestionarios pendientes o no completados">
            <ul className="coamo-gap-list">{pending.map((p) => <li key={p}>{p}</li>)}</ul>
          </Notice>
        ) : <Notice tone="success">Sin cuestionarios pendientes en las visitas registradas.</Notice>}
        {!visits.VF ? <Notice tone="info">La visita final no está registrada: no hay comparación V0–VF todavía.</Notice> : null}
        <p className="coamo-field-hint" style={{ marginTop: 'var(--sp-3)' }}>
          Las diferencias son descriptivas (Δ = VF − V0) y solo se calculan con ambas mediciones completas. No se aplican umbrales de
          mejoría o empeoramiento: no están definidos para la interpretación individual.
        </p>
      </section>

      <section className="card" aria-labelledby="evo-charts">
        <h2 id="evo-charts">Comparación gráfica</h2>
        <div className="grid-2">
          <PairChart title="IEXPAC global" metric={iexpac} max={10} />
          <PairChart title="EQ-5D-3L · EVA" metric={vas} max={100} />
        </div>
        <p className="coamo-field-hint">Un gráfico por escala (unidades distintas). Los valores exactos figuran en las tablas de cada instrumento.</p>
      </section>

      {comparisons.map(({ code, v0, vf, cmp }) => (
        <InstrumentSection key={code} code={code} v0={v0} vf={vf} cmp={cmp} visitIds={{ V0: visits.V0?.id, VF: visits.VF?.id }} />
      ))}
    </div>
  );
}

function signed(value: number): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatScore(Math.abs(value))}`;
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="metric">
      <dt className="metric-label">{label}</dt>
      <dd className="metric-value">{value}</dd>
      {hint ? <dd className="metric-hint">{hint}</dd> : null}
    </div>
  );
}

/** Dos barras (V0, VF) de una misma escala, con etiqueta directa del valor. Ausente = sin barra. */
function PairChart({ title, metric, max }: { title: string; metric: ComparisonMetric; max: number }) {
  return (
    <figure className="coamo-pair-chart">
      <figcaption className="text-strong">{title} <span className="text-muted">(0-{max})</span></figcaption>
      <ul className="bar-list">
        {(['V0', 'VF'] as const).map((m) => {
          const value = m === 'V0' ? metric.v0 : metric.vf;
          return (
            <li key={m} title={`${title} ${m}: ${value === null ? 'sin dato' : formatScore(value)}`}>
              <span className="bar-list-label">{m}</span>
              <span className="bar-list-track">
                {value !== null ? <span className="bar-list-fill" style={{ width: `${Math.max((value / max) * 100, 1)}%` }} /> : null}
              </span>
              <span className="bar-list-value">{value === null ? '—' : formatScore(value, max === 100 ? 0 : 2)}</span>
            </li>
          );
        })}
      </ul>
      <p className="coamo-field-hint">{metric.delta === null ? 'Δ no calculable' : `Δ VF − V0: ${signed(metric.delta)}`}</p>
    </figure>
  );
}

function AdminFacts({ admin, moment, code, visitId }: { admin: QuestionnaireAdministration | null; moment: StudyVisit; code: InstrumentCode; visitId?: string }) {
  const status = effectiveStatus(admin);
  return (
    <div className="coamo-q-facts">
      <p className="text-strong">{VISIT_LABEL[moment]}</p>
      <StatusBadge tone={STATUS_TONE[status]} dot>{STATUS_LABEL[status]}</StatusBadge>
      {admin?.status === 'completed' ? (
        <span className="coamo-q-cell-detail">{isComplete(code, admin.scores) ? 'Resultado completo' : 'Resultado incompleto (ítems sin responder)'}</span>
      ) : null}
      {admin?.status_reason_code ? <span className="coamo-q-cell-detail">{REASON_LABEL[admin.status_reason_code]}</span> : null}
      <span className="coamo-q-cell-detail">Fecha: {formatDate(admin?.administration_date)}</span>
      <span className="coamo-q-cell-detail">Modalidad: {admin?.administration_mode ? ADMINISTRATION_MODE_LABEL[admin.administration_mode] : '—'}</span>
      <span className="coamo-q-cell-detail">Origen: {admin?.data_source ? DATA_SOURCE_LABEL[admin.data_source] : '—'}</span>
      <span className="coamo-q-cell-detail">Versión: {admin?.instrument_version ?? '—'}{admin && admin.last_corrected_at ? ' · corregido' : ''}</span>
      {visitId ? <Link className="coamo-no-print" to={`/visits/${visitId}/questionnaires/${code}`}>Abrir</Link> : null}
    </div>
  );
}

function InstrumentSection({ code, v0, vf, cmp, visitIds }: {
  code: InstrumentCode; v0: QuestionnaireAdministration | null; vf: QuestionnaireAdministration | null; cmp: InstrumentComparison;
  visitIds: Partial<Record<StudyVisit, string>>;
}) {
  const def = INSTRUMENTS[code];
  const showDirection = code !== 'VERITAS_PRN' && code !== 'VERITAS_PRO';
  return (
    <section className={`card coamo-break${def.primaryEndpoint ? ' coamo-q-primary-card' : ''}`} aria-labelledby={`evo-${code}`}>
      <h2 id={`evo-${code}`}>
        {def.shortName} {def.primaryEndpoint ? <span className="coamo-q-tag">Variable principal</span> : null}
      </h2>
      <p className="help-text">{def.construct} {cmp.directionNote}</p>
      <div className="grid-2">
        <AdminFacts admin={v0} moment="V0" code={code} visitId={visitIds.V0} />
        <AdminFacts admin={vf} moment="VF" code={code} visitId={visitIds.VF} />
      </div>
      {cmp.warnings.length > 0 ? (
        <Notice tone="warning"><ul className="coamo-gap-list">{cmp.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Notice>
      ) : null}
      {cmp.metrics.length > 0 ? (
        <div className="table-wrap" style={{ marginTop: 'var(--sp-3)' }}>
          <table>
            <caption className="visually-hidden">Resultados {def.shortName}</caption>
            <thead><tr><th scope="col">Resultado</th><th scope="col">Escala</th><th scope="col">V0</th><th scope="col">VF</th><th scope="col">Δ VF − V0</th></tr></thead>
            <tbody>
              {cmp.metrics.map((m) => (
                <tr key={m.key}>
                  <th scope="row">{m.label}</th>
                  <td>{m.scale}</td>
                  <td className="numeric">{formatScore(m.v0, m.key === 'global' ? 2 : 0)}</td>
                  <td className="numeric">{formatScore(m.vf, m.key === 'global' ? 2 : 0)}</td>
                  <td className="numeric">{m.delta === null ? '—' : signed(m.delta)}</td>
                </tr>
              ))}
              {code === 'EQ5D3L' ? (
                <tr>
                  <th scope="row">Perfil (5 dígitos)</th><td>11111-33333</td>
                  <td>{(v0?.status === 'completed' && (v0.scores as { profile?: string | null }).profile) || '—'}</td>
                  <td>{(vf?.status === 'completed' && (vf.scores as { profile?: string | null }).profile) || '—'}</td>
                  <td>No se resta (perfil categórico)</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
      {def.available ? (
        <details className="coamo-q-details" open>
          <summary>{code === 'EQ5D3L' ? 'Perfil por dimensiones' : 'Respuestas individuales'}</summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th scope="col">Ítem</th><th scope="col">V0</th><th scope="col">VF</th>{showDirection ? <th scope="col">Cambio</th> : null}</tr>
              </thead>
              <tbody>
                {cmp.items.map((item) => (
                  <tr key={item.code}>
                    <th scope="row" style={{ fontWeight: 500 }}>{item.label}</th>
                    <td>{item.v0Label}{item.v0 !== null && code !== 'EVASAF' ? <span className="text-muted"> ({item.v0})</span> : null}</td>
                    <td>{item.vfLabel}{item.vf !== null && code !== 'EVASAF' ? <span className="text-muted"> ({item.vf})</span> : null}</td>
                    {showDirection ? <td>{item.change ? CHANGE_LABEL[item.change] : '—'}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {code === 'IEXPAC' ? (
            <p className="coamo-field-hint">Ítems 12-15 condicionados: se muestran si se cumplió su condición; no entran en la puntuación global.</p>
          ) : null}
          {code === 'VERITAS_PRN' || code === 'VERITAS_PRO' ? (
            <p className="coamo-field-hint">Códigos de respuesta (1 = Siempre … 5 = Nunca). Sin dirección del cambio: la clave de puntuación no está documentada.</p>
          ) : null}
        </details>
      ) : null}
    </section>
  );
}
