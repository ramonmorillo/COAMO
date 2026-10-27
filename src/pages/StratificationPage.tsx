import { useEffect, useMemo, useState } from 'react';
import { Link, useBlocker, useParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { listAdministrationsForVisits } from '../services/questionnaireService';
import {
  DIMENSION_LABEL, PRIORITY_1_CUTOFF, PRIORITY_2_CUTOFF, STRATIFICATION_MODEL_VERSION, applicableVariables, computeStratification,
  contextNotes, finalPriority, followUpFor, suggestFromClinical,
  type ClinicalSnapshot, type Dimension, type Eq5dContext, type Priority, type StratAnswers, type Suggestion,
} from '../domain/stratification';
import { DIAGNOSIS_LABEL, VISIT_TYPE_LABEL, formatDate } from '../domain/study';
import { getClinicalAssessment, getPatient, getVisit, listVisits, type Patient, type Visit } from '../services/patientService';
import {
  buildStratificationPayload, createStratification, getStratification, updateStratification, type StratificationRecord,
} from '../services/stratificationService';

const DIMENSIONS: Dimension[] = ['demographic', 'clinical', 'treatment', 'social'];

type Draft = { answers: StratAnswers; raisedTo: Priority | null; raisedReason: string; restratReason: string };

const draftFrom = (record: StratificationRecord): Draft => ({
  answers: record.answers ?? {},
  raisedTo: record.raised_priority,
  raisedReason: record.raised_reason ?? '',
  restratReason: record.restratification_reason ?? '',
});

export function StratificationPage() {
  const { visitId = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visit, setVisit] = useState<Visit | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [clinicalFrom, setClinicalFrom] = useState<Visit | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [record, setRecord] = useState<StratificationRecord | null>(null);
  const [draft, setDraft] = useState<Draft>({ answers: {}, raisedTo: null, raisedReason: '', restratReason: '' });
  const [dirty, setDirty] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger' | 'warning'; text: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const v = await getVisit(visitId);
      if (v.error || !v.data) {
        setError(v.error ?? 'Visita no encontrada o sin acceso.');
        setLoading(false);
        return;
      }
      const [p, all, existing] = await Promise.all([getPatient(v.data.patient_id), listVisits(v.data.patient_id), getStratification(visitId)]);
      // Datos clínicos de esta visita o, si no tiene, del registro V0/VF más reciente anterior (se indica la fecha).
      const studyVisits = (all.data ?? [])
        .filter((x) => x.status === 'completed' && (x.visit_type === 'baseline' || x.visit_type === 'final') && x.visit_date <= v.data!.visit_date)
        .sort((a, b) => (a.id === visitId ? -1 : b.id === visitId ? 1 : b.visit_date.localeCompare(a.visit_date)));
      let snapshot: ClinicalSnapshot | null = null;
      let from: Visit | null = null;
      for (const candidate of studyVisits) {
        const ca = await getClinicalAssessment(candidate.id);
        if (ca.data) { snapshot = ca.data; from = candidate; break; }
      }
      // EQ-5D-3L completado más reciente hasta esta visita (apoyo al juicio de «baja calidad de vida»).
      const admins = await listAdministrationsForVisits(studyVisits.map((x) => x.id));
      const eqAdmin = admins.data
        .filter((a) => a.instrument_code === 'EQ5D3L' && a.status === 'completed')
        .sort((a, b) => (b.administration_date ?? '').localeCompare(a.administration_date ?? ''))[0];
      const eq5d: Eq5dContext = eqAdmin
        ? { date: eqAdmin.administration_date, profile: (eqAdmin.scores as { profile?: string | null }).profile ?? null, vas: (eqAdmin.scores as { vas?: number | null }).vas ?? null }
        : null;
      const s = suggestFromClinical(p.data?.age_at_inclusion ?? null, snapshot);
      setVisit(v.data);
      setPatient(p.data);
      setClinicalFrom(from);
      setSuggestions(s);
      setNotes(contextNotes(snapshot, eq5d));
      setRecord(existing.data);
      setDraft(existing.data ? draftFrom(existing.data) : { answers: Object.fromEntries(Object.entries(s).map(([k, sug]) => [k, sug.value])), raisedTo: null, raisedReason: '', restratReason: '' });
      setError(p.error ?? all.error ?? existing.error);
      setLoading(false);
    })();
  }, [visitId]);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm('Hay cambios sin guardar en la estratificación. ¿Salir y descartarlos?')) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const result = useMemo(() => (patient ? computeStratification(patient.diagnosis, draft.answers) : null), [patient, draft.answers]);

  if (loading) return <LoadingState label="Cargando datos para la estratificación..." />;
  if (error || !visit || !patient || !result) return <ErrorState title="No se pudieron cargar los datos" message={error ?? 'Sin datos.'} />;

  const isBaseline = visit.visit_type === 'baseline';
  const locked = record?.status === 'completed' && !correcting;
  const variables = applicableVariables(patient.diagnosis);
  const final = finalPriority(result.modelPriority, draft.raisedTo);
  const update = (changes: Partial<Draft>) => { setDraft((d) => ({ ...d, ...changes })); setDirty(true); setMessage(null); };
  const setAnswer = (id: string, value: string | null) => update({ answers: { ...draft.answers, [id]: value } });

  const confirmBlockers: string[] = [];
  if (result.modelPriority === null) confirmBlockers.push('El nivel del modelo no está determinado: complete las preguntas que pueden cambiarlo.');
  if (final.error) confirmBlockers.push(final.error);
  if (draft.raisedTo && draft.raisedReason.trim().length < 5) confirmBlockers.push('Indique el motivo de la elevación de nivel (mínimo 5 caracteres).');
  if (!isBaseline && draft.restratReason.trim().length < 5) confirmBlockers.push('Indique el motivo de la reestratificación (mínimo 5 caracteres).');
  const needsCorrection = record?.status === 'completed';
  const correctionMissing = needsCorrection && correctionReason.trim().length < 5;

  const save = async (status: 'in_progress' | 'completed') => {
    setSaving(true);
    setMessage(null);
    const payload = buildStratificationPayload({
      status,
      answers: draft.answers,
      suggestions,
      clinical_source_visit_id: clinicalFrom?.id ?? null,
      raised_priority: draft.raisedTo,
      raised_reason: draft.raisedReason,
      restratification_reason: draft.restratReason,
    }, isBaseline);
    const saved = record
      ? await updateStratification(record, payload, needsCorrection ? correctionReason.trim() : null)
      : await createStratification(visit.id, payload);
    setSaving(false);
    if (saved.error || !saved.data) {
      setMessage({ tone: 'danger', text: saved.error ?? 'No se pudo guardar.' });
      return;
    }
    setRecord(saved.data);
    setDraft(draftFrom(saved.data));
    setDirty(false);
    setCorrecting(false);
    setCorrectionReason('');
    // La BD recalcula: cualquier discrepancia con el cálculo en pantalla se señala (espejo TS ↔ SQL).
    const mismatch = saved.data.model_priority !== result.modelPriority || saved.data.score_min !== result.scoreMin || saved.data.score_max !== result.scoreMax;
    setMessage(mismatch
      ? { tone: 'warning', text: `Guardado, pero el cálculo de la base de datos (Prioridad ${saved.data.model_priority ?? '—'}, ${saved.data.score_min}-${saved.data.score_max}) difiere del de pantalla. Comuníquelo al equipo técnico.` }
      : { tone: 'success', text: status === 'completed' ? `Estratificación confirmada: Prioridad ${saved.data.final_priority}.` : 'Borrador guardado.' });
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={`${patient.study_code} · ${DIAGNOSIS_LABEL[patient.diagnosis]}`}
        title={`Estratificación CMO · ${VISIT_TYPE_LABEL[visit.visit_type]}`}
        description={`Visita del ${formatDate(visit.visit_date)}. Modelo SEFH de coagulopatías congénitas (${STRATIFICATION_MODEL_VERSION}): 23 variables, puntos de corte ${PRIORITY_2_CUTOFF} (Prioridad 2) y ${PRIORITY_1_CUTOFF} (Prioridad 1).`}
        actions={<Link className="button-link button-secondary" to={`/patients/${patient.id}`}>Volver a la ficha</Link>}
      />

      <Notice tone="info">
        {isBaseline
          ? <>Estratificación <strong>basal</strong>: define la prioridad del análisis del estudio.</>
          : <>Reestratificación: se registra aparte y no sustituye a la basal; al confirmarla se pide el motivo.</>}
        {' '}
        {clinicalFrom
          ? <>Respuestas propuestas desde los datos clínicos de la {VISIT_TYPE_LABEL[clinicalFrom.visit_type].toLowerCase()} del {formatDate(clinicalFrom.visit_date)}{clinicalFrom.id !== visit.id ? ' (esta visita no tiene datos clínicos propios: verifique que siguen vigentes)' : ''}. Confírmelas o corríjalas.</>
          : <>No hay datos clínicos registrados hasta esta visita: responda todas las preguntas.</>}
        {' '}Las preguntas sin responder no cuentan como 0: el nivel solo se asigna cuando lo que falta no puede cambiarlo.
      </Notice>
      {record ? (
        <p className="coamo-field-hint">
          Registro {record.status === 'completed' ? 'confirmado' : 'en borrador'} · revisión {record.revision}
          {record.last_correction_reason ? ` · Última corrección: «${record.last_correction_reason}»` : ''}
        </p>
      ) : null}
      {locked ? (
        <Notice tone="info" title="Estratificación confirmada">
          Para modificarla pulse «Corregir» e indique el motivo; el cambio queda auditado.
          <div className="form-actions"><button type="button" className="button-secondary" onClick={() => setCorrecting(true)}>Corregir</button></div>
        </Notice>
      ) : null}

      <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} className="page-stack">
        {DIMENSIONS.map((dimension) => {
          const vars = variables.filter((v) => v.dimension === dimension);
          const dim = result.byDimension[dimension];
          return (
            <section key={dimension} className="card" aria-labelledby={`dim-${dimension}`}>
              <h2 id={`dim-${dimension}`}>{DIMENSION_LABEL[dimension]} <span className="text-muted">· {dim.points} de {dim.max} puntos</span></h2>
              <div className="grid-2" style={{ marginTop: 'var(--sp-3)' }}>
                {vars.map((variable) => {
                  const sug = suggestions[variable.id];
                  const value = draft.answers[variable.id] ?? null;
                  const item = result.items.find((i) => i.variable.id === variable.id);
                  return (
                    <fieldset key={variable.id} className="coamo-fieldset">
                      <legend>
                        {variable.question}
                        <span className="coamo-source">{variable.source}</span>
                      </legend>
                      {variable.hint ? <p className="coamo-field-hint">{variable.hint}</p> : null}
                      {notes[variable.id] ? <p className="coamo-field-hint"><strong>Apoyo:</strong> {notes[variable.id]}</p> : null}
                      <div className="coamo-radio-row">
                        {variable.options.map((option) => (
                          <label key={option.value} className="radio-inline">
                            <input type="radio" name={`strat-${variable.id}`} checked={value === option.value} onChange={() => setAnswer(variable.id, option.value)} />
                            {option.label}{variable.exception ? '' : ` (${option.points})`}
                          </label>
                        ))}
                        <label className="radio-inline">
                          <input type="radio" name={`strat-${variable.id}`} checked={value === null} onChange={() => setAnswer(variable.id, null)} />
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
                <select value={draft.raisedTo ?? ''} onChange={(e) => update({ raisedTo: e.target.value ? (Number(e.target.value) as Priority) : null })}>
                  <option value="">No elevar</option>
                  {([1, 2] as Priority[]).filter((p) => p < result.modelPriority!).map((p) => <option key={p} value={p}>Prioridad {p}</option>)}
                </select>
              </label>
              {draft.raisedTo ? (
                <label>
                  Motivo de la elevación (obligatorio)
                  <input value={draft.raisedReason} maxLength={300} onChange={(e) => update({ raisedReason: e.target.value })} />
                </label>
              ) : null}
            </div>
          ) : null}
          {!isBaseline ? (
            <label style={{ display: 'block', marginTop: 'var(--sp-3)' }}>
              Motivo de la reestratificación (obligatorio al confirmar; p. ej., cambio de tratamiento o de la situación clínica)
              <input value={draft.restratReason} maxLength={300} onChange={(e) => update({ restratReason: e.target.value })} />
            </label>
          ) : null}
          {final.error ? <Notice tone="danger">{final.error}</Notice> : null}
          {final.raised && draft.raisedReason.trim() === '' ? <Notice tone="warning">Indique el motivo de la elevación de nivel.</Notice> : null}

          {final.priority ? (
            <Notice tone="success" title={`Nivel asignado: Prioridad ${final.priority}${final.raised ? ` (elevado desde Prioridad ${result.modelPriority})` : ''}`}>
              Periodicidad de valoración: {followUpFor(final.priority)}. Las actuaciones de AF son acumulativas (M p. 18).
            </Notice>
          ) : null}
        </section>
      </fieldset>

      {!locked ? (
        <section className="card" aria-labelledby="strat-save">
          <h2 id="strat-save">Guardar</h2>
          {needsCorrection ? (
            <label style={{ display: 'block' }}>
              Motivo de la corrección (obligatorio, mínimo 5 caracteres)
              <input value={correctionReason} maxLength={300} onChange={(e) => setCorrectionReason(e.target.value)} />
            </label>
          ) : null}
          {confirmBlockers.length > 0 ? (
            <Notice tone="info" title="Para confirmar falta:"><ul className="coamo-gap-list">{confirmBlockers.map((b) => <li key={b}>{b}</li>)}</ul></Notice>
          ) : null}
          {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
          <div className="form-actions">
            {!needsCorrection ? (
              <button type="button" className="button-secondary" disabled={saving} onClick={() => void save('in_progress')}>Guardar borrador</button>
            ) : (
              <button type="button" className="button-secondary" disabled={saving} onClick={() => { setCorrecting(false); setDraft(draftFrom(record!)); setDirty(false); setCorrectionReason(''); }}>Cancelar corrección</button>
            )}
            <button type="button" disabled={saving || confirmBlockers.length > 0 || correctionMissing} onClick={() => void save('completed')}>
              {saving ? 'Guardando...' : needsCorrection ? 'Guardar corrección' : 'Confirmar estratificación'}
            </button>
          </div>
        </section>
      ) : message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
    </div>
  );
}
