import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { PROJECT_IDENTITY } from '../constants/institutional';
import {
  AGENDA_STATUS_LABEL, AGENDA_STATUS_ORDER, AGENDA_STATUS_TONE, addDays, allowedVisitTypes, buildMonthGrid, canSchedule,
  filterAgendaVisits, formatLongDate, formatMonthLabel, getAgendaStatus, groupByDate, monthKey, scheduleConflict, shiftMonth,
  suggestNextFollowup, suggestVisitType, summarizeAgenda, toIsoDate, type AgendaStatus, type AgendaVisit,
} from '../domain/agenda';
import type { Priority } from '../domain/stratification';
import { MODALITY_LABEL, VISIT_TYPE_LABEL, formatDate, type Modality, type VisitType } from '../domain/study';
import { createVisit, listAgendaVisits, listLatestPriorities, listPatients, type Patient } from '../services/patientService';

const WEEKDAY_HEADERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
type Period = 'month' | 'all';

// Tono del contador de un día: lo pendiente de actuar manda sobre lo ya cerrado.
function dayTone(statuses: AgendaStatus[]): AgendaStatus {
  for (const status of ['overdue', 'scheduled', 'not_done', 'completed'] as AgendaStatus[]) {
    if (statuses.includes(status)) return status;
  }
  return 'cancelled';
}

function parseStatuses(raw: string | null): AgendaStatus[] {
  if (!raw) return [];
  return raw.split(',').filter((s): s is AgendaStatus => (AGENDA_STATUS_ORDER as string[]).includes(s));
}

export function AgendaPage() {
  const todayIso = toIsoDate(new Date());
  const [searchParams, setSearchParams] = useSearchParams();

  // Filtros en la URL: permiten enlazar la agenda de un paciente y conservar la vista al recargar.
  const month = /^\d{4}-\d{2}$/.test(searchParams.get('month') ?? '') ? (searchParams.get('month') as string) : monthKey(todayIso);
  const patientFilter = searchParams.get('patient') || null;
  const period: Period = searchParams.get('period') === 'all' ? 'all' : 'month';
  const statusParam = searchParams.get('status');
  const statuses = useMemo(() => parseStatuses(statusParam), [statusParam]);

  const [visits, setVisits] = useState<AgendaVisit[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [priorities, setPriorities] = useState<Record<string, Priority>>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayIso);

  const [newPatientId, setNewPatientId] = useState('');
  const [newVisitType, setNewVisitType] = useState<VisitType>('baseline');
  const [newModality, setNewModality] = useState<Modality>('in_person');
  const [creating, setCreating] = useState(false);
  const [createMessage, setCreateMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  function updateParams(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next, { replace: true });
  }

  async function loadAgenda() {
    const [visitsResult, patientsResult] = await Promise.all([listAgendaVisits(), listPatients()]);
    const prioritiesResult = await listLatestPriorities(visitsResult.data);
    setVisits(visitsResult.data);
    setPatients([...patientsResult.data].sort((a, b) => a.study_code.localeCompare(b.study_code)));
    setPriorities(prioritiesResult.data);
    setErrorMessage(visitsResult.error ?? patientsResult.error ?? prioritiesResult.error);
    setLoading(false);
  }

  useEffect(() => {
    void loadAgenda();
  }, []);

  const schedulable = useMemo(() => patients.filter((p) => canSchedule(p.status)), [patients]);

  // El paciente filtrado se propone por defecto al crear una cita (si admite visitas).
  useEffect(() => {
    if (patientFilter && schedulable.some((p) => p.id === patientFilter)) setNewPatientId(patientFilter);
  }, [patientFilter, schedulable]);

  const visitsByPatient = useMemo(() => {
    const map = new Map<string, AgendaVisit[]>();
    for (const visit of visits) map.set(visit.patient_id, [...(map.get(visit.patient_id) ?? []), visit]);
    return map;
  }, [visits]);

  const newPatientVisits = newPatientId ? (visitsByPatient.get(newPatientId) ?? []) : [];

  useEffect(() => {
    if (newPatientId) setNewVisitType(suggestVisitType(visitsByPatient.get(newPatientId) ?? [], selectedDate));
  }, [newPatientId, visitsByPatient, selectedDate]);

  // Calendario: filtros de paciente y estado, sin restricción de periodo (la rejilla ya acota el mes).
  const calendarVisits = useMemo(
    () => filterAgendaVisits(visits, { month: null, patientId: patientFilter, statuses }, todayIso),
    [visits, patientFilter, statuses, todayIso],
  );
  const byDate = useMemo(() => groupByDate(calendarVisits), [calendarVisits]);
  const grid = useMemo(() => buildMonthGrid(month), [month]);
  const dayVisits = byDate.get(selectedDate) ?? [];

  // Listado imprimible: mes visible o todo el seguimiento.
  const listVisits = useMemo(
    () => calendarVisits.filter((visit) => period === 'all' || monthKey(visit.visit_date) === month),
    [calendarVisits, period, month],
  );
  const summary = summarizeAgenda(listVisits, todayIso);

  const patientLabel = patientFilter ? (patients.find((p) => p.id === patientFilter)?.study_code ?? 'Paciente') : 'Todos los pacientes';
  const periodLabel = period === 'all' ? 'Todo el seguimiento' : formatMonthLabel(month);
  const statusLabel = statuses.length > 0 ? statuses.map((s) => AGENDA_STATUS_LABEL[s]).join(', ') : 'Todos los estados';

  const allowed = newPatientId ? allowedVisitTypes(newPatientVisits) : [];
  const conflict = newPatientId ? scheduleConflict(newPatientVisits, newVisitType, selectedDate) : null;
  const followup = newPatientId ? suggestNextFollowup(newPatientVisits, priorities[newPatientId] ?? null) : null;

  function selectDate(iso: string) {
    setSelectedDate(iso);
    setCreateMessage(null);
    if (monthKey(iso) !== month) updateParams({ month: monthKey(iso) });
  }

  function toggleStatus(status: AgendaStatus) {
    const next = statuses.includes(status) ? statuses.filter((s) => s !== status) : [...statuses, status];
    updateParams({ status: next.length > 0 ? AGENDA_STATUS_ORDER.filter((s) => next.includes(s)).join(',') : null });
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!newPatientId || conflict) return;
    setCreating(true);
    setCreateMessage(null);
    const result = await createVisit({
      patient_id: newPatientId,
      visit_type: newVisitType,
      visit_date: selectedDate,
      status: 'scheduled',
      modality: newModality,
      is_scheduled: true,
    });
    setCreating(false);
    if (result.error) {
      setCreateMessage({ tone: 'danger', text: result.error });
      return;
    }
    const code = patients.find((p) => p.id === newPatientId)?.study_code ?? '';
    setCreateMessage({ tone: 'success', text: `Cita creada: ${code} · ${VISIT_TYPE_LABEL[newVisitType]} · ${formatDate(selectedDate)}.` });
    await loadAgenda();
  }

  if (loading) return <LoadingState label="Cargando agenda..." />;
  if (errorMessage) return <ErrorState title="No se pudo cargar la agenda" message={errorMessage} />;

  return (
    <div className="page-stack agenda-page">
      <PageHeader
        eyebrow={`${PROJECT_IDENTITY.name} · Agenda`}
        title="Agenda"
        description="Visitas programadas y realizadas por día. Las citas se crean como visitas programadas del paciente; al realizarlas se actualizan en su ficha."
        actions={
          <button type="button" className="button-secondary no-print" onClick={() => window.print()}>
            Imprimir listado
          </button>
        }
      />

      <section className="card agenda-filters no-print" aria-label="Filtros de la agenda">
        <div className="agenda-filter-row">
          <label>
            Paciente
            <select value={patientFilter ?? ''} onChange={(e) => updateParams({ patient: e.target.value || null })}>
              <option value="">Todos los pacientes</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>{p.study_code}</option>
              ))}
            </select>
          </label>
          <label>
            Periodo del listado
            <select value={period} onChange={(e) => updateParams({ period: e.target.value === 'all' ? 'all' : null })}>
              <option value="month">Mes visible ({formatMonthLabel(month)})</option>
              <option value="all">Todo el seguimiento</option>
            </select>
          </label>
          <fieldset className="agenda-status-filter">
            <legend>Estado</legend>
            {AGENDA_STATUS_ORDER.map((status) => (
              <label key={status} className="agenda-check">
                <input type="checkbox" checked={statuses.includes(status)} onChange={() => toggleStatus(status)} />
                {AGENDA_STATUS_LABEL[status]}
              </label>
            ))}
          </fieldset>
          {patientFilter || statuses.length > 0 || period === 'all' ? (
            <button type="button" className="button-ghost" onClick={() => updateParams({ patient: null, status: null, period: null })}>
              Limpiar filtros
            </button>
          ) : null}
        </div>
      </section>

      <div className="agenda-layout no-print">
        <section className="card agenda-calendar" aria-label="Calendario mensual">
          <div className="agenda-calendar-head">
            <button type="button" className="button-ghost agenda-nav" aria-label="Mes anterior" onClick={() => updateParams({ month: shiftMonth(month, -1) })}>‹</button>
            <h2>{formatMonthLabel(month)}</h2>
            <button type="button" className="button-ghost agenda-nav" aria-label="Mes siguiente" onClick={() => updateParams({ month: shiftMonth(month, 1) })}>›</button>
          </div>
          <div className="agenda-grid" role="grid">
            {WEEKDAY_HEADERS.map((d) => (
              <span key={d} className="agenda-weekday" role="columnheader">{d}</span>
            ))}
            {grid.map((day) => {
              const entries = byDate.get(day.iso) ?? [];
              const tone = entries.length > 0 ? dayTone(entries.map((v) => getAgendaStatus(v, todayIso))) : null;
              const classes = [
                'agenda-day',
                day.inMonth ? '' : 'is-outside',
                day.iso === todayIso ? 'is-today' : '',
                day.iso === selectedDate ? 'is-selected' : '',
              ].filter(Boolean).join(' ');
              return (
                <button
                  key={day.iso}
                  type="button"
                  className={classes}
                  onClick={() => selectDate(day.iso)}
                  aria-pressed={day.iso === selectedDate}
                  aria-label={`${formatLongDate(day.iso)}${entries.length ? `, ${entries.length} ${entries.length === 1 ? 'visita' : 'visitas'}` : ''}`}
                >
                  {Number(day.iso.slice(8, 10))}
                  {tone ? <span className={`agenda-count agenda-count-${tone}`}>{entries.length}</span> : null}
                </button>
              );
            })}
          </div>
          <ul className="agenda-legend" aria-label="Leyenda">
            {AGENDA_STATUS_ORDER.map((status) => (
              <li key={status}><span className={`agenda-legend-dot agenda-count-${status}`} aria-hidden="true" />{AGENDA_STATUS_LABEL[status]}</li>
            ))}
          </ul>
        </section>

        <section className="card agenda-day-panel" aria-label="Visitas del día">
          <div className="agenda-day-head">
            <button type="button" className="button-ghost agenda-nav" aria-label="Día anterior" onClick={() => selectDate(addDays(selectedDate, -1))}>‹</button>
            <button type="button" className="button-secondary" onClick={() => selectDate(todayIso)}>Hoy</button>
            <button type="button" className="button-ghost agenda-nav" aria-label="Día siguiente" onClick={() => selectDate(addDays(selectedDate, 1))}>›</button>
            <h2>{formatLongDate(selectedDate)}</h2>
          </div>

          {dayVisits.length === 0 ? (
            <p className="help-text">No hay citas para este día{patientFilter || statuses.length ? ' con los filtros aplicados' : ''}.</p>
          ) : (
            <ul className="agenda-day-list">
              {dayVisits.map((visit) => {
                const status = getAgendaStatus(visit, todayIso);
                return (
                  <li key={visit.id}>
                    <div>
                      <Link to={`/patients/${visit.patient_id}`} className="agenda-day-code">{visit.study_code ?? 'Paciente'}</Link>
                      <span className="cell-muted"> · {VISIT_TYPE_LABEL[visit.visit_type]} · {MODALITY_LABEL[visit.modality as Modality] ?? visit.modality}</span>
                    </div>
                    <div className="agenda-day-actions">
                      <StatusBadge tone={AGENDA_STATUS_TONE[status]} dot>{AGENDA_STATUS_LABEL[status]}</StatusBadge>
                      <Link to={`/patients/${visit.patient_id}`}>Abrir ficha</Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <form className="agenda-create" onSubmit={handleCreate}>
            <h3>Crear cita para este día</h3>
            <div className="agenda-create-row">
              <label>
                <span className="visually-hidden">Paciente</span>
                <select value={newPatientId} onChange={(e) => { setNewPatientId(e.target.value); setCreateMessage(null); }}>
                  <option value="">Seleccionar paciente incluido</option>
                  {schedulable.map((p) => (
                    <option key={p.id} value={p.id}>{p.study_code}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="visually-hidden">Tipo de visita</span>
                <select value={newVisitType} onChange={(e) => setNewVisitType(e.target.value as VisitType)} disabled={!newPatientId}>
                  {(newPatientId ? allowed : (['baseline'] as VisitType[])).map((type) => (
                    <option key={type} value={type}>{VISIT_TYPE_LABEL[type]}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="visually-hidden">Modalidad</span>
                <select value={newModality} onChange={(e) => setNewModality(e.target.value as Modality)} disabled={!newPatientId}>
                  {(Object.keys(MODALITY_LABEL) as Modality[]).map((m) => <option key={m} value={m}>{MODALITY_LABEL[m]}</option>)}
                </select>
              </label>
              <button type="submit" disabled={!newPatientId || Boolean(conflict) || creating}>{creating ? 'Creando...' : 'Crear cita'}</button>
            </div>
            {newPatientId ? (
              <p className="help-text">
                Tipo sugerido según las visitas ya registradas y la ventana de la visita final (basal + 12 meses ±1 mes).
                {selectedDate < todayIso ? ' La fecha seleccionada es anterior a hoy: la cita figurará como vencida hasta registrar su realización.' : ''}
              </p>
            ) : null}
            {followup && followup.kind === 'next' ? (
              <p className="help-text">
                Prioridad {followup.priority} (última estratificación completada): valoración cada {followup.months === 1 ? 'mes' : `${followup.months} meses`}.
                Próxima orientativa: <strong>{formatDate(followup.nextDate)}</strong> (desde la visita realizada de {formatDate(followup.fromDate)}).{' '}
                <button type="button" className="button-link-inline" onClick={() => selectDate(followup.nextDate)}>Ir a esa fecha</button>
              </p>
            ) : null}
            {followup && followup.kind === 'final_only' ? (
              <p className="help-text">
                Prioridad 3: sin visita de seguimiento intermedia. La siguiente es la visita final{followup.finalDue ? ` (esperada el ${formatDate(followup.finalDue)})` : ''}.
              </p>
            ) : null}
            {newPatientId && followup?.kind === 'no_priority' ? (
              <p className="help-text">Sin estratificación CMO completada: no se puede orientar la periodicidad del seguimiento.</p>
            ) : null}
            {conflict ? <Notice tone="warning">{conflict}</Notice> : null}
            {createMessage ? <Notice tone={createMessage.tone}>{createMessage.text}</Notice> : null}
          </form>
        </section>
      </div>

      <section className="card agenda-print-area" aria-label="Listado de seguimiento">
        <div className="print-only agenda-print-header">
          <strong>{PROJECT_IDENTITY.name} · Listado de seguimiento</strong>
          <span>Impreso el {formatDate(todayIso)}</span>
        </div>
        <div className="section-heading">
          <div>
            <h2>Listado de seguimiento</h2>
            <p className="section-description">
              {patientLabel} · {periodLabel} · {statusLabel}
            </p>
          </div>
          <div className="agenda-summary">
            <span><strong>{summary.total}</strong> visitas</span>
            {AGENDA_STATUS_ORDER.map((status) => (
              <StatusBadge key={status} tone={AGENDA_STATUS_TONE[status]}>
                {AGENDA_STATUS_LABEL[status]}: {summary[status]}
              </StatusBadge>
            ))}
          </div>
        </div>

        {listVisits.length === 0 ? (
          <p className="help-text">No hay visitas con los filtros aplicados.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Paciente</th>
                  <th>Visita</th>
                  <th>Modalidad</th>
                  <th>Estado</th>
                  <th>Prioridad CMO vigente</th>
                  <th className="no-print"><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {listVisits.map((visit) => {
                  const status = getAgendaStatus(visit, todayIso);
                  return (
                    <tr key={visit.id}>
                      <td className="numeric">{formatDate(visit.visit_date)}</td>
                      <td className="strong">{visit.study_code ?? '—'}</td>
                      <td>{VISIT_TYPE_LABEL[visit.visit_type]}</td>
                      <td>{MODALITY_LABEL[visit.modality as Modality] ?? visit.modality}</td>
                      <td><StatusBadge tone={AGENDA_STATUS_TONE[status]}>{AGENDA_STATUS_LABEL[status]}</StatusBadge></td>
                      <td>{priorities[visit.patient_id] ? `Prioridad ${priorities[visit.patient_id]}` : '—'}</td>
                      <td className="no-print">
                        <Link to={`/patients/${visit.patient_id}`}>Abrir</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="help-text">
          «Programada vencida»: visita en estado «Programada» cuya fecha es anterior a hoy. Para cerrarla, cambia su estado en la ficha
          del paciente (Realizada, No realizada o Anulada) y corrige la fecha si se realizó otro día. «Prioridad CMO vigente»: la de la
          estratificación completada más reciente del paciente.
        </p>
      </section>
    </div>
  );
}
