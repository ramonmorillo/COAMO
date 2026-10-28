import { describe, expect, it } from 'vitest';

import {
  addMonths, allowedVisitTypes, buildMonthGrid, filterAgendaVisits, finalWindow, formatLongDate, getAgendaStatus, groupByDate,
  scheduleConflict, shiftMonth, suggestNextFollowup, suggestVisitType, summarizeAgenda, type AgendaVisit,
} from '../src/domain/agenda';
import { visitErrorMessage } from '../src/services/patientService';

const TODAY = '2026-10-28';

function visit(partial: Partial<AgendaVisit> & { id: string }): AgendaVisit {
  return {
    patient_id: 'p1',
    study_code: 'COAMO-1-0001',
    visit_type: 'followup',
    visit_date: TODAY,
    status: 'scheduled',
    modality: 'in_person',
    ...partial,
  };
}

describe('getAgendaStatus', () => {
  it('programada en el pasado = vencida; hoy y futuro, programada', () => {
    expect(getAgendaStatus(visit({ id: 'a', visit_date: '2026-10-27' }), TODAY)).toBe('overdue');
    expect(getAgendaStatus(visit({ id: 'a', visit_date: TODAY }), TODAY)).toBe('scheduled');
    expect(getAgendaStatus(visit({ id: 'a', visit_date: '2026-11-02' }), TODAY)).toBe('scheduled');
  });
  it('el estado registrado manda: realizada, no realizada y anulada no vencen', () => {
    for (const status of ['completed', 'not_done', 'cancelled'] as const) {
      expect(getAgendaStatus(visit({ id: 'a', visit_date: '2026-01-01', status }), TODAY)).toBe(status);
    }
  });
});

describe('fechas', () => {
  it('suma meses como PostgreSQL (fin de mes ajustado al último día)', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-03-15', 12)).toBe('2027-03-15');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
  });
  it('ventana de la visita final: basal + 12 meses ±1 mes (protocolo p. 14)', () => {
    expect(finalWindow('2026-03-31')).toEqual({ due: '2027-03-31', start: '2027-02-28', end: '2027-04-30' });
  });
  it('rejilla mensual de 42 días empezando en lunes', () => {
    const grid = buildMonthGrid('2026-10');
    expect(grid).toHaveLength(42);
    expect(grid[0].iso).toBe('2026-09-28'); // lunes
    expect(grid.filter((d) => d.inMonth)).toHaveLength(31);
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
  it('fecha larga en español', () => {
    expect(formatLongDate('2026-10-28')).toBe('Miércoles, 28 de octubre de 2026');
  });
});

describe('filtros y resumen', () => {
  const visits = [
    visit({ id: '1', visit_date: '2026-10-05', status: 'completed', visit_type: 'baseline' }),
    visit({ id: '2', visit_date: '2026-10-20' }),
    visit({ id: '3', visit_date: '2026-11-03', patient_id: 'p2', study_code: 'COAMO-1-0002' }),
    visit({ id: '4', visit_date: '2026-10-20', status: 'cancelled', patient_id: 'p2', study_code: 'COAMO-1-0002' }),
  ];
  it('filtra por mes, paciente y estado, y ordena por fecha y código', () => {
    expect(filterAgendaVisits(visits, { month: '2026-10', patientId: null, statuses: [] }, TODAY).map((v) => v.id)).toEqual(['1', '2', '4']);
    expect(filterAgendaVisits(visits, { month: null, patientId: 'p2', statuses: [] }, TODAY).map((v) => v.id)).toEqual(['4', '3']);
    expect(filterAgendaVisits(visits, { month: null, patientId: null, statuses: ['overdue'] }, TODAY).map((v) => v.id)).toEqual(['2']);
  });
  it('agrupa por día y resume por estado', () => {
    expect(groupByDate(visits).get('2026-10-20')?.map((v) => v.id)).toEqual(['2', '4']);
    expect(summarizeAgenda(visits, TODAY)).toEqual({ total: 4, scheduled: 1, overdue: 1, completed: 1, not_done: 0, cancelled: 1 });
  });
});

describe('nueva cita: tipos admitidos por la base de datos', () => {
  const baseline = { visit_type: 'baseline' as const, visit_date: '2026-01-15', status: 'completed' as const };
  it('sin basal no anulada solo se admite la basal', () => {
    expect(allowedVisitTypes([])).toEqual(['baseline']);
    expect(allowedVisitTypes([{ ...baseline, status: 'cancelled' }])).toEqual(['baseline']);
    expect(suggestVisitType([], '2026-02-01')).toBe('baseline');
  });
  it('con basal: seguimiento, final (si no existe) y contacto; seguimientos repetibles', () => {
    expect(allowedVisitTypes([baseline])).toEqual(['followup', 'final', 'contact']);
    expect(allowedVisitTypes([baseline, { visit_type: 'final', visit_date: '2027-01-15', status: 'scheduled' }])).toEqual(['followup', 'contact']);
    expect(allowedVisitTypes([baseline, { visit_type: 'final', visit_date: '2027-01-15', status: 'cancelled' }])).toContain('final');
  });
  it('sugiere la final desde el inicio de su ventana (basal + 11 meses)', () => {
    expect(suggestVisitType([baseline], '2026-12-14')).toBe('followup');
    expect(suggestVisitType([baseline], '2026-12-15')).toBe('final');
  });
  it('avisa antes de enviar lo que la BD rechazará', () => {
    expect(scheduleConflict([], 'followup', '2026-02-01')).toMatch(/basal/);
    expect(scheduleConflict([baseline], 'baseline', '2026-02-01')).toMatch(/ya tiene esta visita/);
    expect(scheduleConflict([baseline], 'followup', '2026-01-10')).toMatch(/anterior a la basal/);
    expect(scheduleConflict([baseline], 'followup', '2026-02-10')).toBeNull();
  });
});

describe('periodicidad orientativa según la prioridad CMO', () => {
  const visits = [
    { visit_type: 'baseline' as const, visit_date: '2026-01-15', status: 'completed' as const },
    { visit_type: 'followup' as const, visit_date: '2026-03-10', status: 'completed' as const },
    { visit_type: 'contact' as const, visit_date: '2026-04-01', status: 'completed' as const },
    { visit_type: 'followup' as const, visit_date: '2026-05-01', status: 'scheduled' as const },
  ];
  it('prioridad 1: cada mes desde la última visita evaluativa realizada (los contactos no cuentan)', () => {
    expect(suggestNextFollowup(visits, 1)).toEqual({ kind: 'next', priority: 1, months: 1, fromDate: '2026-03-10', nextDate: '2026-04-10' });
  });
  it('prioridad 2: cada 6 meses', () => {
    expect(suggestNextFollowup(visits, 2)).toMatchObject({ kind: 'next', months: 6, nextDate: '2026-09-10' });
  });
  it('prioridad 3: sin seguimiento intermedio; la siguiente es la final', () => {
    expect(suggestNextFollowup(visits, 3)).toEqual({ kind: 'final_only', priority: 3, finalDue: '2027-01-15' });
  });
  it('sin estratificación completada no se orienta', () => {
    expect(suggestNextFollowup(visits, null)).toEqual({ kind: 'no_priority' });
  });
});

describe('mensajes de la base de datos', () => {
  it('traduce la violación de los índices únicos de basal y final', () => {
    expect(visitErrorMessage('duplicate key value violates unique constraint "uq_coag_visits_one_final"')).toMatch(/ya tiene una visita final/);
    expect(visitErrorMessage('duplicate key value violates unique constraint "uq_coag_visits_one_baseline"')).toMatch(/ya tiene una visita basal/);
    expect(visitErrorMessage('Registre primero la visita basal.')).toBe('Registre primero la visita basal.');
    expect(visitErrorMessage(null)).toBeNull();
  });
});
