import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import {
  DIMENSION_LABEL, PRIORITY_1_CUTOFF, PRIORITY_2_CUTOFF, STRATIFICATION_MODEL_VERSION, applicableVariables, computeStratification,
  finalPriority, followUpFor, suggestFromClinical, type ClinicalSnapshot, type Dimension, type Priority, type StratAnswers, type Suggestion,
} from '../domain/stratification';
import { DIAGNOSIS_LABEL, VISIT_TYPE_LABEL, formatDate } from '../domain/study';
import { getClinicalAssessment, getPatient, getVisit, listVisits, type Patient, type Visit } from '../services/patientService';

const DIMENSIONS: Dimension[] = ['demographic', 'clinical', 'treatment', 'social'];

export function StratificationPage() {
  const { visitId = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visit, setVisit] = useState<Visit | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [clinicalFrom, setClinicalFrom] = useState<Visit | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({});
  const [answers, setAnswers] = useState<StratAnswers>({});
  const [raisedTo, setRaisedTo] = useState<Priority | null>(null);
  const [raiseReason, setRaiseReason] = useState('');

  useEffect(() => {
    void (async () => {
      const v = await getVisit(visitId);
      if (v.error || !v.data) {
        setError(v.error ?? 'Visita no encontrada o sin acceso.');
        setLoading(false);
        return;
      }
      const [p, all] = await Promise.all([getPatient(v.data.patient_id), listVisits(v.data.patient_id)]);
      // Datos clínicos de esta visita o, si no tiene, del registro más reciente anterior (se indica la fecha).
      const candidates = (all.data ?? [])
        .filter((x) => x.status === 'completed' && (x.visit_type === 'baseline' || x.visit_type === 'final') && x.visit_date <= v.data!.visit_date)
        .sort((a, b) => (a.id === visitId ? -1 : b.id === visitId ? 1 : b.visit_date.localeCompare(a.visit_date)));
      let snapshot: ClinicalSnapshot | null = null;
      let from: Visit | null = null;
      for (const candidate of candidates) {
        const ca = await getClinicalAssessment(candidate.id);
        if (ca.data) { snapshot = ca.data; from = candidate; break; }
      }
      const s = suggestFromClinical(p.data?.age_at_inclusion ?? null, snapshot);
      setVisit(v.data);
      setPatient(p.data);
      setClinicalFrom(from);
      setSuggestions(s);
      setAnswers(Object.fromEntries(Object.entries(s).map(([k, sug]) => [k, sug.value])));
      setError(p.error ?? all.error);
      setLoading(false);
    })();
  }, [visitId]);

  const result = useMemo(() => (patient ? computeStratification(patient.diagnosis, answers) : null), [patient, answers]);

  if (loading) return <LoadingState label="Cargando datos para la estratificación..." />;
  if (error || !visit || !patient || !result) return <ErrorState title="No se pudieron cargar los datos" message={error ?? 'Sin datos.'} />;

  const variables = applicableVariables(patient.diagnosis);
  const final = finalPriority(result.modelPriority, raisedTo);
  const set = (id: string, value: string | null) => setAnswers((current) => ({ ...current, [id]: value }));

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={`${patient.study_code} · ${DIAGNOSIS_LABEL[patient.diagnosis]}`}
        title={`Estratificación CMO · ${VISIT_TYPE_LABEL[visit.visit_type]}`}
        description={`Visita del ${formatDate(visit.visit_date)}. Modelo SEFH de coagulopatías congénitas (${STRATIFICATION_MODEL_VERSION}): 23 variables, puntos de corte ${PRIORITY_2_CUTOFF} (Prioridad 2) y ${PRIORITY_1_CUTOFF} (Prioridad 1).`}
        actions={<Link className="button-link button-secondary" to={`/patients/${patient.id}`}>Volver a la ficha</Link>}
      />

      <Notice tone="warning" title="Cálculo no guardado">
        La base de datos aún no tiene la tabla de estratificaciones (migración pendiente en el repositorio canónico). Este cálculo
        sirve para revisar el modelo y no queda registrado; no se guarda nada en el navegador.
      </Notice>
      <Notice tone="info">
        {clinicalFrom
          ? <>Respuestas propuestas desde los datos clínicos de la {VISIT_TYPE_LABEL[clinicalFrom.visit_type].toLowerCase()} del {formatDate(clinicalFrom.visit_date)}{clinicalFrom.id !== visit.id ? ' (esta visita no tiene datos clínicos propios: verifique que siguen vigentes)' : ''}. Confírmelas o corríjalas.</>
          : <>No hay datos clínicos registrados hasta esta visita: responda todas las preguntas.</>}
        {' '}Las preguntas sin responder no cuentan como 0: el nivel solo se asigna cuando lo que falta no puede cambiarlo.
      </Notice>

      {DIMENSIONS.map((dimension) => {
        const vars = variables.filter((v) => v.dimension === dimension);
        const dim = result.byDimension[dimension];
        return (
          <section key={dimension} className="card" aria-labelledby={`dim-${dimension}`}>
            <h2 id={`dim-${dimension}`}>{DIMENSION_LABEL[dimension]} <span className="text-muted">· {dim.points} de {dim.max} puntos</span></h2>
            <div className="grid-2" style={{ marginTop: 'var(--sp-3)' }}>
              {vars.map((variable) => {
                const sug = suggestions[variable.id];
                const value = answers[variable.id] ?? null;
                const item = result.items.find((i) => i.variable.id === variable.id);
                return (
                  <fieldset key={variable.id} className="coamo-fieldset">
                    <legend>
                      {variable.question}
                      <span className="coamo-source">{variable.source}</span>
                    </legend>
                    {variable.hint ? <p className="coamo-field-hint">{variable.hint}</p> : null}
                    <div className="coamo-radio-row">
                      {variable.options.map((option) => (
                        <label key={option.value} className="radio-inline">
                          <input type="radio" name={`strat-${variable.id}`} checked={value === option.value} onChange={() => set(variable.id, option.value)} />
                          {option.label}{variable.exception ? '' : ` (${option.points})`}
                        </label>
                      ))}
                      <label className="radio-inline">
                        <input type="radio" name={`strat-${variable.id}`} checked={value === null} onChange={() => set(variable.id, null)} />
                        Sin responder
                      </label>
                    </div>
                    <p className="coamo-field-hint">
                      {item?.points === null || item?.points === undefined ? 'Sin responder' : `${item.points} punto(s)`}
                      {sug ? ` · Propuesta: ${variable.options.find((o) => o.value === sug.value)?.label} — ${sug.from}` : ''}
                      {sug && value !== sug.value ? ' · Difiere de la propuesta' : ''}
                    </p>
                  </fieldset>
                );
              })}
            </div>
          </section>
        );
      })}

      <section className="card" aria-labelledby="strat-result" aria-live="polite">
        <h2 id="strat-result">Resultado</h2>
        <p>
          Puntuación: <strong>{result.score ?? `${result.scoreMin}-${result.scoreMax} (incompleta)`}</strong>
          {' · '}Nivel según el modelo: <strong>{result.status === 'pediatric_model' ? 'no aplicable (modelo pediátrico)' : result.modelPriority ? `Prioridad ${result.modelPriority}` : 'sin determinar'}</strong>
          {result.basis === 'advanced_therapy' ? ' (excepción: terapia avanzada)' : ''}
        </p>
        {result.warnings.length > 0 ? <Notice tone="warning"><ul className="coamo-gap-list">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Notice> : null}

        {result.modelPriority && result.modelPriority > 1 ? (
          <div className="grid-2" style={{ marginTop: 'var(--sp-3)' }}>
            <label>
              Elevar el nivel por criterio profesional (M p. 19)
              <select value={raisedTo ?? ''} onChange={(e) => setRaisedTo(e.target.value ? (Number(e.target.value) as Priority) : null)}>
                <option value="">No elevar</option>
                {([1, 2] as Priority[]).filter((p) => p < result.modelPriority!).map((p) => <option key={p} value={p}>Prioridad {p}</option>)}
              </select>
            </label>
            {raisedTo ? (
              <label>
                Motivo (obligatorio)
                <input value={raiseReason} maxLength={300} onChange={(e) => setRaiseReason(e.target.value)} />
              </label>
            ) : null}
          </div>
        ) : null}
        {final.error ? <Notice tone="danger">{final.error}</Notice> : null}
        {final.raised && raiseReason.trim() === '' ? <Notice tone="warning">Indique el motivo de la elevación de nivel.</Notice> : null}

        {final.priority ? (
          <Notice tone="success" title={`Nivel asignado: Prioridad ${final.priority}${final.raised ? ` (elevado desde Prioridad ${result.modelPriority})` : ''}`}>
            Periodicidad de valoración: {followUpFor(final.priority)}. Las actuaciones de AF son acumulativas (M p. 18).
          </Notice>
        ) : null}
      </section>
    </div>
  );
}
