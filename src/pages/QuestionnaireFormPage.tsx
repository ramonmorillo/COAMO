import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useBlocker, useParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import {
  applicabilityHints, DATA_SOURCE_LABEL, effectiveStatus, REASON_LABEL, REASONS_FOR_STATUS, STATUS_LABEL, STATUS_TONE,
  studyVisitOf, validateDraft, VISIT_LABEL,
  type DataSource, type DraftState, type QuestionnaireAdministration, type ReasonCode,
} from '../domain/questionnaires/administration';
import {
  ADMINISTRATION_MODE_LABEL, EQ5D_VAS_SCALE, EQ5D_VAS_TEXT, INSTRUMENTS, INSTRUMENT_CODES, optionsFor,
  type AdministrationMode, type InstrumentCode, type QuestionnaireItem,
} from '../domain/questionnaires/instruments';
import { computeScores, formatScore, isComplete, progress, type Eq5dScores, type IexpacScores } from '../domain/questionnaires/scoring';
import { DIAGNOSIS_LABEL, formatDate, todayIso } from '../domain/study';
import { getOwnProfile } from '../services/coamoDataService';
import {
  createAdministration, getAdministration, getTreatmentContext, listAuditHistory, updateAdministration, type AuditEntry,
} from '../services/questionnaireService';
import { getPatient, getVisit, type Patient, type Visit } from '../services/patientService';

type Message = { tone: 'success' | 'danger' | 'warning'; text: string; details?: string[] };

function draftFrom(admin: QuestionnaireAdministration | null, visit: Visit): DraftState {
  return {
    status: admin?.status ?? 'in_progress',
    reasonCode: admin?.status_reason_code ?? null,
    reasonDetail: admin?.status_reason_detail ?? '',
    mode: admin?.administration_mode ?? null,
    dataSource: admin?.data_source ?? null,
    date: admin?.administration_date ?? (visit.visit_date <= todayIso() ? visit.visit_date : ''),
    responses: { ...(admin?.responses ?? {}) },
    applicability: { ...(admin?.item_applicability ?? {}) },
  };
}

/**
 * Un formulario por visita e instrumento: al cambiar de ruta se monta de nuevo, para que nunca se muestre
 * (ni se guarde) el borrador o el registro de otro cuestionario mientras carga el nuevo.
 */
export function QuestionnaireFormPage() {
  const { visitId = '', instrument = '' } = useParams();
  return <QuestionnaireForm key={`${visitId}/${instrument}`} visitId={visitId} instrument={instrument} />;
}

function QuestionnaireForm({ visitId, instrument }: { visitId: string; instrument: string }) {
  const code = (INSTRUMENT_CODES as string[]).includes(instrument) ? (instrument as InstrumentCode) : null;
  const def = code ? INSTRUMENTS[code] : null;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [visit, setVisit] = useState<Visit | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [admin, setAdmin] = useState<QuestionnaireAdministration | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [treatment, setTreatment] = useState<{ treatment_regimen: string | null; treatment_type: string | null } | null>(null);
  const [isCoordinator, setIsCoordinator] = useState(false);

  const load = useCallback(async () => {
    if (!code) return;
    const v = await getVisit(visitId);
    if (v.error || !v.data) {
      setLoadError(v.error ?? 'Visita no encontrada o sin acceso.');
      setLoading(false);
      return;
    }
    const [p, a, t, profile] = await Promise.all([getPatient(v.data.patient_id), getAdministration(visitId, code), getTreatmentContext(visitId), getOwnProfile()]);
    setVisit(v.data);
    setPatient(p.data);
    setAdmin(a.data);
    setTreatment(t.data);
    setIsCoordinator(profile.data?.role === 'coordinator');
    setDraft(draftFrom(a.data, v.data));
    setDirty(false);
    setCorrecting(false);
    setCorrectionReason('');
    setLoadError(p.error ?? a.error ?? t.error);
    setLoading(false);
  }, [code, visitId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Cambios sin guardar: aviso al navegar dentro de la app y al cerrar o recargar la pestaña.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm('Hay cambios sin guardar en este cuestionario. ¿Salir y descartarlos?')) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const scores = useMemo(() => (code && draft ? computeScores(code, draft.responses, draft.applicability) : null), [code, draft]);

  if (!code || !def) return <ErrorState title="Instrumento no válido" message="El cuestionario solicitado no forma parte de COAMO." />;
  if (loading) return <LoadingState label="Cargando cuestionario..." />;
  if (loadError || !visit || !patient || !draft) return <ErrorState title="No se pudo cargar el cuestionario" message={loadError ?? 'Sin datos.'} />;
  const moment = studyVisitOf(visit.visit_type);
  if (!moment) return <ErrorState title="Visita no válida" message="Los cuestionarios del estudio se registran en la visita basal (V0) o final (VF)." />;
  if (visit.status === 'cancelled') return <ErrorState title="Visita anulada" message="No se registran cuestionarios en una visita anulada." />;

  const locked = admin?.status === 'completed' && !correcting;
  const resolvedWithoutAnswers = draft.status === 'not_applicable' || draft.status === 'not_done';
  const editableAnswers = !locked && !resolvedWithoutAnswers && def.available;
  const mode = draft.mode;
  const showItems = def.available && !resolvedWithoutAnswers && (code !== 'EQ5D3L' || mode !== null);
  const prog = progress(code, def.coreItemCodes, draft.responses, draft.applicability);
  const hints = applicabilityHints(code, {
    diagnosis: patient.diagnosis,
    treatmentRegimen: treatment?.treatment_regimen ?? null,
    treatmentType: treatment?.treatment_type ?? null,
  });

  const update = (changes: Partial<DraftState>) => {
    setDraft((current) => (current ? { ...current, ...changes } : current));
    setDirty(true);
    setMessage(null);
  };
  const setAnswer = (item: string, value: number | null) => {
    const responses = { ...draft.responses };
    if (value === null) delete responses[item];
    else responses[item] = value;
    update({ responses });
  };
  const setApplies = (item: string, value: boolean | null) => {
    const applicability = { ...draft.applicability };
    const responses = { ...draft.responses };
    if (value === null) delete applicability[item];
    else applicability[item] = value;
    if (value !== true) delete responses[item];
    update({ applicability, responses });
  };

  const save = async (next: DraftState) => {
    const errors = validateDraft(code, next, todayIso());
    if (errors.length > 0) {
      setMessage({ tone: 'danger', text: 'Revisa estos puntos antes de guardar:', details: errors });
      return;
    }
    if (admin?.status === 'completed' && correctionReason.trim().length < 5) {
      setMessage({ tone: 'danger', text: 'Indica el motivo de la corrección (mínimo 5 caracteres): queda registrado en la auditoría.' });
      return;
    }
    setSaving(true);
    const result = admin
      ? await updateAdministration(admin, next, admin.status === 'completed' ? correctionReason.trim() : null)
      : await createAdministration(visit.id, code, next);
    setSaving(false);
    if (result.error || !result.data) {
      setMessage({ tone: 'danger', text: result.error ?? 'No se pudo guardar.' });
      return;
    }
    setAdmin(result.data);
    setDraft(draftFrom(result.data, visit));
    setDirty(false);
    setCorrecting(false);
    setCorrectionReason('');
    setMessage({ tone: 'success', text: `Guardado: ${STATUS_LABEL[result.data.status].toLowerCase()} (revisión ${result.data.revision}).` });
  };

  const saveDraft = () => void save({ ...draft, status: admin?.status === 'completed' ? 'completed' : 'in_progress' });
  const complete = () => {
    if (scores && !isComplete(code, scores)) {
      const missing = prog.expected - prog.answered;
      const ok = window.confirm(
        `Faltan ${missing} respuesta(s). Se guardará como completado pero INCOMPLETO: ` +
        (code === 'IEXPAC' ? 'sin puntuación global (no se imputan ítems). ' : code === 'EQ5D3L' ? 'sin perfil completo o sin EVA. ' : '') +
        '¿Continuar?');
      if (!ok) return;
    }
    void save({ ...draft, status: 'completed' });
  };
  const resolveWithoutAnswers = () => {
    if (Object.keys(draft.responses).length > 0 || Object.keys(draft.applicability).length > 0) {
      if (!window.confirm('Se borrarán las respuestas registradas en pantalla para marcarlo como no aplicable o no realizado. ¿Continuar?')) return;
    }
    void save({ ...draft, responses: {}, applicability: {} });
  };

  const iexpac = code === 'IEXPAC' ? (scores as IexpacScores) : null;
  const eq5d = code === 'EQ5D3L' ? (scores as Eq5dScores) : null;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={`${patient.study_code} · ${DIAGNOSIS_LABEL[patient.diagnosis]} · ${VISIT_LABEL[moment]} (${formatDate(visit.visit_date)})`}
        title={def.shortName}
        description={def.name}
        actions={
          <>
            <StatusBadge tone={STATUS_TONE[effectiveStatus(admin)]} dot>{STATUS_LABEL[effectiveStatus(admin)]}</StatusBadge>
            <Link className="button-link button-secondary" to={`/patients/${patient.id}`}>Volver a la ficha</Link>
          </>
        }
      />

      <section className="card" aria-labelledby="q-about">
        <h2 id="q-about">Instrumento</h2>
        <dl className="coamo-keyvalues">
          <div><dt>Constructo</dt><dd>{def.construct}</dd></div>
          <div><dt>Fuente</dt><dd>{def.source}</dd></div>
          <div><dt>Versión registrada</dt><dd>{admin?.instrument_version ?? '—'}</dd></div>
          <div><dt>Revisión</dt><dd>{admin ? admin.revision : 'Sin registrar'}</dd></div>
        </dl>
        {admin?.last_correction_reason ? (
          <Notice tone="info">Última corrección ({formatDate(admin.last_corrected_at)}): {admin.last_correction_reason}</Notice>
        ) : null}
        {!def.available ? <Notice tone="warning" title="Instrumento no disponible">{def.unavailableReason}</Notice> : null}
        {hints.map((h) => <Notice key={h.text} tone={h.tone}>{h.text}</Notice>)}
        {moment === 'V0' && code === 'IEXPAC' ? (
          <p className="coamo-field-hint" style={{ marginTop: 'var(--sp-3)' }}>
            V0: la experiencia basal debe reflejar la atención previa; administre IEXPAC antes de aplicar el modelo CMO en esta visita.
          </p>
        ) : null}
      </section>

      <section className="card" aria-labelledby="q-admin">
        <h2 id="q-admin">Administración</h2>
        <div className="coamo-inline-form" style={{ marginTop: 'var(--sp-3)' }}>
          <label>
            Fecha de administración
            <input type="date" value={draft.date} max={todayIso()} disabled={locked} onChange={(e) => update({ date: e.target.value })} />
          </label>
          <label>
            Origen del dato
            <select value={draft.dataSource ?? ''} disabled={locked} onChange={(e) => update({ dataSource: (e.target.value || null) as DataSource | null })}>
              <option value="">Sin registrar</option>
              {(Object.keys(DATA_SOURCE_LABEL) as DataSource[]).map((k) => <option key={k} value={k}>{DATA_SOURCE_LABEL[k]}</option>)}
            </select>
          </label>
        </div>
        <fieldset className="coamo-fieldset" style={{ marginTop: 'var(--sp-4)' }}>
          <legend>Modalidad de administración{code === 'EQ5D3L' ? ' (determina la versión y el texto del EQ-5D-3L)' : ''}</legend>
          <div className="radio-row">
            {def.modes.map((m) => (
              <label key={m} className="radio-inline">
                <input type="radio" name="mode" checked={mode === m} disabled={locked || (code === 'EQ5D3L' && Object.keys(draft.responses).length > 0 && mode !== m)}
                  onChange={() => update({ mode: m })} />
                {code === 'EQ5D3L' ? (m === 'self' ? 'Autoadministrado (v2.0)' : 'Por entrevista con profesional (v1.0)') : ADMINISTRATION_MODE_LABEL[m]}
              </label>
            ))}
          </div>
          {code === 'EQ5D3L' && Object.keys(draft.responses).length > 0 ? (
            <p className="coamo-field-hint">Para cambiar de modalidad borre antes las respuestas: los textos de cada versión no son intercambiables.</p>
          ) : null}
        </fieldset>
      </section>

      {def.available && !resolvedWithoutAnswers ? (
        <section className="card" aria-labelledby="q-items">
          <h2 id="q-items">Cuestionario</h2>
          <ProgressBar answered={prog.answered} expected={prog.expected} />
          {code === 'EQ5D3L' && !mode ? <Notice tone="info">Elija primero la modalidad de administración.</Notice> : null}
          {showItems ? (
            <>
              {(def.instructions[mode ?? 'default'] ?? def.instructions.default ?? []).map((p) => <p key={p} className="coamo-q-instruction">{p}</p>)}
              {def.sections.map((section) => (
                <div key={section.id} className="questionnaire-grid">
                  {section.title ? <h3 className="coamo-q-section">{section.title}</h3> : null}
                  {section.items.map((item) =>
                    item.kind === 'vas' ? (
                      <VasField key={item.code} mode={mode === 'interviewer' ? 'interviewer' : 'self'} value={draft.responses.vas ?? null}
                        disabled={!editableAnswers} onChange={(v) => setAnswer('vas', v)} />
                    ) : (
                      <ItemField key={item.code} code={code} item={item} mode={mode} value={draft.responses[item.code] ?? null}
                        applies={item.condition ? draft.applicability[item.code] ?? null : undefined}
                        disabled={!editableAnswers} onChange={(v) => setAnswer(item.code, v)} onApplies={(v) => setApplies(item.code, v)} />
                    ),
                  )}
                </div>
              ))}
              {def.footer?.[mode ?? 'default'] ? <p className="coamo-field-hint" style={{ marginTop: 'var(--sp-4)' }}>{def.footer[mode ?? 'default']}</p> : null}
            </>
          ) : null}

          <div className="questionnaire-result" aria-live="polite">
            {iexpac ? (
              iexpac.complete
                ? <>Suma ítems 1-11: <strong>{iexpac.sum}</strong> · IEXPAC global (0-10): <strong>{formatScore(iexpac.global_0_10)}</strong></>
                : <>IEXPAC global: no calculable ({iexpac.items_answered}/11 ítems generales respondidos; no se imputan ausentes).</>
            ) : null}
            {eq5d ? (
              <>Perfil: <strong>{eq5d.profile ?? `incompleto (${eq5d.dimensions_answered}/5)`}</strong> · EVA: <strong>{eq5d.vas ?? '—'}</strong> · Índice de utilidad: no calculado (sin tarifa aprobada)</>
            ) : null}
            {code === 'EVASAF' || code === 'VERITAS_PRN' ? <>{def.scoringSummary}</> : null}
            {code === 'IEXPAC' ? <p className="coamo-field-hint" style={{ marginTop: 'var(--sp-2)' }}>{def.scoringSummary}</p> : null}
          </div>
        </section>
      ) : null}

      <section className="card" aria-labelledby="q-save">
        <h2 id="q-save">Guardar</h2>
        {admin?.status === 'completed' ? (
          correcting ? (
            <label style={{ display: 'block', marginTop: 'var(--sp-3)' }}>
              Motivo de la corrección (obligatorio; sin datos identificativos)
              <textarea value={correctionReason} maxLength={300} rows={2} onChange={(e) => setCorrectionReason(e.target.value)} />
            </label>
          ) : (
            <Notice tone="info">
              Cuestionario completado{admin.completed_at ? ` el ${formatDate(admin.completed_at)}` : ''}. Para modificarlo, inicia una corrección: quedará registrada con su motivo, autor y fecha.
            </Notice>
          )
        ) : null}
        {message ? (
          <Notice tone={message.tone}>
            {message.text}
            {message.details ? <ul className="coamo-gap-list">{message.details.map((d) => <li key={d}>{d}</li>)}</ul> : null}
          </Notice>
        ) : null}
        {dirty ? <p className="coamo-field-hint" role="status">Hay cambios sin guardar.</p> : null}
        <div className="form-actions">
          {admin?.status === 'completed' && !correcting ? (
            <button type="button" className="button-secondary" onClick={() => setCorrecting(true)}>Corregir cuestionario completado</button>
          ) : null}
          {!locked && def.available && !resolvedWithoutAnswers ? (
            <>
              <button type="button" className="button-secondary" disabled={saving} onClick={saveDraft}>
                {admin?.status === 'completed' ? 'Guardar corrección' : 'Guardar borrador'}
              </button>
              {admin?.status !== 'completed' ? <button type="button" disabled={saving} onClick={complete}>Guardar y marcar como completado</button> : null}
            </>
          ) : null}
          {correcting ? <button type="button" className="button-ghost" onClick={() => void load()}>Cancelar corrección</button> : null}
        </div>

        {!locked ? (
          <fieldset className="coamo-fieldset" style={{ marginTop: 'var(--sp-5)' }}>
            <legend>¿No procede o no se ha podido realizar?</legend>
            <div className="coamo-inline-form">
              <label>
                Estado
                <select value={resolvedWithoutAnswers ? draft.status : ''}
                  onChange={(e) => update({ status: (e.target.value || 'in_progress') as DraftState['status'], reasonCode: null, reasonDetail: '' })}>
                  <option value="">—</option>
                  <option value="not_applicable">No aplicable</option>
                  <option value="not_done">No realizado</option>
                </select>
              </label>
              {resolvedWithoutAnswers ? (
                <label>
                  Motivo
                  <select value={draft.reasonCode ?? ''} onChange={(e) => update({ reasonCode: (e.target.value || null) as ReasonCode | null })}>
                    <option value="">Selecciona…</option>
                    {REASONS_FOR_STATUS[draft.status as 'not_applicable' | 'not_done'].map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
                  </select>
                </label>
              ) : null}
              {resolvedWithoutAnswers && draft.reasonCode === 'other' ? (
                <label>
                  Describa el motivo (sin datos identificativos)
                  <input value={draft.reasonDetail} maxLength={200} onChange={(e) => update({ reasonDetail: e.target.value })} />
                </label>
              ) : null}
            </div>
            {resolvedWithoutAnswers ? (
              <div className="form-actions">
                <button type="button" disabled={saving} onClick={resolveWithoutAnswers}>Registrar como {STATUS_LABEL[draft.status].toLowerCase()}</button>
              </div>
            ) : null}
            <p className="coamo-field-hint">Motivos provisionales: el protocolo no los define. Pendientes de validación por el IP.</p>
          </fieldset>
        ) : null}
      </section>

      <section className="card" aria-labelledby="q-method">
        <h2 id="q-method">Puntuación y limitaciones</h2>
        <p>{def.scoringSummary}</p>
        <p className="help-text">{def.directionNote}</p>
        <ul className="coamo-pending-list">{def.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
      </section>

      {isCoordinator && admin ? <AuditHistory administrationId={admin.id} /> : null}
    </div>
  );
}

// ── Componentes ──────────────────────────────────────────────────────────────

function ProgressBar({ answered, expected }: { answered: number; expected: number }) {
  const pct = expected === 0 ? 0 : Math.round((answered / expected) * 100);
  return (
    <div className="coamo-q-progress">
      <div className="coamo-q-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={expected} aria-valuenow={answered}
        aria-label={`Respondidas ${answered} de ${expected}`}>
        <span className="coamo-q-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="coamo-q-progress-label">{answered} / {expected} respondidas</span>
    </div>
  );
}

type ItemFieldProps = {
  code: InstrumentCode;
  item: QuestionnaireItem;
  mode: AdministrationMode | null;
  value: number | null;
  applies?: boolean | null;
  disabled: boolean;
  onChange: (value: number | null) => void;
  onApplies: (value: boolean | null) => void;
};

function ItemField({ code, item, mode, value, applies, disabled, onChange, onApplies }: ItemFieldProps) {
  const options = optionsFor(code, item, mode);
  const name = `item-${item.code}`;
  const heading = mode === 'interviewer' && item.interviewerText ? item.interviewerText : item.title ?? null;
  const conditional = applies !== undefined;
  return (
    <fieldset className="questionnaire-item coamo-q-item" aria-describedby={`${name}-text`}>
      <legend>
        {item.number ? `${item.number}. ` : ''}
        {heading ?? item.text}
      </legend>
      {item.condition ? <p className="coamo-q-condition">{item.condition}</p> : null}
      {heading && code !== 'EQ5D3L' ? <p id={`${name}-text`} className="coamo-q-text">{item.text}</p> : <span id={`${name}-text`} hidden />}
      {conditional ? (
        <div className="radio-row" role="radiogroup" aria-label={`¿Se cumple la condición del ítem ${item.number}?`} style={{ marginBottom: 'var(--sp-2)' }}>
          <span className="coamo-field-hint" style={{ margin: 0 }}>¿Se cumple la condición?</span>
          {([[true, 'Sí'], [false, 'No: no aplica'], [null, 'Sin registrar']] as const).map(([v, label]) => (
            <label key={String(v)} className="radio-inline">
              <input type="radio" name={`${name}-applies`} checked={applies === v} disabled={disabled} onChange={() => onApplies(v)} />
              {label}
            </label>
          ))}
        </div>
      ) : null}
      {!conditional || applies === true ? (
        <div className={code === 'EQ5D3L' ? 'coamo-q-options-vertical' : 'radio-row'}>
          {options.map((o) => (
            <label key={o.value} className="radio-inline">
              <input type="radio" name={name} value={o.value} checked={value === o.value} disabled={disabled} onChange={() => onChange(o.value)} />
              {o.label}
              {o.hint && code === 'EVASAF' ? <span className="text-muted"> ({o.hint})</span> : null}
            </label>
          ))}
          {value !== null && !disabled ? (
            <button type="button" className="button-ghost button-sm" onClick={() => onChange(null)}>Borrar respuesta</button>
          ) : null}
        </div>
      ) : null}
      {(!conditional || applies === true) && value === null ? <p className="coamo-q-unanswered">Sin responder</p> : null}
    </fieldset>
  );
}

function VasField({ mode, value, disabled, onChange }: { mode: 'self' | 'interviewer'; value: number | null; disabled: boolean; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => setText(value === null ? '' : String(value)), [value]);
  const commit = (raw: string) => {
    setText(raw);
    if (raw.trim() === '') return onChange(null);
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0 && n <= 100) onChange(n);
  };
  const invalid = text.trim() !== '' && !(Number.isInteger(Number(text)) && Number(text) >= 0 && Number(text) <= 100);
  return (
    <fieldset className="questionnaire-item coamo-q-item">
      <legend>EQ-5D VAS</legend>
      {EQ5D_VAS_TEXT[mode].map((line) => <p key={line} className="coamo-q-text">{line}</p>)}
      <div className="coamo-vas">
        <svg className="coamo-vas-scale" viewBox="0 0 120 420" role="img" aria-label={`Escala vertical de 0 a 100${value !== null ? `; valor registrado ${value}` : ''}`}>
          <text x="60" y="12" textAnchor="middle" className="coamo-vas-end">100</text>
          <line x1="60" y1="20" x2="60" y2="400" className="coamo-vas-axis" />
          {Array.from({ length: 21 }, (_, i) => i * 5).map((tick) => {
            const y = 400 - tick * 3.8;
            return (
              <g key={tick}>
                <line x1={tick % 10 === 0 ? 44 : 52} y1={y} x2={tick % 10 === 0 ? 76 : 68} y2={y} className="coamo-vas-tick" />
                {tick % 10 === 0 ? <text x="84" y={y + 4} className="coamo-vas-label">{tick}</text> : null}
              </g>
            );
          })}
          {value !== null ? <circle cx="60" cy={400 - value * 3.8} r="7" className="coamo-vas-mark" /> : null}
          <text x="60" y="416" textAnchor="middle" className="coamo-vas-end">0</text>
        </svg>
        <div>
          <p className="coamo-field-hint">Arriba: {EQ5D_VAS_SCALE.top}. Abajo: {EQ5D_VAS_SCALE.bottom}.</p>
          <label>
            {EQ5D_VAS_SCALE.box}
            <input type="number" inputMode="numeric" min={0} max={100} step={1} value={text} disabled={disabled}
              aria-invalid={invalid} onChange={(e) => commit(e.target.value)} style={{ maxWidth: '8rem' }} />
          </label>
          {invalid ? <p className="coamo-q-unanswered" role="alert">Introduzca un número entero de 0 a 100.</p> : null}
          {value === null && !invalid ? <p className="coamo-q-unanswered">Sin responder (distinto de 0)</p> : null}
        </div>
      </div>
    </fieldset>
  );
}

function AuditHistory({ administrationId }: { administrationId: string }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      const result = await listAuditHistory(administrationId);
      setEntries(result.data);
      setError(result.error);
    })();
  }, [administrationId]);
  const changedItems = (e: AuditEntry) => {
    const before = e.old_data?.responses ?? {};
    const after = e.new_data?.responses ?? {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys].filter((k) => before[k] !== after[k]).map((k) => `${k}: ${before[k] ?? '—'} → ${after[k] ?? '—'}`);
  };
  return (
    <section className="card" aria-labelledby="q-audit">
      <h2 id="q-audit">Historial de cambios <span className="coamo-source">Solo coordinación</span></h2>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {entries && entries.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Acción</th><th>Revisión</th><th>Estado</th><th>Respuestas modificadas</th><th>Motivo</th></tr></thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={`${e.at}-${i}`}>
                  <td>{new Date(e.at).toLocaleString('es-ES')}</td>
                  <td>{e.action === 'INSERT' ? 'Alta' : e.action === 'UPDATE' ? 'Modificación' : 'Borrado'}</td>
                  <td>{e.new_data?.revision ?? e.old_data?.revision ?? '—'}</td>
                  <td>{e.old_data?.status && e.new_data?.status && e.old_data.status !== e.new_data.status
                    ? `${STATUS_LABEL[e.old_data.status]} → ${STATUS_LABEL[e.new_data.status]}`
                    : STATUS_LABEL[(e.new_data?.status ?? e.old_data?.status ?? 'pending')]}</td>
                  <td>{changedItems(e).join('; ') || '—'}</td>
                  <td>{e.new_data?.last_correction_reason && e.new_data.last_correction_reason !== e.old_data?.last_correction_reason ? e.new_data.last_correction_reason : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : entries ? <p className="text-muted">Sin cambios registrados.</p> : null}
    </section>
  );
}
