// Indicadores de cumplimiento de cuestionarios para el cuadro de mando. Solo recuentos de
// cumplimentación (nunca puntuaciones agregadas). Los datos de entrada ya llegan filtrados por la RLS:
// investigadores, sus centros; coordinación, todos los centros COAMO.
//
// Definiciones (propuesta técnica, a validar con el IP):
//   · Hueco = instrumento × visita V0/VF registrada y no anulada (5 instrumentos por visita).
//   · Esperado = hueco no marcado «no aplicable».
//   · Visita completa = todos sus huecos «completado» o «no aplicable» (un «no realizado» la deja incompleta).
//   · Emparejado = mismo instrumento completado en V0 y VF.

import { INSTRUMENT_CODES, type InstrumentCode } from './instruments';
import { effectiveStatus, type QuestionnaireAdministration, type StudyVisit } from './administration';
import type { IexpacScores } from './scoring';

export type DashboardVisit = { id: string; patient_id: string; visit_type: string; status: string };
export type DashboardPatient = { id: string; center_id: string };

export type CompletionCounts = {
  patientsWithV0: number;
  patientsWithV0Complete: number;
  patientsWithVF: number;
  patientsWithVFComplete: number;
  expected: number;
  completed: number;
  pendingByVisit: Record<StudyVisit, number>;
  notDone: number;
  pairedAny: number;
  pairedIexpac: number;
};

const empty = (): CompletionCounts => ({
  patientsWithV0: 0, patientsWithV0Complete: 0, patientsWithVF: 0, patientsWithVFComplete: 0,
  expected: 0, completed: 0, pendingByVisit: { V0: 0, VF: 0 }, notDone: 0, pairedAny: 0, pairedIexpac: 0,
});

export function completionPercentage(c: CompletionCounts): number | null {
  return c.expected === 0 ? null : Math.round((c.completed / c.expected) * 1000) / 10;
}

export function questionnaireCompletion(
  patients: DashboardPatient[],
  visits: DashboardVisit[],
  administrations: QuestionnaireAdministration[],
): { total: CompletionCounts; byCenter: Record<string, CompletionCounts> } {
  const total = empty();
  const byCenter: Record<string, CompletionCounts> = {};
  const adminByVisit = new Map<string, Map<InstrumentCode, QuestionnaireAdministration>>();
  for (const a of administrations) {
    if (!adminByVisit.has(a.visit_id)) adminByVisit.set(a.visit_id, new Map());
    adminByVisit.get(a.visit_id)!.set(a.instrument_code, a);
  }

  for (const patient of patients) {
    const counts = (byCenter[patient.center_id] ??= empty());
    const completedBy: Record<StudyVisit, Set<InstrumentCode>> = { V0: new Set(), VF: new Set() };
    let iexpacComplete = { V0: false, VF: false };
    for (const [label, type] of [['V0', 'baseline'], ['VF', 'final']] as const) {
      const visit = visits.find((v) => v.patient_id === patient.id && v.visit_type === type && v.status !== 'cancelled');
      if (!visit) continue;
      const admins = adminByVisit.get(visit.id);
      let resolved = 0;
      for (const target of [total, counts]) {
        if (label === 'V0') target.patientsWithV0 += 1; else target.patientsWithVF += 1;
      }
      for (const code of INSTRUMENT_CODES) {
        const admin = admins?.get(code) ?? null;
        const status = effectiveStatus(admin);
        if (status === 'completed' || status === 'not_applicable') resolved += 1;
        for (const target of [total, counts]) {
          if (status !== 'not_applicable') target.expected += 1;
          if (status === 'completed') target.completed += 1;
          if (status === 'pending' || status === 'in_progress') target.pendingByVisit[label] += 1;
          if (status === 'not_done') target.notDone += 1;
        }
        if (status === 'completed') completedBy[label].add(code);
        if (code === 'IEXPAC' && status === 'completed' && (admin!.scores as IexpacScores).complete) iexpacComplete = { ...iexpacComplete, [label]: true };
      }
      if (resolved === INSTRUMENT_CODES.length) {
        for (const target of [total, counts]) {
          if (label === 'V0') target.patientsWithV0Complete += 1; else target.patientsWithVFComplete += 1;
        }
      }
    }
    const anyPair = [...completedBy.V0].some((code) => completedBy.VF.has(code));
    for (const target of [total, counts]) {
      if (anyPair) target.pairedAny += 1;
      if (iexpacComplete.V0 && iexpacComplete.VF) target.pairedIexpac += 1;
    }
  }
  return { total, byCenter };
}
