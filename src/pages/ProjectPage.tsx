import { Link } from 'react-router-dom';

import { PageHeader } from '../components/ui/PageHeader';
import { APPROVAL_STATUS_LABEL, INSTRUMENT_LIBRARY, STUDY_DOCUMENTS } from '../constants/documents';
import { INSTRUMENTS } from '../domain/questionnaires/instruments';
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
        description="Datos institucionales del estudio tal como figuran en el dictamen del comité de ética, documentación y cuestionarios."
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

      <section className="card" id="documentacion" aria-labelledby="docs-title">
        <h2 id="docs-title">Documentación y cuestionarios</h2>
        <p className="help-text">
          Prevalece la documentación aprobada por el CEIm. Los documentos del estudio no se publican en la aplicación (que es de acceso público
          en Internet aunque los datos estén protegidos): se identifican aquí y los custodia el promotor.
        </p>
        <h3>Documentos del estudio</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th scope="col">Documento</th><th scope="col">Versión y fecha</th><th scope="col">Estado</th><th scope="col">Custodia / disponibilidad</th></tr></thead>
            <tbody>
              {STUDY_DOCUMENTS.map((d) => (
                <tr key={d.id}><th scope="row">{d.title}</th><td>{d.version}</td><td>{APPROVAL_STATUS_LABEL[d.status]}</td><td>{d.custody}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 style={{ marginTop: 'var(--sp-4)' }}>Cuestionarios</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th scope="col">Instrumento y versión</th><th scope="col">Momento</th><th scope="col">Estado</th><th scope="col">Referencia y puntuación</th><th scope="col">Uso y descarga</th></tr></thead>
            <tbody>
              {INSTRUMENT_LIBRARY.map((e) => {
                const def = INSTRUMENTS[e.code];
                return (
                  <tr key={e.code}>
                    <th scope="row">{def.shortName}<br /><span className="cell-muted">{def.source}</span></th>
                    <td>{e.moments}</td>
                    <td>{APPROVAL_STATUS_LABEL[e.status]}</td>
                    <td>
                      {def.reference ?? <span className="cell-muted">El documento aportado no incluye referencia bibliográfica.</span>}
                      <details><summary>Instrucciones de puntuación</summary><p>{def.scoringSummary}</p><p className="cell-muted">{def.directionNote}</p></details>
                    </td>
                    <td>
                      {e.restrictions}
                      <br />
                      {e.printable
                        ? <Link to={`/documents/questionnaires/${e.code}/print`}>Versión imprimible (PDF)</Link>
                        : <span className="cell-muted">Sin versión imprimible propia.</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="coamo-field-hint" style={{ marginTop: 'var(--sp-3)' }}>
          La versión imprimible se genera con el mismo texto del formulario electrónico (no se modifica el instrumento) y se guarda en PDF desde
          «Imprimir». Los originales en Word/PDF aportados por el IP se conservan fuera del repositorio público hasta disponer de un almacén autenticado.
        </p>
      </section>
    </div>
  );
}
