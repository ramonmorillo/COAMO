import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/StatusBadge';
import { DIAGNOSIS_LABEL, STATUS_LABEL, STATUS_TONE, formatDate, type PatientStatus } from '../domain/study';
import type { CoamoCenter } from '../services/centerDisplay';
import { listVisibleCenters } from '../services/coamoDataService';
import { listPatients, type Patient } from '../services/patientService';

export function PatientsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [centers, setCenters] = useState<CoamoCenter[]>([]);
  const [statusFilter, setStatusFilter] = useState<PatientStatus | 'all'>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [patientsResult, centersResult] = await Promise.all([listPatients(), listVisibleCenters()]);
      if (!mounted) return;
      setError(patientsResult.error ?? centersResult.errorMessage);
      setPatients(patientsResult.data);
      setCenters(centersResult.data);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const centerName = useMemo(() => new Map(centers.map((c) => [c.id, c.name])), [centers]);
  const visible = patients.filter(
    (p) => (statusFilter === 'all' || p.status === statusFilter) && p.study_code.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const canCreate = centers.some((c) => c.is_active && c.center_role === 'recruiting');

  if (loading) return <LoadingState label="Cargando pacientes..." />;
  if (error) return <ErrorState title="No se pudieron cargar los pacientes" message={error} />;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="COAMO"
        title="Pacientes"
        description="Pacientes seudonimizados de tus centros. La correspondencia código-paciente se custodia en el centro."
        actions={canCreate ? <Link className="button-link" to="/patients/new">Nuevo paciente</Link> : undefined}
      />

      {patients.length === 0 ? (
        <EmptyState
          title="Todavía no hay pacientes"
          description={canCreate ? 'Da de alta el primer paciente para iniciar el cribado.' : 'Tu centro no incluye pacientes o aún no tienes centro asignado.'}
        />
      ) : (
        <section className="card">
          <div className="coamo-inline-form">
            <label>
              Buscar por código
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="COAMO-1-0001" />
            </label>
            <label>
              Estado
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as PatientStatus | 'all')}>
                <option value="all">Todos</option>
                {(Object.keys(STATUS_LABEL) as PatientStatus[]).map((status) => (
                  <option key={status} value={status}>{STATUS_LABEL[status]}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="table-wrap" style={{ marginTop: 'var(--sp-4)' }}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Código</th>
                  <th scope="col">Centro</th>
                  <th scope="col">Diagnóstico</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Inclusión</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((patient) => (
                  <tr key={patient.id}>
                    <td className="strong"><Link to={`/patients/${patient.id}`}>{patient.study_code}</Link></td>
                    <td>{centerName.get(patient.center_id) ?? '—'}</td>
                    <td>{DIAGNOSIS_LABEL[patient.diagnosis]}</td>
                    <td><StatusBadge tone={STATUS_TONE[patient.status]} dot>{STATUS_LABEL[patient.status]}</StatusBadge></td>
                    <td>{formatDate(patient.inclusion_date)}</td>
                  </tr>
                ))}
                {visible.length === 0 ? (
                  <tr><td colSpan={5}>Ningún paciente coincide con el filtro.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
