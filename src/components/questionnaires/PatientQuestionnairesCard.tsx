import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  effectiveStatus, REASON_LABEL, STATUS_LABEL, STATUS_TONE, studyVisitOf, VISIT_LABEL,
  type QuestionnaireAdministration, type StudyVisit,
} from '../../domain/questionnaires/administration';
import { INSTRUMENTS, INSTRUMENT_CODES, type InstrumentCode } from '../../domain/questionnaires/instruments';
import type { IexpacScores } from '../../domain/questionnaires/scoring';
import { formatScore } from '../../domain/questionnaires/scoring';
import { formatDate } from '../../domain/study';
import { listAdministrationsForVisits } from '../../services/questionnaireService';
import type { Visit } from '../../services/patientService';
import { Notice } from '../ui/Notice';
import { StatusBadge } from '../ui/StatusBadge';

type Props = { patientId: string; visits: Visit[] };

/** Ficha del paciente: «Cuestionarios y resultados comunicados por el paciente» en V0 y VF. */
export function PatientQuestionnairesCard({ patientId, visits }: Props) {
  const studyVisits = visits.filter((v) => (v.visit_type === 'baseline' || v.visit_type === 'final') && v.status !== 'cancelled');
  const byMoment: Partial<Record<StudyVisit, Visit>> = {};
  for (const v of studyVisits) byMoment[studyVisitOf(v.visit_type)!] = v;
  const visitKey = studyVisits.map((v) => v.id).join(',');

  const [admins, setAdmins] = useState<QuestionnaireAdministration[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const result = await listAdministrationsForVisits(visitKey ? visitKey.split(',') : []);
      if (!mounted) return;
      setAdmins(result.data);
      setError(result.error);
    })();
    return () => {
      mounted = false;
    };
  }, [visitKey]);

  const find = (moment: StudyVisit, code: InstrumentCode) => {
    const visit = byMoment[moment];
    return visit ? admins.find((a) => a.visit_id === visit.id && a.instrument_code === code) ?? null : null;
  };

  const cell = (moment: StudyVisit, code: InstrumentCode) => {
    const visit = byMoment[moment];
    if (!visit) return <span className="text-muted">Visita no registrada</span>;
    const admin = find(moment, code);
    const status = effectiveStatus(admin);
    const iexpac = code === 'IEXPAC' && admin?.status === 'completed' ? (admin.scores as IexpacScores) : null;
    return (
      <div className="coamo-q-cell">
        <StatusBadge tone={STATUS_TONE[status]} dot>{STATUS_LABEL[status]}</StatusBadge>
        {iexpac ? <span className="coamo-q-cell-detail">{iexpac.complete ? `Global ${formatScore(iexpac.global_0_10)}` : 'Incompleto: sin global'}</span> : null}
        {admin?.status_reason_code ? <span className="coamo-q-cell-detail">{REASON_LABEL[admin.status_reason_code]}</span> : null}
        {admin?.administration_date ? <span className="coamo-q-cell-detail">{formatDate(admin.administration_date)}</span> : null}
        <Link to={`/visits/${visit.id}/questionnaires/${code}`} aria-label={`${INSTRUMENTS[code].shortName} en ${VISIT_LABEL[moment]}`}>
          {status === 'pending' ? 'Registrar' : 'Abrir'}
        </Link>
      </div>
    );
  };

  return (
    <section className="card" aria-labelledby="questionnaires-title">
      <h2 id="questionnaires-title">Cuestionarios y resultados comunicados por el paciente</h2>
      <p className="help-text">
        Seis instrumentos de los documentos del estudio en la visita basal (V0) y final (VF). Las dos modalidades del EQ-5D-3L
        (autoadministrada y por entrevista) son un único instrumento: se elige la modalidad al registrarlo. Marca como «No aplicable»
        lo que no proceda clínicamente, con su motivo.
      </p>
      {!byMoment.V0 ? <Notice tone="info">Registra la visita basal (realizada o programada) para administrar los cuestionarios de V0.</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="table-wrap" style={{ marginTop: 'var(--sp-3)' }}>
        <table>
          <caption className="visually-hidden">Estado de los cuestionarios por visita</caption>
          <thead>
            <tr>
              <th scope="col">Instrumento</th>
              <th scope="col">{VISIT_LABEL.V0}{byMoment.V0 ? ` · ${formatDate(byMoment.V0.visit_date)}` : ''}</th>
              <th scope="col">{VISIT_LABEL.VF}{byMoment.VF ? ` · ${formatDate(byMoment.VF.visit_date)}` : ''}</th>
            </tr>
          </thead>
          <tbody>
            {INSTRUMENT_CODES.map((code) => (
              <tr key={code} className={INSTRUMENTS[code].primaryEndpoint ? 'coamo-q-primary' : undefined}>
                <th scope="row">
                  <span className="text-strong">{code === 'EQ5D3L' ? 'EQ-5D-3L (autoadministrado o por profesional)' : INSTRUMENTS[code].shortName}</span>
                  {INSTRUMENTS[code].primaryEndpoint ? <span className="coamo-q-tag">Variable principal</span> : null}
                  {!INSTRUMENTS[code].available ? <span className="coamo-q-tag coamo-q-tag-warning">Sin documento fuente</span> : null}
                </th>
                <td>{cell('V0', code)}</td>
                <td>{cell('VF', code)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="form-actions" style={{ marginTop: 'var(--sp-4)' }}>
        <Link className="button-link button-secondary" to={`/patients/${patientId}/questionnaires`}>Evolución de cuestionarios V0–VF</Link>
      </div>
    </section>
  );
}
