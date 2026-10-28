import { PageHeader } from '../components/ui/PageHeader';
import {
  PENDING_LABEL, PROJECT_IDENTITY, PROJECT_INSTITUTIONAL_REFERENCE, getEthicsApprovalDateLabel,
} from '../constants/institutional';

export function ProjectPage() {
  const ref = PROJECT_INSTITUTIONAL_REFERENCE;
  const sessionDate = getEthicsApprovalDateLabel();
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={`${PROJECT_IDENTITY.name} · Proyecto`}
        title="Marco del estudio"
        description="Datos institucionales del estudio tal como figuran en el dictamen del comité de ética."
      />

      <section className="card institutional-block" aria-labelledby="project-title">
        <h2 id="project-title">{PROJECT_IDENTITY.name}</h2>
        <p className="project-title">{PROJECT_IDENTITY.subtitle}</p>
        <dl className="definition-grid">
          <div className="definition-wide">
            <dt>Título de la investigación</dt>
            <dd>{ref.projectTitle}</dd>
          </div>
          <div>
            <dt>Diseño</dt>
            <dd>Estudio observacional multicéntrico</dd>
          </div>
          <div>
            <dt>Promotor</dt>
            <dd>{ref.sponsor ?? PENDING_LABEL}</dd>
          </div>
          <div>
            <dt>Investigador principal</dt>
            <dd>
              {ref.principalInvestigator ?? PENDING_LABEL}
              {ref.principalInvestigatorUnit ? <><br /><span className="cell-muted">{ref.principalInvestigatorUnit}</span></> : null}
            </dd>
          </div>
          <div>
            <dt>Comité de ética</dt>
            <dd>
              {ref.ethicsCommittee ?? PENDING_LABEL}
              {ref.ethicsApprovalCode ? <><br /><span className="numeric nowrap">Nº de registro {ref.ethicsApprovalCode}</span></> : null}
              {ref.ethicsDecision && sessionDate ? <><br /><span className="numeric">{ref.ethicsDecision} · sesión de {sessionDate}</span></> : null}
            </dd>
          </div>
          <div>
            <dt>Documentos aprobados</dt>
            <dd>
              {ref.protocolVersion ?? PENDING_LABEL}
              <br />
              {ref.informedConsentVersion ?? PENDING_LABEL}
            </dd>
          </div>
        </dl>
        <p className="coamo-field-hint" style={{ marginTop: 'var(--sp-4)' }}>
          La HIP/CI aprobada es la de adultos (versión 2 de 25/09/2026): en la inclusión, registra esa versión en «Versión del consentimiento».
          El dictamen identifica el protocolo solo por su fecha.
        </p>
      </section>
    </div>
  );
}
