import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import {
  CUSTOM_TEXT_MAX, DOMAIN_LABEL, DOMAIN_ORDER, FOLLOWUP_MAX, INTERVENTION_STATUS_LABEL, interventionText, priorityAtVisit,
  recommendedActions, validateCustomAction, type CatalogAction, type InterventionDomain, type InterventionRecord,
} from '../domain/interventions';
import { MODALITY_LABEL, VISIT_TYPE_LABEL, formatDate, todayIso } from '../domain/study';
import { createIntervention, listCatalog, listInterventionsForVisits, updateIntervention } from '../services/interventionService';
import { getPatient, getVisit, listVisits, type Patient, type Visit } from '../services/patientService';
import { listStratificationsForVisits } from '../services/stratificationService';

type Message = { tone: 'success' | 'danger' | 'info'; text: string };

export function InterventionsPage() {
  const { visitId = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [visit, setVisit] = useState<Visit | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [catalog, setCatalog] = useState<CatalogAction[]>([]);
  const [records, setRecords] = useState<InterventionRecord[]>([]);
  const [priority, setPriority] = useState<{ priority: 1 | 2 | 3; date: string } | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const v = await getVisit(visitId);
    if (v.error || !v.data) {
      setLoadError(v.error ?? 'Visita no encontrada o sin acceso.');
      setLoading(false);
      return;
    }
    const [p, all, cat, recs] = await Promise.all([getPatient(v.data.patient_id), listVisits(v.data.patient_id), listCatalog(), listInterventionsForVisits([visitId])]);
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
    setLoadError(p.error ?? all.error ?? cat.error ?? recs.error ?? st.error ?? null);
    setLoading(false);
  }, [visitId]);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <LoadingState label="Cargando actuaciones farmacéuticas..." />;
  if (loadError || !visit || !patient) return <ErrorState title="No se pudieron cargar las actuaciones" message={loadError ?? 'Sin datos.'} />;

  const cancelled = visit.status === 'cancelled';
  const recommended = recommendedActions(catalog, priority?.priority ?? null);
  const recommendedCodes = new Set(recommended.map((a) => a.code));
  const others = catalog.filter((a) => a.is_active && !recommendedCodes.has(a.code));
  const activeRecord = (code: string) => records.find((r) => r.catalog_code === code && r.status !== 'discarded') ?? null;
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
      performed_date: status === 'performed' ? date : null, followup_note: null }),
    status === 'performed' ? 'Actuación registrada como realizada.' : 'Actuación registrada como prevista.');

  const actionRow = (a: CatalogAction) => (
    <CatalogRow key={a.code} action={a} record={activeRecord(a.code)} busy={busy === a.code || busy === activeRecord(a.code)?.id}
      disabled={cancelled} defaultDate={visit.visit_date <= todayIso() ? visit.visit_date : todayIso()}
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
        {priority?.priority === 1 ? (
          <Notice tone="warning">
            Catálogo de Prioridad 1 incompleto: la Tabla 7 del modelo no está cargada (copia no legible). Se muestran las actuaciones de las Tablas 5 y 6, que
            el modelo acumula; faltan las específicas de Prioridad 1.
          </Notice>
        ) : null}
        <p className="help-text">
          Catálogo: Tablas 5 (Prioridad 3) y 6 (Prioridad 2) del modelo CMO de coagulopatías (SEFH v2.0), acumulativas. Que una actuación aparezca
          recomendada <strong>no</strong> significa que se haya realizado: solo cuenta lo que registre como «realizada», con su fecha.
        </p>
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        {cancelled ? <Notice tone="warning">Visita anulada: no se registran actuaciones.</Notice> : null}
      </section>

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
            <CustomActions domain={domain} records={records.filter((r) => !r.catalog_code && r.domain === domain)} busy={busy} disabled={cancelled}
              defaultDate={visit.visit_date <= todayIso() ? visit.visit_date : todayIso()}
              onCreate={(text, status, date) => run(`new-${domain}`, () => createIntervention({ visit_id: visit.id, catalog_code: null, custom_text: text.trim(), domain,
                status, performed_date: status === 'performed' ? date : null, followup_note: null }), 'Actuación adicional registrada.')}
              onUpdate={(r, changes, ok) => run(r.id, () => updateIntervention(r, changes), ok)} />
          </section>
        );
      })}

      {records.some((r) => r.status === 'discarded') ? (
        <section className="card" aria-labelledby="int-discarded">
          <h2 id="int-discarded">Registros anulados</h2>
          <ul>{records.filter((r) => r.status === 'discarded').map((r) => <li key={r.id} className="text-muted">{interventionText(r, catalog)}</li>)}</ul>
        </section>
      ) : null}
    </div>
  );
}

type UpdateFn = (r: InterventionRecord, changes: Partial<InterventionRecord>, ok: string) => Promise<boolean>;

function RecordControls({ record, busy, disabled, defaultDate, onUpdate }: { record: InterventionRecord; busy: boolean; disabled: boolean; defaultDate: string; onUpdate: UpdateFn }) {
  const [note, setNote] = useState(record.followup_note ?? '');
  const [date, setDate] = useState(record.performed_date ?? defaultDate);
  return (
    <div className="coamo-int-record">
      <span className="text-strong">{INTERVENTION_STATUS_LABEL[record.status]}{record.performed_date ? ` · ${formatDate(record.performed_date)}` : ''}</span>
      {record.recommended_for_priority === false ? <span className="coamo-field-hint"> · no recomendada para la prioridad vigente al registrarla</span> : null}
      <div className="form-actions">
        {record.status === 'planned' ? (
          <>
            <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} aria-label="Fecha de realización" disabled={disabled || busy} />
            <button type="button" disabled={disabled || busy || !date} onClick={() => void onUpdate(record, { status: 'performed', performed_date: date }, 'Actuación marcada como realizada.')}>Marcar como realizada</button>
          </>
        ) : null}
        <button type="button" className="button-secondary" disabled={disabled || busy}
          onClick={() => { if (window.confirm('¿Anular este registro? Se conserva como anulado y podrá registrarse de nuevo.')) void onUpdate(record, { status: 'discarded' }, 'Registro anulado.'); }}>
          Anular registro
        </button>
      </div>
      <label className="coamo-field-hint" htmlFor={`note-${record.id}`}>Seguimiento / resultado (opcional, sin datos identificativos)</label>
      <textarea id={`note-${record.id}`} rows={2} maxLength={FOLLOWUP_MAX} value={note} disabled={disabled || busy} onChange={(e) => setNote(e.target.value)} style={{ width: '100%' }} />
      {note.trim() !== (record.followup_note ?? '') ? (
        <button type="button" disabled={disabled || busy} onClick={() => void onUpdate(record, { followup_note: note.trim() || null }, 'Seguimiento guardado.')}>Guardar seguimiento</button>
      ) : null}
    </div>
  );
}

function CatalogRow({ action, record, busy, disabled, defaultDate, onRegister, onUpdate }: {
  action: CatalogAction; record: InterventionRecord | null; busy: boolean; disabled: boolean; defaultDate: string;
  onRegister: (status: 'planned' | 'performed', date: string) => Promise<boolean>; onUpdate: UpdateFn;
}) {
  const [date, setDate] = useState(defaultDate);
  return (
    <li className="coamo-int-item" data-code={action.code}>
      <p>{action.action_text} <span className="coamo-source">{action.code} · {action.source_table}</span></p>
      {record ? (
        <RecordControls key={`${record.id}-${record.revision}`} record={record} busy={busy} disabled={disabled} defaultDate={defaultDate} onUpdate={onUpdate} />
      ) : (
        <div className="form-actions">
          <span className="text-muted">Sin registrar</span>
          <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} aria-label={`Fecha de realización de ${action.code}`} disabled={disabled || busy} />
          <button type="button" disabled={disabled || busy || !date} onClick={() => void onRegister('performed', date)}>Registrar como realizada</button>
          <button type="button" className="button-secondary" disabled={disabled || busy} onClick={() => void onRegister('planned', date)}>Prever</button>
        </div>
      )}
    </li>
  );
}

function CustomActions({ domain, records, busy, disabled, defaultDate, onCreate, onUpdate }: {
  domain: InterventionDomain; records: InterventionRecord[]; busy: string | null; disabled: boolean; defaultDate: string;
  onCreate: (text: string, status: 'planned' | 'performed', date: string) => Promise<boolean>; onUpdate: UpdateFn;
}) {
  const [text, setText] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [error, setError] = useState<string | null>(null);
  const submit = async (status: 'planned' | 'performed') => {
    const errors = validateCustomAction(text);
    if (errors.length) { setError(errors.join(' ')); return; }
    setError(null);
    if (await onCreate(text, status, date)) setText('');
  };
  const active = records.filter((r) => r.status !== 'discarded');
  return (
    <div style={{ marginTop: 'var(--sp-3)' }}>
      {active.length > 0 ? (
        <ul className="coamo-int-list">
          {active.map((r) => (
            <li key={r.id} className="coamo-int-item">
              <p>{r.custom_text} <span className="coamo-source">Actuación adicional</span></p>
              <RecordControls key={`${r.id}-${r.revision}`} record={r} busy={busy === r.id} disabled={disabled} defaultDate={defaultDate} onUpdate={onUpdate} />
            </li>
          ))}
        </ul>
      ) : null}
      <details>
        <summary>Añadir actuación adicional (fuera del catálogo)</summary>
        <label htmlFor={`custom-${domain}`} className="visually-hidden">Actuación adicional</label>
        <textarea id={`custom-${domain}`} rows={2} maxLength={CUSTOM_TEXT_MAX + 100} value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} style={{ width: '100%' }} />
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="form-actions">
          <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} aria-label="Fecha de realización de la actuación adicional" disabled={disabled} />
          <button type="button" disabled={disabled || busy === `new-${domain}`} onClick={() => void submit('performed')}>Registrar como realizada</button>
          <button type="button" className="button-secondary" disabled={disabled || busy === `new-${domain}`} onClick={() => void submit('planned')}>Prever</button>
        </div>
      </details>
    </div>
  );
}
