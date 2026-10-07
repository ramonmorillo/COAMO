import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { YesNoField } from '../components/forms/YesNoField';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import {
  DIAGNOSIS_LABEL, EXCLUSION_CRITERIA, INCLUSION_CRITERIA, MODALITY_LABEL, QUESTIONNAIRE_SUPPORT_LABEL, REASONS_FOR,
  SEX_LABEL, STATUS_LABEL, STATUS_REASON_LABEL, STATUS_TONE, VISIT_STATUS_LABEL, VISIT_TYPE_LABEL,
  daysBetween, formatDate, inclusionGaps, todayIso,
  type InclusionRecord, type Modality, type QuestionnaireSupport, type StatusReason, type VisitStatus, type VisitType,
} from '../domain/study';
import type { CoamoCenter } from '../services/centerDisplay';
import { listVisibleCenters } from '../services/coamoDataService';
import {
  createVisit, getInclusion, getPatient, getSchedule, listVisits, saveInclusion, updatePatientStatus, updateVisit,
  type Patient, type Schedule, type Visit,
} from '../services/patientService';

type ExitStatus = 'not_included' | 'withdrawn' | 'lost_to_followup';

export function PatientDetailPage() {
  const { id = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [center, setCenter] = useState<CoamoCenter | null>(null);
  const [inclusion, setInclusion] = useState<InclusionRecord | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [schedule, setSchedule] = useState<Schedule | null>(null);

  const load = useCallback(async () => {
    const [p, inc, v, s, c] = await Promise.all([getPatient(id), getInclusion(id), listVisits(id), getSchedule(id), listVisibleCenters()]);
    setError(p.error ?? inc.error ?? v.error ?? s.error ?? c.errorMessage);
    setPatient(p.data);
    setInclusion(inc.data);
    setVisits(v.data);
    setSchedule(s.data);
    setCenter(c.data.find((x) => x.id === p.data?.center_id) ?? null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState label="Cargando paciente..." />;
  if (error) return <ErrorState title="No se pudo cargar el paciente" message={error} />;
  if (!patient) return <ErrorState title="Paciente no encontrado" message="No existe o no tienes acceso a su centro." />;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={center?.name ?? 'Paciente'}
        title={patient.study_code}
        description={`${DIAGNOSIS_LABEL[patient.diagnosis]} · ${patient.sex ? SEX_LABEL[patient.sex] : 'Sexo sin registrar'} · ${patient.age_at_inclusion ?? '—'} años`}
        actions={<StatusBadge tone={STATUS_TONE[patient.status]} dot>{STATUS_LABEL[patient.status]}</StatusBadge>}
      />

      {patient.status_reason ? (
        <Notice tone="info">Motivo: {STATUS_REASON_LABEL[patient.status_reason]}</Notice>
      ) : null}

      {inclusion ? (
        <InclusionCard patient={patient} initial={inclusion} onChanged={load} />
      ) : null}

      {patient.status !== 'screening' && patient.status !== 'not_included' ? (
        <>
          <ScheduleCard schedule={schedule} />
          <VisitsCard patient={patient} visits={visits} onChanged={load} />
        </>
      ) : null}

      <StatusActions patient={patient} visits={visits} onChanged={load} />
    </div>
  );
}

// ── Inclusión: criterios y consentimiento ─────────────────────────────────────

function InclusionCard({ patient, initial, onChanged }: { patient: Patient; initial: InclusionRecord; onChanged: () => Promise<void> }) {
  const [record, setRecord] = useState<InclusionRecord>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const editable = patient.status === 'screening';
  const gaps = inclusionGaps(record, patient);

  const set = <K extends keyof InclusionRecord>(key: K, value: InclusionRecord[K]) => setRecord((r) => ({ ...r, [key]: value }));

  const save = async (): Promise<boolean> => {
    setSaving(true);
    const result = await saveInclusion(patient.id, { ...record, consent_version: record.consent_version?.trim() || null });
    setSaving(false);
    if (result.error) {
      setMessage({ tone: 'danger', text: result.error });
      return false;
    }
    setMessage({ tone: 'success', text: 'Evaluación guardada.' });
    return true;
  };

  const include = async () => {
    if (!(await save())) return;
    const result = await updatePatientStatus(patient.id, 'included');
    if (result.error) {
      setMessage({ tone: 'danger', text: result.error });
      return;
    }
    await onChanged();
  };

  return (
    <section className="card" aria-labelledby="inclusion-title">
      <h2 id="inclusion-title">Elegibilidad y consentimiento <span className="coamo-source">Protocolo p. 9</span></h2>
      {!editable ? (
        <Notice tone="info">Evaluación cerrada al cambiar el estado del paciente. Las correcciones las realiza la coordinación.</Notice>
      ) : null}
      <div className="form-grid" style={{ marginTop: 'var(--sp-3)' }}>
        <p className="form-block-title">Criterios de inclusión (deben cumplirse todos)</p>
        <div className="coamo-criteria">
          {INCLUSION_CRITERIA.map((c) => (
            <YesNoField key={c.key} name={c.key} label={c.label} value={record[c.key] as boolean | null}
              onChange={(v) => set(c.key, v as never)} disabled={!editable} yesLabel="Cumple" noLabel="No cumple" />
          ))}
        </div>
        <p className="form-block-title">Criterios de exclusión (no debe darse ninguno)</p>
        <div className="coamo-criteria">
          {EXCLUSION_CRITERIA.map((c) => (
            <YesNoField key={c.key} name={c.key} label={c.label} value={record[c.key] as boolean | null}
              onChange={(v) => set(c.key, v as never)} disabled={!editable} yesLabel="Presente" noLabel="Ausente" />
          ))}
        </div>
        <p className="form-block-title">Consentimiento y cuestionarios</p>
        <div className="grid-2">
          <label>
            Fecha del consentimiento escrito
            <input type="date" value={record.consent_date ?? ''} max={todayIso()} disabled={!editable}
              onChange={(e) => set('consent_date', e.target.value || null)} />
          </label>
          <label>
            Versión del consentimiento
            <input value={record.consent_version ?? ''} maxLength={40} disabled={!editable} placeholder="p. ej., v1.0"
              onChange={(e) => set('consent_version', e.target.value)} />
          </label>
          <label>
            Cumplimentación de cuestionarios
            <select value={record.questionnaire_support ?? ''} disabled={!editable}
              onChange={(e) => set('questionnaire_support', (e.target.value || null) as QuestionnaireSupport | null)}>
              <option value="">Sin registrar</option>
              {(Object.keys(QUESTIONNAIRE_SUPPORT_LABEL) as QuestionnaireSupport[]).map((k) => (
                <option key={k} value={k}>{QUESTIONNAIRE_SUPPORT_LABEL[k]}</option>
              ))}
            </select>
          </label>
        </div>
        <YesNoField name="verified" label="Criterios verificados en la historia clínica" value={record.verified_in_clinical_record}
          onChange={(v) => set('verified_in_clinical_record', v)} disabled={!editable}
          hint="El protocolo exige que el cumplimiento de los criterios conste en la historia clínica." />

        {editable ? (
          gaps.length > 0 ? (
            <Notice tone="warning" title="Aún no se puede incluir">
              <ul className="coamo-gap-list">{gaps.map((g) => <li key={g}>{g}</li>)}</ul>
            </Notice>
          ) : (
            <Notice tone="success">Cumple todos los criterios: puede incluirse en el estudio.</Notice>
          )
        ) : null}
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        {editable ? (
          <div className="form-actions">
            <button type="button" className="button-secondary" onClick={() => void save()} disabled={saving}>Guardar evaluación</button>
            <button type="button" onClick={() => void include()} disabled={saving || gaps.length > 0}>Incluir en el estudio</button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

// ── Calendario: ventana de la visita final ────────────────────────────────────

function ScheduleCard({ schedule }: { schedule: Schedule | null }) {
  if (!schedule?.baseline_date) {
    return (
      <section className="card">
        <h2>Calendario</h2>
        <Notice tone="info">Registra la visita basal para calcular la fecha de la visita final (12 meses ±1 mes).</Notice>
      </section>
    );
  }
  const today = todayIso();
  const daysToDue = schedule.final_due_date ? daysBetween(today, schedule.final_due_date) : null;
  return (
    <section className="card" aria-labelledby="schedule-title">
      <h2 id="schedule-title">Calendario <span className="coamo-source">Protocolo p. 14 · 12 meses ±1 mes</span></h2>
      <dl className="coamo-keyvalues">
        <div><dt>Visita basal</dt><dd>{formatDate(schedule.baseline_date)}</dd></div>
        <div><dt>Final esperada</dt><dd>{formatDate(schedule.final_due_date)}</dd></div>
        <div><dt>Ventana</dt><dd>{formatDate(schedule.final_window_start)} – {formatDate(schedule.final_window_end)}</dd></div>
        <div>
          <dt>Visita final</dt>
          <dd>
            {schedule.final_date ? `${formatDate(schedule.final_date)} · ${VISIT_STATUS_LABEL[schedule.final_status ?? 'scheduled']}` : 'Sin registrar'}
          </dd>
        </div>
      </dl>
      {schedule.final_date && schedule.final_in_window === false ? (
        <Notice tone="warning">
          La visita final está fuera de la ventana ({schedule.final_deviation_days! > 0 ? '+' : ''}{schedule.final_deviation_days} días respecto a la fecha esperada).
          Se conserva la fecha real.
        </Notice>
      ) : null}
      {!schedule.final_date && daysToDue !== null && daysToDue <= 30 ? (
        <Notice tone={daysToDue < -30 ? 'danger' : 'warning'}>
          {daysToDue >= 0 ? `La visita final corresponde en ${daysToDue} días.` : `La fecha esperada de la visita final pasó hace ${-daysToDue} días.`}
        </Notice>
      ) : null}
    </section>
  );
}

// ── Visitas y contactos ───────────────────────────────────────────────────────

function VisitsCard({ patient, visits, onChanged }: { patient: Patient; visits: Visit[]; onChanged: () => Promise<void> }) {
  const hasBaseline = visits.some((v) => v.visit_type === 'baseline' && v.status !== 'cancelled');
  const hasFinal = visits.some((v) => v.visit_type === 'final' && v.status !== 'cancelled');
  const allowedTypes: VisitType[] = hasBaseline ? (hasFinal ? ['followup', 'contact'] : ['followup', 'final', 'contact']) : ['baseline'];
  const [type, setType] = useState<VisitType>(allowedTypes[0]);
  const [date, setDate] = useState(todayIso());
  const [status, setStatus] = useState<VisitStatus>('completed');
  const [modality, setModality] = useState<Modality>('in_person');
  const [scheduled, setScheduled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canAdd = patient.status === 'included';

  useEffect(() => {
    if (!allowedTypes.includes(type)) setType(allowedTypes[0]);
  }, [allowedTypes, type]);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const result = await createVisit({ patient_id: patient.id, visit_type: type, visit_date: date, status, modality, is_scheduled: scheduled });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    await onChanged();
  };

  const changeStatus = async (visit: Visit, next: VisitStatus) => {
    const result = await updateVisit(visit.id, { status: next });
    if (result.error) setError(result.error);
    await onChanged();
  };

  return (
    <section className="card" aria-labelledby="visits-title">
      <h2 id="visits-title">Visitas y contactos</h2>
      {visits.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Fecha</th><th>Tipo</th><th>Modalidad</th><th>Programada</th><th>Estado</th><th>Datos</th></tr>
            </thead>
            <tbody>
              {visits.map((v) => (
                <tr key={v.id}>
                  <td>{formatDate(v.visit_date)}</td>
                  <td className="strong">{VISIT_TYPE_LABEL[v.visit_type]}</td>
                  <td>{MODALITY_LABEL[v.modality]}</td>
                  <td>{v.is_scheduled ? 'Sí' : 'No'}</td>
                  <td>
                    {canAdd ? (
                      <select value={v.status} onChange={(e) => void changeStatus(v, e.target.value as VisitStatus)} aria-label="Estado de la visita">
                        {(Object.keys(VISIT_STATUS_LABEL) as VisitStatus[]).map((s) => <option key={s} value={s}>{VISIT_STATUS_LABEL[s]}</option>)}
                      </select>
                    ) : VISIT_STATUS_LABEL[v.status]}
                  </td>
                  <td>
                    {(v.visit_type === 'baseline' || v.visit_type === 'final') && v.status === 'completed' ? (
                      <Link to={`/visits/${v.id}/clinical`}>Datos clínicos</Link>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Notice tone="info">Sin visitas registradas. Empieza por la visita basal.</Notice>
      )}

      {canAdd ? (
        <form onSubmit={add} className="form-grid" style={{ marginTop: 'var(--sp-4)' }}>
          <p className="form-block-title">Registrar visita o contacto</p>
          <div className="coamo-inline-form">
            <label>
              Tipo
              <select value={type} onChange={(e) => setType(e.target.value as VisitType)}>
                {allowedTypes.map((t) => <option key={t} value={t}>{VISIT_TYPE_LABEL[t]}</option>)}
              </select>
            </label>
            <label>
              Fecha
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <label>
              Estado
              <select value={status} onChange={(e) => setStatus(e.target.value as VisitStatus)}>
                <option value="completed">Realizada</option>
                <option value="scheduled">Programada</option>
              </select>
            </label>
            <label>
              Modalidad
              <select value={modality} onChange={(e) => setModality(e.target.value as Modality)}>
                {(Object.keys(MODALITY_LABEL) as Modality[]).map((m) => <option key={m} value={m}>{MODALITY_LABEL[m]}</option>)}
              </select>
            </label>
            <label>
              ¿Programada?
              <select value={scheduled ? 'yes' : 'no'} onChange={(e) => setScheduled(e.target.value === 'yes')}>
                <option value="yes">Programada</option>
                <option value="no">No programada</option>
              </select>
            </label>
          </div>
          {error ? <ErrorState title="No se pudo registrar" message={error} /> : null}
          <div className="form-actions">
            <button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Registrar'}</button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

// ── Cambios de estado del paciente ────────────────────────────────────────────

function StatusActions({ patient, visits, onChanged }: { patient: Patient; visits: Visit[]; onChanged: () => Promise<void> }) {
  const [exit, setExit] = useState<ExitStatus | ''>('');
  const [reason, setReason] = useState<StatusReason | ''>('');
  const [error, setError] = useState<string | null>(null);

  const exits: ExitStatus[] = patient.status === 'screening' ? ['not_included'] : patient.status === 'included' ? ['withdrawn', 'lost_to_followup'] : [];
  const finalDone = visits.some((v) => v.visit_type === 'final' && v.status === 'completed');
  if (exits.length === 0) return null;

  const apply = async (status: ExitStatus | 'completed', why: StatusReason | null) => {
    const message = status === 'completed'
      ? '¿Marcar el seguimiento como completado?'
      : `¿Confirmas el cambio a «${STATUS_LABEL[status]}»? No se puede deshacer desde la aplicación.`;
    if (!window.confirm(message)) return;
    const result = await updatePatientStatus(patient.id, status, why);
    if (result.error) {
      setError(result.error);
      return;
    }
    await onChanged();
  };

  return (
    <section className="card" aria-labelledby="status-title">
      <h2 id="status-title">Estado en el estudio</h2>
      {patient.status === 'included' && finalDone ? (
        <div className="form-actions">
          <button type="button" onClick={() => void apply('completed', null)}>Marcar seguimiento completado</button>
        </div>
      ) : null}
      <div className="coamo-inline-form" style={{ marginTop: 'var(--sp-3)' }}>
        <label>
          Salida del estudio
          <select value={exit} onChange={(e) => { setExit(e.target.value as ExitStatus | ''); setReason(''); }}>
            <option value="">Selecciona…</option>
            {exits.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        {exit ? (
          <label>
            Motivo
            <select value={reason} onChange={(e) => setReason(e.target.value as StatusReason | '')}>
              <option value="">Selecciona…</option>
              {REASONS_FOR[exit].map((r) => <option key={r} value={r}>{STATUS_REASON_LABEL[r]}</option>)}
            </select>
          </label>
        ) : null}
        {exit ? (
          <button type="button" className="button-secondary" disabled={!reason} onClick={() => void apply(exit, reason as StatusReason)}>
            Aplicar
          </button>
        ) : null}
      </div>
      <p className="coamo-field-hint" style={{ marginTop: 'var(--sp-3)' }}>Motivos provisionales: el protocolo no los define. Pendiente de validación por el IP.</p>
      {error ? <ErrorState title="No se pudo cambiar el estado" message={error} /> : null}
    </section>
  );
}
