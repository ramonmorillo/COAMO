import { useEffect, useState } from 'react';

import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { CENTER_ROLE_LABEL, patientCodePrefix, type CoamoCenter } from '../services/centerDisplay';
import { countMembershipsByCenter, getOwnProfile, listVisibleCenters } from '../services/coamoDataService';

export function CentersPage() {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [centers, setCenters] = useState<CoamoCenter[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [isCoordinator, setIsCoordinator] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [profileResult, centersResult, countsResult] = await Promise.all([
        getOwnProfile(),
        listVisibleCenters(),
        countMembershipsByCenter(),
      ]);
      if (!mounted) return;
      setErrorMessage(profileResult.errorMessage ?? centersResult.errorMessage ?? countsResult.errorMessage);
      setIsCoordinator(profileResult.data?.role === 'coordinator');
      setCenters(centersResult.data);
      setMemberCounts(countsResult.data);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return <LoadingState label="Cargando centros..." />;
  if (errorMessage) return <ErrorState title="No se pudieron cargar los centros" message={errorMessage} />;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="COAMO"
        title="Centros"
        description={isCoordinator ? 'Todos los centros del estudio.' : 'Los centros a los que estás asignado/a.'}
      />

      {centers.length === 0 ? (
        <EmptyState
          title="Sin centros asignados"
          description="Pide a la coordinación del estudio que te asigne a tu centro."
        />
      ) : (
        <section className="card">
          <div className="coamo-table-wrap">
            <table className="coamo-center-table">
              <thead>
                <tr>
                  <th scope="col">Centro</th>
                  <th scope="col">Función</th>
                  <th scope="col">Código de paciente</th>
                  {isCoordinator ? <th scope="col">Profesionales</th> : null}
                  {isCoordinator ? <th scope="col">Estado</th> : null}
                </tr>
              </thead>
              <tbody>
                {centers.map((center) => {
                  const prefix = patientCodePrefix(center);
                  return (
                    <tr key={center.id}>
                      <td>
                        <strong>{center.name}</strong>
                        <br />
                        <code>{center.code}</code>
                      </td>
                      <td>{CENTER_ROLE_LABEL[center.center_role]}</td>
                      <td>{prefix ? <code>{prefix}NNNN</code> : '—'}</td>
                      {isCoordinator ? <td>{memberCounts[center.id] ?? 0}</td> : null}
                      {isCoordinator ? <td>{center.is_active ? 'Activo' : 'Inactivo'}</td> : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {isCoordinator ? (
            <Notice tone="warning" title="Datos provisionales">
              Los nombres, códigos internos y números de centro se cargaron a partir del resumen del protocolo y deben
              verificarse con la denominación oficial. Pueden corregirse mientras el centro no tenga pacientes.
            </Notice>
          ) : null}
        </section>
      )}
    </div>
  );
}
