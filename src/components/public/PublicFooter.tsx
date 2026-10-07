import { PROJECT_IDENTITY, PROJECT_INSTITUTIONAL_REFERENCE } from '../../constants/institutional';

// Los textos legales (aviso legal, privacidad, cookies) se añadirán cuando estén aprobados para COAMO.
export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="public-container public-footer-inner">
        <div>
          <strong>{PROJECT_IDENTITY.name}</strong>
          <p>{PROJECT_IDENTITY.subtitle}.</p>
          {PROJECT_INSTITUTIONAL_REFERENCE.ethicsApprovalCode ? (
            <p className="public-footer-code">{PROJECT_INSTITUTIONAL_REFERENCE.ethicsApprovalCode}</p>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
