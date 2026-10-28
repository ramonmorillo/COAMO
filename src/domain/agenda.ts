// Agenda COAMO = visitas de coag_visits situadas en el calendario. No existe tabla de citas propia:
// una cita es una visita con status = 'scheduled' en su fecha (visit_date). Al realizarla se cambia el
// estado a «Realizada» y, si procede, la fecha a la real (ficha del paciente).
// Lógica pura (sin red) para poder probarla.

import type { StatusTone } from '../components/ui/StatusBadge';
import type { Priority } from './stratification';
import type { PatientStatus, VisitStatus, VisitType } from './study';

export type AgendaVisit = {
  id: string;
  patient_id: string;
  study_code: string | null;
  visit_type: VisitType;
  visit_date: string;
  status: VisitStatus;
  modality: string;
};

export type AgendaStatus = 'scheduled' | 'overdue' | 'completed' | 'not_done' | 'cancelled';

export const AGENDA_STATUS_ORDER: AgendaStatus[] = ['scheduled', 'overdue', 'completed', 'not_done', 'cancelled'];

export const AGENDA_STATUS_LABEL: Record<AgendaStatus, string> = {
  scheduled: 'Programada',
  overdue: 'Programada vencida',
  completed: 'Realizada',
  not_done: 'No realizada',
  cancelled: 'Anulada',
};

export const AGENDA_STATUS_TONE: Record<AgendaStatus, StatusTone> = {
  scheduled: 'info',
  overdue: 'warning',
  completed: 'positive',
  not_done: 'danger',
  cancelled: 'neutral',
};

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WEEKDAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Fecha local en formato ISO (YYYY-MM-DD), sin desplazamiento por zona horaria. */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/**
 * Suma meses de calendario como PostgreSQL (date + interval 'n months'): si el día no existe en el mes
 * de destino se usa el último día de ese mes (31/01 + 1 mes = 28/02 o 29/02).
 */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, lastDay));
  return toIsoDate(target);
}

/** Clave de mes YYYY-MM. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  return toIsoDate(new Date(y, m - 1 + delta, 1)).slice(0, 7);
}

export function formatMonthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function formatLongDate(iso: string): string {
  const date = parseIsoDate(iso);
  return `${WEEKDAY_NAMES[date.getDay()]}, ${date.getDate()} de ${MONTH_NAMES[date.getMonth()].toLowerCase()} de ${date.getFullYear()}`;
}

/**
 * Estado de seguimiento: el estado registrado manda; una visita programada cuya fecha ya ha pasado sin
 * registrar su realización figura como «programada vencida» (hoy no está vencida).
 */
export function getAgendaStatus(visit: Pick<AgendaVisit, 'status' | 'visit_date'>, todayIso: string): AgendaStatus {
  if (visit.status === 'scheduled') return visit.visit_date.slice(0, 10) < todayIso ? 'overdue' : 'scheduled';
  return visit.status;
}

export type CalendarDay = { iso: string; inMonth: boolean };

/** Rejilla de 6 semanas (42 días) empezando en lunes, para el mes `key` (YYYY-MM). */
export function buildMonthGrid(key: string): CalendarDay[] {
  const [y, m] = key.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const offset = (first.getDay() + 6) % 7; // lunes = 0
  const start = toIsoDate(new Date(y, m - 1, 1 - offset));
  return Array.from({ length: 42 }, (_, i) => {
    const iso = addDays(start, i);
    return { iso, inMonth: monthKey(iso) === key };
  });
}

export type AgendaFilters = {
  /** YYYY-MM; null = sin restricción de periodo. */
  month: string | null;
  /** null = todos los pacientes. */
  patientId: string | null;
  /** Estados incluidos; vacío = todos. */
  statuses: AgendaStatus[];
};

const TYPE_ORDER: Record<VisitType, number> = { baseline: 0, followup: 1, final: 2, contact: 3 };

export function compareAgendaVisits(a: AgendaVisit, b: AgendaVisit): number {
  return a.visit_date.localeCompare(b.visit_date)
    || (a.study_code ?? '').localeCompare(b.study_code ?? '')
    || TYPE_ORDER[a.visit_type] - TYPE_ORDER[b.visit_type]
    || a.id.localeCompare(b.id);
}

export function filterAgendaVisits(visits: AgendaVisit[], filters: AgendaFilters, todayIso: string): AgendaVisit[] {
  return visits
    .filter((visit) => {
      if (filters.patientId && visit.patient_id !== filters.patientId) return false;
      if (filters.month && monthKey(visit.visit_date) !== filters.month) return false;
      if (filters.statuses.length > 0 && !filters.statuses.includes(getAgendaStatus(visit, todayIso))) return false;
      return true;
    })
    .sort(compareAgendaVisits);
}

export function groupByDate(visits: AgendaVisit[]): Map<string, AgendaVisit[]> {
  const map = new Map<string, AgendaVisit[]>();
  for (const visit of visits) {
    const date = visit.visit_date.slice(0, 10);
    map.set(date, [...(map.get(date) ?? []), visit]);
  }
  return map;
}

export type AgendaSummary = Record<AgendaStatus, number> & { total: number };

export function summarizeAgenda(visits: AgendaVisit[], todayIso: string): AgendaSummary {
  const summary: AgendaSummary = { total: 0, scheduled: 0, overdue: 0, completed: 0, not_done: 0, cancelled: 0 };
  for (const visit of visits) {
    summary[getAgendaStatus(visit, todayIso)] += 1;
    summary.total += 1;
  }
  return summary;
}

// ── Nueva cita: tipos permitidos y sugerencias ────────────────────────────────

type PatientVisit = Pick<AgendaVisit, 'visit_type' | 'visit_date' | 'status'>;

const isActive = (visit: Pick<AgendaVisit, 'status'>) => visit.status !== 'cancelled';

/**
 * Tipos que la base de datos admite para una nueva visita del paciente (mismas reglas que la ficha):
 * sin basal activa, solo la basal; con basal, seguimiento, contacto y la final si aún no existe
 * (índices únicos uq_coag_visits_one_baseline / one_final; seguimientos y contactos se repiten).
 */
export function allowedVisitTypes(patientVisits: PatientVisit[]): VisitType[] {
  const hasBaseline = patientVisits.some((v) => v.visit_type === 'baseline' && isActive(v));
  const hasFinal = patientVisits.some((v) => v.visit_type === 'final' && isActive(v));
  if (!hasBaseline) return ['baseline'];
  return hasFinal ? ['followup', 'contact'] : ['followup', 'final', 'contact'];
}

/** Fecha esperada y ventana de la visita final: basal + 12 meses ±1 mes (protocolo p. 14). */
export function finalWindow(baselineDate: string): { due: string; start: string; end: string } {
  return { due: addMonths(baselineDate, 12), start: addMonths(baselineDate, 11), end: addMonths(baselineDate, 13) };
}

/**
 * Tipo sugerido para una cita en `dateIso` (editable): la basal si falta; la final si la fecha cae a
 * partir del inicio de su ventana y aún no existe; si no, seguimiento.
 */
export function suggestVisitType(patientVisits: PatientVisit[], dateIso: string): VisitType {
  const allowed = allowedVisitTypes(patientVisits);
  if (allowed.includes('baseline')) return 'baseline';
  const baseline = patientVisits.find((v) => v.visit_type === 'baseline' && isActive(v));
  if (baseline && allowed.includes('final') && dateIso >= finalWindow(baseline.visit_date).start) return 'final';
  return 'followup';
}

/** Mensaje si la fecha propuesta contradice una regla que la BD rechazará (o null). */
export function scheduleConflict(patientVisits: PatientVisit[], type: VisitType, dateIso: string): string | null {
  if (!allowedVisitTypes(patientVisits).includes(type)) {
    return type === 'baseline' || type === 'final'
      ? 'El paciente ya tiene esta visita (no anulada): ábrela en la ficha para reprogramarla o anúlala antes de crear otra.'
      : 'Registra primero la visita basal.';
  }
  const baseline = patientVisits.find((v) => v.visit_type === 'baseline' && isActive(v));
  if (type !== 'baseline' && baseline && dateIso < baseline.visit_date) return `La visita no puede ser anterior a la basal (${baseline.visit_date}).`;
  return null;
}

/** Meses entre valoraciones según la prioridad CMO (modelo CMO pp. 18-19; protocolo p. 15). */
export const FOLLOWUP_MONTHS: Record<Priority, number | null> = { 1: 1, 2: 6, 3: null };

export type FollowupSuggestion =
  | { kind: 'no_priority' }
  | { kind: 'final_only'; priority: Priority; finalDue: string | null }
  | { kind: 'next'; priority: Priority; months: number; fromDate: string; nextDate: string };

/**
 * Próxima valoración orientativa: prioridad de la estratificación completada más reciente y fecha de la
 * última visita evaluativa realizada (basal, seguimiento o final). Prioridad 3: sin seguimiento intermedio,
 * la siguiente es la visita final. Es una orientación; la decisión es del profesional.
 */
export function suggestNextFollowup(
  patientVisits: PatientVisit[],
  latestPriority: Priority | null,
): FollowupSuggestion {
  if (!latestPriority) return { kind: 'no_priority' };
  const baseline = patientVisits.find((v) => v.visit_type === 'baseline' && isActive(v));
  const months = FOLLOWUP_MONTHS[latestPriority];
  if (months === null) return { kind: 'final_only', priority: latestPriority, finalDue: baseline ? finalWindow(baseline.visit_date).due : null };
  const last = patientVisits
    .filter((v) => v.status === 'completed' && v.visit_type !== 'contact')
    .map((v) => v.visit_date)
    .sort()
    .pop();
  if (!last) return { kind: 'no_priority' };
  return { kind: 'next', priority: latestPriority, months, fromDate: last, nextDate: addMonths(last, months) };
}

/** Pacientes a los que se puede dar cita (la BD solo admite visitas de pacientes incluidos). */
export function canSchedule(status: PatientStatus): boolean {
  return status === 'included';
}
