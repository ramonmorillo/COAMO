import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { completionPercentage, questionnaireCompletion, type CompletionCounts } from '../../domain/questionnaires/dashboard';
import { loadStudyQuestionnaireData } from '../../services/questionnaireService';
import { Notice } from '../ui/Notice';

const IN_FOLLOWUP = ['included', 'withdrawn', 'lost_to_followup', 'completed'];

/** Indicadores de cumplimiento (solo recuentos; nunca puntuaciones agregadas). Ámbito = RLS. */
export function QuestionnaireCompletionCard({ isCoordinator }: { isCoordinator: boolean }) {
  const [state, setState] = useState<{ total: CompletionCounts; rows: Array<{ name: string; counts: CompletionCounts }> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const { data, error: loadError } = await loadStudyQuestionnaireData();
      if (!mounted) return;
      const patients = data.patients.filter((p) => IN_FOLLOWUP.includes(p.status));
      const { total, byCenter } = questionnaireCompletion(patients, data.visits, data.administrations);
      const rows = data.centers
        .filter((c) => byCenter[c.id])
        .map((c) => ({ name: c.name, counts: byCenter[c.id] }))
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));
      setState({ total, rows });
      setError(loadError);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (error) return <section className="card"><h2>Cuestionarios</h2><Notice tone="danger">{error}</Notice></section>;
  if (!state) return null;
  const { total, rows } = state;
  const pct = completionPercentage(total);

  return (
    <section className="card" aria-labelledby="q-dashboard-title">
      <h2 id="q-dashboard-title">Cumplimiento de cuestionarios {isCoordinator ? '· todos los centros' : '· tu ámbito'}</h2>
      {total.patientsWithV0 === 0 ? (
        <Notice tone="info">Sin visitas basales registradas todavía.</Notice>
      ) : (
        <>
          <dl className="metric-grid metric-grid-4">
            <div className="metric"><dt className="metric-label">Pacientes con V0 completa</dt><dd className="metric-value">{total.patientsWithV0Complete}<span className="metric-unit">/ {total.patientsWithV0}</span></dd></div>
            <div className="metric"><dt className="metric-label">Pacientes con VF completa</dt><dd className="metric-value">{total.patientsWithVFComplete}<span className="metric-unit">/ {total.patientsWithVF}</span></dd></div>
            <div className="metric"><dt className="metric-label">Cuestionarios completados</dt><dd className="metric-value">{pct === null ? '—' : `${String(pct).replace('.', ',')} %`}</dd>
              <dd className="metric-hint">{total.completed} de {total.expected} esperados (excluye «no aplicable»)</dd></div>
            <div className="metric"><dt className="metric-label">Pares V0/VF IEXPAC completos</dt><dd className="metric-value">{total.pairedIexpac}</dd>
              <dd className="metric-hint">Con algún instrumento emparejado: {total.pairedAny}</dd></div>
          </dl>
          <p className="help-text" style={{ marginTop: 'var(--sp-3)' }}>
            Pendientes o en curso: V0 {total.pendingByVisit.V0} · VF {total.pendingByVisit.VF} · No realizados: {total.notDone}.
            Visita completa = todos sus instrumentos completados o «no aplicable».
          </p>
          {rows.length > 1 ? (
            <div className="table-wrap" style={{ marginTop: 'var(--sp-3)' }}>
              <table>
                <caption className="visually-hidden">Cumplimiento por centro</caption>
                <thead><tr><th scope="col">Centro</th><th scope="col">V0 completas</th><th scope="col">VF completas</th><th scope="col">% completados</th><th scope="col">Pendientes V0 / VF</th><th scope="col">Pares IEXPAC</th></tr></thead>
                <tbody>
                  {rows.map(({ name, counts }) => {
                    const p = completionPercentage(counts);
                    return (
                      <tr key={name}>
                        <th scope="row">{name}</th>
                        <td className="numeric">{counts.patientsWithV0Complete} / {counts.patientsWithV0}</td>
                        <td className="numeric">{counts.patientsWithVFComplete} / {counts.patientsWithVF}</td>
                        <td className="numeric">{p === null ? '—' : `${String(p).replace('.', ',')} %`}</td>
                        <td className="numeric">{counts.pendingByVisit.V0} / {counts.pendingByVisit.VF}</td>
                        <td className="numeric">{counts.pairedIexpac}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
      <p style={{ marginTop: 'var(--sp-3)' }}><Link to="/questionnaires/export">Exportar cuestionarios (CSV)</Link></p>
    </section>
  );
}
