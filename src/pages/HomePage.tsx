import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { PROJECT_IDENTITY } from '../constants/institutional';
import { CENTER_ROLE_LABEL, summarizeCenters, type CoamoCenter } from '../services/centerDisplay';
import { getOwnProfile, listVisibleCenters, type CoamoProfile } from '../services/coamoDataService';

const ROLE_LABEL: Record<CoamoProfile['role'], string> = {
  investigator: 'Investigador/a de centro',
  coordinator: 'Coordinación COAMO',
};

export function HomePage() {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState<CoamoProfile | null>(null);
  const [centers, setCenters] = useState<CoamoCenter[]>([]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [profileResult, centersResult] = await Promise.all([getOwnProfile(), listVisibleCenters()]);
      if (!mounted) return;
      setErrorMessage(profileResult.errorMessage ?? centersResult.errorMessage);
      setProfile(profileResult.data);
      setCenters(centersResult.data);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return <LoadingState label="Cargando..." />;
  if (errorMessage) return <ErrorState title="No se pudieron cargar los datos" message={errorMessage} />;

  const isCoordinator = profile?.role === 'coordinator';
  const summary = summarizeCenters(centers);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={profile ? ROLE_LABEL[profile.role] : undefined}
        title={profile?.full_name ? `Hola, ${profile.full_name}` : PROJECT_IDENTITY.name}
        description={PROJECT_IDENTITY.subtitle}
      />

      <section className="card" aria-labelledby="centers-summary-title">
        <h2 id="centers-summary-title">{isCoordinator ? 'Centros del estudio' : 'Tu centro'}</h2>
        {centers.length === 0 ? (
          <Notice tone="warning">
            Todavía no tienes ningún centro COAMO asignado. Pide a la coordinación que te asigne a tu centro.
          </Notice>
        ) : isCoordinator ? (
          <p>
            {summary.recruiting} centros reclutadores y {summary.consulting} consultor
            {summary.inactive > 0 ? ` (${summary.inactive} inactivos)` : ''}. <Link to="/centers">Ver centros</Link>
          </p>
        ) : (
          <ul>
            {centers.map((center) => (
              <li key={center.id}>
                <strong>{center.name}</strong> · {CENTER_ROLE_LABEL[center.center_role]}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="status-title">
        <h2 id="status-title">Estado de la herramienta</h2>
        <Notice tone="info" title="Versión base: acceso y centros">
          Esta versión permite el acceso seguro y la consulta de centros. Todavía no se pueden registrar pacientes.
        </Notice>
        <p>El registro clínico se incorporará cuando estén aprobados:</p>
        <ul className="coamo-pending-list">
          <li>el modelo CMO adaptado a coagulopatías congénitas (variables, puntuaciones, puntos de corte e intervenciones);</li>
          <li>el cuaderno de recogida de datos (inclusión, visitas basal, seguimiento y final);</li>
          <li>las versiones de los cuestionarios (IEXPAC, EQ-5D-3L, EVASAF y Morisky-Green).</li>
        </ul>
      </section>
    </div>
  );
}
