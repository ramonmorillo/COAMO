import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import {
  CUSTOM_TEXT_MAX, DOMAIN_LABEL, DOMAIN_ORDER, FOLLOWUP_MAX, FOLLOWUP_STATE_LABEL, INTERVENTION_STATUS_LABEL, earlierVisitHistory,
  followUpState, interventionText, pendingFromEarlierVisits, priorityAtVisit, recommendedActions, resolutionOf, validateCustomAction,
  validatePerformedDate, validatePlannedDate, type CatalogAction, type InterventionDomain, type InterventionRecord,
} from '../domain/interventions';
import { MODALITY_LABEL, VISIT_TYPE_LABEL, formatDate, todayIso } from '../domain/study';
import { createIntervention, listCatalog, listInterventionsForVisits, planningAvailable, updateIntervention } from '../services/interventionService';
import { getPatient, getVisit, listVisits, type Patient, type Visit } from '../services/patientService';
import { listStratificationsForVisits } from '../services/stratificationService';

type Message = { tone: 'success' | 'danger' | 'info'; text: string };

export function InterventionsPage() {
  const { visitId = '' } = useParams();
  // Una instancia por visita: al navegar entre visitas no se reutiliza estado (ni se ve el de la visita anterior).
  return <VisitInterventions key={visitId} visitId={visitId} />;
}

function VisitInterventions({ visitId }: { visitId: string }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [visit, setVisit] = useState<Visit | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [catalog, setCatalog] = useState<CatalogAction[]>([]);
  /** Registros de TODAS las visitas del paciente (la visita actual y las anteriores, para la continuidad). */
  const [records, setRecords] = useState<InterventionRecord[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [priority, setPriority] = useState<{ priority: 1 | 2 | 3; date: string } | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Al pasar de una visita a otra (enlaces del historial) no se muestra nunca el contenido de la visita anterior.
    setLoading(true);
    setLoadError(null);
    setMessage(null);
    const v = await getVisit(visitId);
    if (v.error || !v.data) {
      setLoadError(v.error ?? 'Visita no encontrada o sin acceso.');
      setLoading(false);
      return;
    }
    const [p, all, cat] = await Promise.all([getPatient(v.data.patient_id), listVisits(v.data.patient_id), listCatalog()]);
    const recs = await listInterventionsForVisits(all.data.map((x) => x.id));
    const active = all.data.filter((x) => x.status !== 'cancelled');
    const st = await listStratificationsForVisits(active.map((x) => x.id));
    const dateOf = new Map(active.map((x) => [x.id, x.visit_date]));
    setPriority(priorityAtVisit(v.data.visit_date, st.data.map((s) => ({
      visitDate: dateOf.get(s.visit_id) ?? '9999-12-31', status: s.status, finalPriority: s.final_priority, completedAt: s.completed_at,
    }))));
    setVisit(v.data);
    setPatient(p.data);
    setCatalog(cat.data);
    setRecords(recs.data);
    setVisits(all.data);
    setLoadError(p.error ?? all.error ?? cat.error ?? recs.error ?? st.error ?? null);
    setLoading(false);
  }, [visitId]);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <LoadingState label="Cargando actuaciones farmacéuticas..." />;
  if (loadError || !visit || !patient) return <ErrorState title="No se pudieron cargar las actuaciones" message={loadError ?? 'Sin datos.'} />;

  const cancelled = visit.status === 'cancelled';
  const planning = planningAvailable();
  const today = todayIso();
  const visitRecords = records.filter((r) => r.visit_id === visit.id);
  const visitById = new Map(visits.map((x) => [x.id, x]));
  const visitLabel = (id: string) => {
    const x = visitById.get(id);
    return x ? `${VISIT_TYPE_LABEL[x.visit_type]} del ${formatDate(x.visit_date)}` : 'visita no disponible';
  };
  const recordById = new Map(records.map((r) => [r.id, r]));
  const pending = planning ? pendingFromEarlierVisits(visit, visits, records) : [];
  const history = earlierVisitHistory(visit, visits, records);
  const recommended = recommendedActions(catalog, priority?.priority ?? null);
  const recommendedCodes = new Set(recommended.map((a) => a.code));
  const others = catalog.filter((a) => a.is_active && !recommendedCodes.has(a.code));
  const activeRecord = (code: string) => visitRecords.find((r) => r.catalog_code === code && r.status !== 'discarded') ?? null;
  const replace = (r: InterventionRecord) => setRecords((cur) => [...cur.filter((x) => x.id !== r.id), r]);

  const run = async (key: string, action: () => Promise<{ data: InterventionRecord | null; error: string | null }>, ok: string) => {
    setBusy(key);
    setMessage(null);
    const result = await action();
    setBusy(null);
    if (result.error || !result.data) {
      setMessage({ tone: 'danger', text: result.error ?? 'No se ha guardado.' });
      return false;
    }
    replace(result.data);
    setMessage({ tone: 'success', text: ok });
    return true;
  };

  const registerCatalog = (a: CatalogAction, status: 'planned' | 'performed', date: string) =>
    run(a.code, () => createIntervention({ visit_id: visit.id, catalog_code: a.code, custom_text: null, domain: a.domain, status,
      performed_date: status === 'performed' ? date : null, followup_note: null, ...(planning && status === 'planned' ? { planned_date: date } : {}) }),
    status === 'performed' ? 'Actuación registrada como realizada.' : `Actuación registrada como prevista${planning ? ` para el ${formatDate(date)}` : ''}.`);

  const resolveInThisVisit = (origin: InterventionRecord, date: string) =>
    run(`resolve-${origin.id}`, () => createIntervention({ visit_id: visit.id, catalog_code: origin.catalog_code, custom_text: origin.custom_text, domain: origin.domain,
      status: 'performed', performed_date: date, followup_note: null, origin_intervention_id: origin.id }),
    `Realización documentada en esta visita. El registro de la ${visitLabel(origin.visit_id)} se conserva sin cambios.`);
  const dateCtx = { visitDate: visit.visit_date, today, planning };

  const actionRow = (a: CatalogAction) => (
    <CatalogRow key={a.code} action={a} record={activeRecord(a.code)} busy={busy === a.code || busy === activeRecord(a.code)?.id}
      disabled={cancelled} dates={dateCtx} records={records} visitLabel={visitLabel}
      onRegister={(status, date) => registerCatalog(a, status, date)}
      onUpdate={(r, changes, ok) => run(r.id, () => updateIntervention(r, changes), ok)} />
  );

  return (
    <div className="page-stack">
      <PageHeader
        title="Actuaciones farmacéuticas"
        description={`${patient.study_code} · ${VISIT_TYPE_LABEL[visit.visit_type]} del ${formatDate(visit.visit_date)} · ${MODALITY_LABEL[visit.modality]}`}
      />
      <p><Link to={`/patients/${patient.id}`}>← Volver a la ficha del paciente</Link></p>

      <section className="card" aria-labelledby="int-context">
        <h2 id="int-context">Prioridad CMO y actuaciones recomendadas</h2>
        {priority ? (
          <p>Prioridad vigente: <strong>Prioridad {priority.priority}</strong> (estratificación completada de la visita del {formatDate(priority.date)}).</p>
        ) : (
          <Notice tone="info">Sin estratificación CMO completada hasta esta visita: no se muestran actuaciones recomendadas. Puede registrar actuaciones del catálogo o adicionales.</Notice>
        )}
        {priority?.priority === 1 && !catalog.some((a) => a.source_table === 'Tabla 7') ? (
          <Notice tone="warning">
            Catálogo de Prioridad 1 incompleto: la Tabla 7 del modelo no está cargada (copia no legible). Se muestran las actuaciones de las Tablas 5 y 6, que
            el modelo acumula; faltan las específicas de Prioridad 1.
          </Notice>
        ) : null}
        <p className="help-text">
          Catálogo: Tablas 5 (Prioridad 3), 6 (Prioridad 2) y 7 (Prioridad 1) del modelo CMO de coagulopatías (SEFH v2.0), acumulativas. Que una actuación aparezca
          recomendada <strong>no</strong> significa que se haya realizado: solo cuenta lo que registre como «realizada», con su fecha.
        </p>
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        {cancelled ? <Notice tone="warning">Visita anulada: no se registran actuaciones.</Notice> : null}
      </section>

      {!planning ? (
        <Notice tone="warning" title="Planificación de actuaciones no disponible todavía">
          La fecha prevista y el seguimiento de actuaciones entre visitas requieren aplicar en la base de datos la migración
          20261122120000_coag_interventions_planning. Mientras tanto puede seguir registrando actuaciones como hasta ahora; las previstas
          quedan sin fecha prevista.
        </Notice>
      ) : null}

      {planning ? (
        <section className="card" aria-labelledby="int-pending">
          <h2 id="int-pending">Actuaciones pendientes de visitas anteriores</h2>
          {pending.length === 0 ? (
            <p className="text-muted">No hay actuaciones previstas en visitas anteriores pendientes de realizar.</p>
          ) : (
            <>
              <p className="help-text">
                Previstas en visitas anteriores y aún no realizadas. Si la realiza ahora, se documenta <strong>en esta visita</strong>; el registro de la
                visita de origen no se modifica (conserva su estado y su fecha prevista).
              </p>
              <ul className="coamo-int-list">
                {pending.map((r) => (
                  <PendingRow key={r.id} record={r} text={interventionText(r, catalog)} origin={visitLabel(r.visit_id)} today={today}
                    defaultDate={visit.visit_date <= today ? visit.visit_date : today}
                    conflict={!!r.catalog_code && !!activeRecord(r.catalog_code)}
                    busy={busy === `resolve-${r.id}`} disabled={cancelled || visit.visit_date > today}
                    onResolve={(date) => resolveInThisVisit(r, date)} />
                ))}
              </ul>
              {visit.visit_date > today ? <Notice tone="info">Esta visita aún no ha tenido lugar: documente la realización cuando se haga.</Notice> : null}
            </>
          )}
        </section>
      ) : null}

      {history.length > 0 ? (
        <section className="card" aria-labelledby="int-history">
          <details>
            <summary><h2 id="int-history" style={{ display: 'inline' }}>Historial de actuaciones de visitas anteriores</h2></summary>
            <p className="help-text">Solo lectura. Para modificar un registro, abra las actuaciones de su visita.</p>
            {history.map(({ visit: hv, records: hr }) => (
              <div key={hv.id}>
                <h3><Link to={`/visits/${hv.id}/interventions`}>{visitLabel(hv.id)}</Link>{hv.status === 'cancelled' ? ' (visita anulada)' : ''}</h3>
                <ul>
                  {hr.map((r) => {
                    const resolution = resolutionOf(r, records);
                    const origin = r.origin_intervention_id ? recordById.get(r.origin_intervention_id) : undefined;
                    return (
                      <li key={r.id} className={r.status === 'discarded' ? 'text-muted' : undefined}>
                        {interventionText(r, catalog)} · <strong>{FOLLOWUP_STATE_LABEL[followUpState(r, records, today)]}</strong>
                        {r.planned_date ? ` · prevista para el ${formatDate(r.planned_date)}` : ''}
                        {r.performed_date ? ` · realizada el ${formatDate(r.performed_date)}` : ''}
                        {resolution ? ` · documentada en la ${visitLabel(resolution.visit_id)} (${formatDate(resolution.performed_date)})` : ''}
                        {origin ? ` · realización de la prevista en la ${visitLabel(origin.visit_id)}` : ''}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </details>
        </section>
      ) : null}

      {DOMAIN_ORDER.map((domain) => {
        const rec = recommended.filter((a) => a.domain === domain);
        const oth = others.filter((a) => a.domain === domain);
        return (
          <section className="card" key={domain} aria-labelledby={`int-${domain}`}>
            <h2 id={`int-${domain}`}>{DOMAIN_LABEL[domain]}</h2>
            {rec.length > 0 ? <ul className="coamo-int-list">{rec.map(actionRow)}</ul> : priority ? <p className="text-muted">Sin actuaciones recomendadas en este ámbito.</p> : null}
            {oth.length > 0 ? (
              <details>
                <summary>{priority ? 'Otras actuaciones del catálogo (no recomendadas para esta prioridad)' : 'Actuaciones del catálogo'}</summary>
                <ul className="coamo-int-list">{oth.map(actionRow)}</ul>
              </details>
            ) : null}
            <CustomActions domain={domain} records={visitRecords.filter((r) => !r.catalog_code && r.domain === domain)} allRecords={records} busy={busy} disabled={cancelled}
              dates={dateCtx} visitLabel={visitLabel}
              onCreate={(text, status, date) => run(`new-${domain}`, () => createIntervention({ visit_id: visit.id, catalog_code: null, custom_text: text.trim(), domain,
                status, performed_date: status === 'performed' ? date : null, followup_note: null, ...(planning && status === 'planned' ? { planned_date: date } : {}) }),
              status === 'performed' ? 'Actuación adicional registrada como realizada.' : 'Actuación adicional registrada como prevista.')}
              onUpdate={(r, changes, ok) => run(r.id, () => updateIntervention(r, changes), ok)} />
          </section>
        );
      })}

      {visitRecords.some((r) => r.status === 'discarded') ? (
        <section className="card" aria-labelledby="int-discarded">
          <h2 id="int-discarded">Registros anulados</h2>
          <ul>{visitRecords.filter((r) => r.status === 'discarded').map((r) => <li key={r.id} className="text-muted">{interventionText(r, catalog)}</li>)}</ul>
        </section>
      ) : null}
    </div>
  );
}

type UpdateFn = (r: InterventionRecord, changes: Partial<InterventionRecord>, ok: string) => Promise<boolean>;
type DateCtx = { visitDate: string; today: string; planning: boolean };

const defaultPerformed = (d: DateCtx) => (d.visitDate <= d.today ? d.visitDate : d.today);

/** Fecha real (nunca futura) y, si hay planificación, fecha prevista (≥ fecha de la visita), con validación visible. */
function RegisterControls({ label, dates, disabled, busy, onRegister }: {
  label: string; dates: DateCtx; disabled: boolean; busy: boolean; onRegister: (status: 'planned' | 'performed', date: string) => Promise<boolean>;
}) {
  const [performed, setPerformed] = useState(defaultPerformed(dates));
  const [planned, setPlanned] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = (status: 'planned' | 'performed') => {
    const errors = status === 'performed' ? validatePerformedDate(performed, dates.today) : dates.planning ? validatePlannedDate(planned, dates.visitDate) : [];
    if (errors.length) { setError(errors.join(' ')); return; }
    setError(null);
    void onRegister(status, status === 'performed' ? performed : planned);
  };
  return (
    <div className="coamo-int-register">
      <div className="form-actions">
        <label className="coamo-field-hint">Fecha de realización{' '}
          <input type="date" value={performed} max={dates.today} onChange={(e) => setPerformed(e.target.value)} aria-label={`Fecha de realización de ${label}`} disabled={disabled || busy} />
        </label>
        <button type="button" disabled={disabled || busy || !performed} onClick={() => submit('performed')}>Registrar como realizada</button>
      </div>
      <div className="form-actions">
        {dates.planning ? (
          <label className="coamo-field-hint">Fecha prevista{' '}
            <input type="date" value={planned} min={dates.visitDate} onChange={(e) => setPlanned(e.target.value)} aria-label={`Fecha prevista de ${label}`} disabled={disabled || busy} />
          </label>
        ) : null}
        <button type="button" className="button-secondary" disabled={disabled || busy || (dates.planning && !planned)} onClick={() => submit('planned')}>Prever</button>
      </div>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  );
}

function RecordControls({ record, records, busy, disabled, dates, visitLabel, onUpdate }: {
  record: InterventionRecord; records: InterventionRecord[]; busy: boolean; disabled: boolean; dates: DateCtx; visitLabel: (id: string) => string; onUpdate: UpdateFn;
}) {
  const [note, setNote] = useState(record.followup_note ?? '');
  const [date, setDate] = useState(record.performed_date ?? defaultPerformed(dates));
  const [planned, setPlanned] = useState(record.planned_date ?? '');
  const [error, setError] = useState<string | null>(null);
  const resolution = resolutionOf(record, records);
  const origin = record.origin_intervention_id ? records.find((r) => r.id === record.origin_intervention_id) : undefined;
  const state = followUpState(record, records, dates.today);
  const markPerformed = () => {
    const errors = validatePerformedDate(date, dates.today);
    if (errors.length) { setError(errors.join(' ')); return; }
    setError(null);
    void onUpdate(record, { status: 'performed', performed_date: date }, 'Actuación marcada como realizada. Se conserva la fecha prevista.');
  };
  const reschedule = () => {
    const errors = validatePlannedDate(planned, dates.visitDate);
    if (errors.length) { setError(errors.join(' ')); return; }
    setError(null);
    void onUpdate(record, { planned_date: planned }, 'Fecha prevista modificada (el cambio queda en la auditoría).');
  };
  return (
    <div className="coamo-int-record">
      <span className="text-strong">{record.status === 'planned' ? FOLLOWUP_STATE_LABEL[state] : INTERVENTION_STATUS_LABEL[record.status]}</span>
      {record.planned_date ? <span> · prevista para el {formatDate(record.planned_date)}</span> : null}
      {record.performed_date ? <span> · realizada el {formatDate(record.performed_date)}</span> : null}
      {record.recommended_for_priority === false ? <span className="coamo-field-hint"> · no recomendada para la prioridad vigente al registrarla</span> : null}
      {origin ? <p className="coamo-field-hint">Realización de la actuación prevista en la {visitLabel(origin.visit_id)}.</p> : null}
      {resolution ? (
        <p className="coamo-field-hint">Realizada el {formatDate(resolution.performed_date)} y documentada en la {visitLabel(resolution.visit_id)}. Este registro se conserva como se previó.</p>
      ) : null}
      {record.status === 'planned' && !resolution ? (
        <>
          <div className="form-actions">
            <input type="date" value={date} max={dates.today} onChange={(e) => setDate(e.target.value)} aria-label="Fecha de realización" disabled={disabled || busy} />
            <button type="button" disabled={disabled || busy || !date} onClick={markPerformed}>Marcar como realizada</button>
          </div>
          {dates.planning ? (
            <div className="form-actions">
              <input type="date" value={planned} min={dates.visitDate} onChange={(e) => setPlanned(e.target.value)} aria-label="Nueva fecha prevista" disabled={disabled || busy} />
              <button type="button" className="button-secondary" disabled={disabled || busy || !planned || planned === (record.planned_date ?? '')} onClick={reschedule}>
                {record.planned_date ? 'Cambiar fecha prevista' : 'Fijar fecha prevista'}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {!resolution ? (
        <div className="form-actions">
          <button type="button" className="button-secondary" disabled={disabled || busy}
            onClick={() => { if (window.confirm('¿Anular este registro? Se conserva como anulado y podrá registrarse de nuevo.')) void onUpdate(record, { status: 'discarded' }, 'Registro anulado.'); }}>
            Anular registro
          </button>
        </div>
      ) : null}
      <label className="coamo-field-hint" htmlFor={`note-${record.id}`}>Seguimiento / resultado (opcional, sin datos identificativos)</label>
      <textarea id={`note-${record.id}`} rows={2} maxLength={FOLLOWUP_MAX} value={note} disabled={disabled || busy} onChange={(e) => setNote(e.target.value)} style={{ width: '100%' }} />
      {note.trim() !== (record.followup_note ?? '') ? (
        <button type="button" disabled={disabled || busy} onClick={() => void onUpdate(record, { followup_note: note.trim() || null }, 'Seguimiento guardado.')}>Guardar seguimiento</button>
      ) : null}
    </div>
  );
}

function PendingRow({ record, text, origin, today, defaultDate, conflict, busy, disabled, onResolve }: {
  record: InterventionRecord; text: string; origin: string; today: string; defaultDate: string; conflict: boolean; busy: boolean; disabled: boolean;
  onResolve: (date: string) => Promise<boolean>;
}) {
  const [date, setDate] = useState(defaultDate);
  const [error, setError] = useState<string | null>(null);
  const overdue = !!record.planned_date && record.planned_date < today;
  const submit = () => {
    const errors = validatePerformedDate(date, today);
    if (errors.length) { setError(errors.join(' ')); return; }
    setError(null);
    void onResolve(date);
  };
  return (
    <li className="coamo-int-item" data-pending={record.id}>
      <p>{text} <span className="coamo-source">{record.catalog_code ?? 'Actuación adicional'} · prevista en la {origin}</span></p>
      <p className={overdue ? 'text-strong' : 'coamo-field-hint'}>
        {record.planned_date ? `Fecha prevista: ${formatDate(record.planned_date)}${overdue ? ' (superada)' : ''}` : 'Sin fecha prevista (registrada antes de la planificación con fecha)'}
      </p>
      {conflict ? (
        <Notice tone="info">La misma actuación del catálogo ya está registrada en esta visita. Si corresponde a esta previsión, anule ese registro y documéntela desde aquí.</Notice>
      ) : (
        <div className="form-actions">
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-label={`Fecha de realización de ${text}`} disabled={disabled || busy} />
          <button type="button" disabled={disabled || busy || !date} onClick={submit}>{busy ? 'Guardando...' : 'Documentar realización en esta visita'}</button>
        </div>
      )}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </li>
  );
}

function CatalogRow({ action, record, records, busy, disabled, dates, visitLabel, onRegister, onUpdate }: {
  action: CatalogAction; record: InterventionRecord | null; records: InterventionRecord[]; busy: boolean; disabled: boolean; dates: DateCtx;
  visitLabel: (id: string) => string; onRegister: (status: 'planned' | 'performed', date: string) => Promise<boolean>; onUpdate: UpdateFn;
}) {
  return (
    <li className="coamo-int-item" data-code={action.code}>
      <p>{action.action_text} <span className="coamo-source">{action.code} · {action.source_table}</span></p>
      {record ? (
        <RecordControls key={`${record.id}-${record.revision}`} record={record} records={records} busy={busy} disabled={disabled} dates={dates} visitLabel={visitLabel} onUpdate={onUpdate} />
      ) : (
        <>
          <span className="text-muted">Sin registrar</span>
          <RegisterControls label={action.code} dates={dates} disabled={disabled} busy={busy} onRegister={onRegister} />
        </>
      )}
    </li>
  );
}

function CustomActions({ domain, records, allRecords, busy, disabled, dates, visitLabel, onCreate, onUpdate }: {
  domain: InterventionDomain; records: InterventionRecord[]; allRecords: InterventionRecord[]; busy: string | null; disabled: boolean; dates: DateCtx;
  visitLabel: (id: string) => string; onCreate: (text: string, status: 'planned' | 'performed', date: string) => Promise<boolean>; onUpdate: UpdateFn;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const submit = async (status: 'planned' | 'performed', date: string) => {
    const errors = validateCustomAction(text);
    if (errors.length) { setError(errors.join(' ')); return false; }
    setError(null);
    const ok = await onCreate(text, status, date);
    if (ok) { setText(''); setFormKey((k) => k + 1); }
    return ok;
  };
  const active = records.filter((r) => r.status !== 'discarded');
  return (
    <div style={{ marginTop: 'var(--sp-3)' }}>
      {active.length > 0 ? (
        <ul className="coamo-int-list">
          {active.map((r) => (
            <li key={r.id} className="coamo-int-item">
              <p>{r.custom_text} <span className="coamo-source">Actuación adicional</span></p>
              <RecordControls key={`${r.id}-${r.revision}`} record={r} records={allRecords} busy={busy === r.id} disabled={disabled} dates={dates} visitLabel={visitLabel} onUpdate={onUpdate} />
            </li>
          ))}
        </ul>
      ) : null}
      <details>
        <summary>Añadir actuación adicional (fuera del catálogo)</summary>
        <label htmlFor={`custom-${domain}`} className="visually-hidden">Actuación adicional</label>
        <textarea id={`custom-${domain}`} rows={2} maxLength={CUSTOM_TEXT_MAX + 100} value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} style={{ width: '100%' }} />
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <RegisterControls key={formKey} label="la actuación adicional" dates={dates} disabled={disabled} busy={busy === `new-${domain}`} onRegister={submit} />
      </details>
    </div>
  );
}
