// Identidad institucional de COAMO.
// Fuente: dictamen del CEIm del Hospital Universitario y Politécnico La Fe (sesión de 21/10/2026, nº de
// registro 2026-0810-1), comunicado por el IP el 2026-10-28. Solo se registra lo que figura en el
// dictamen; los campos en null no constan en él. No completar con datos inventados.

export const PROJECT_IDENTITY = {
  name: 'COAMO',
  subtitle: 'Modelo CMO en coagulopatías congénitas',
} as const;

export const PROJECT_INSTITUTIONAL_REFERENCE: {
  /** Título de la investigación tal como figura en el dictamen del comité de ética. */
  projectTitle: string;
  sponsor: string | null;
  principalInvestigator: string | null;
  /** Servicio y centro del IP según el dictamen. */
  principalInvestigatorUnit: string | null;
  ethicsCommittee: string | null;
  /** Nº de registro del proyecto en el CEIm. */
  ethicsApprovalCode: string | null;
  /** Fecha de la sesión en la que el comité evaluó el proyecto (ISO YYYY-MM-DD). */
  ethicsApprovalDate: string | null;
  ethicsDecision: string | null;
  /** Documentos aprobados, tal como los identifica el dictamen. */
  protocolVersion: string | null;
  informedConsentVersion: string | null;
} = {
  projectTitle:
    'COAMO. Evaluación de la experiencia del paciente con coagulopatía congénita en el seguimiento con el Modelo de Atención Farmacéutica Capacidad-Motivación-Oportunidad',
  sponsor: 'Tomás Palanques Pastor',
  principalInvestigator: 'Tomás Palanques Pastor',
  principalInvestigatorUnit: 'Servicio de Farmacia · Hospital Universitari i Politècnic La Fe',
  ethicsCommittee: 'CEIm del Hospital Universitario y Politécnico La Fe',
  ethicsApprovalCode: '2026-0810-1',
  ethicsApprovalDate: '2026-10-21',
  ethicsDecision: 'Informe favorable',
  // El dictamen identifica el protocolo solo por fecha (sin número de versión).
  protocolVersion: 'Protocolo de 30/08/2026',
  informedConsentVersion: 'HIP/CI adultos, versión 2 de 25/09/2026',
};

/** Fecha de la sesión del comité en formato DD/MM/AAAA, o null. */
export function getEthicsApprovalDateLabel(): string | null {
  const iso = PROJECT_INSTITUTIONAL_REFERENCE.ethicsApprovalDate;
  if (!iso) return null;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** «CEIm del Hospital Universitario y Politécnico La Fe · nº 2026-0810-1», o null sin registro. */
export function getEthicsApprovalText(): string | null {
  const { ethicsCommittee, ethicsApprovalCode } = PROJECT_INSTITUTIONAL_REFERENCE;
  if (!ethicsApprovalCode) return null;
  return ethicsCommittee ? `${ethicsCommittee} · nº ${ethicsApprovalCode}` : `nº ${ethicsApprovalCode}`;
}

export const PENDING_LABEL = 'No consta en el dictamen';

const ETHICS_FOOTER = getEthicsApprovalText();

export const PROJECT_SHORT_FOOTER = [
  `${PROJECT_IDENTITY.name} · ${PROJECT_IDENTITY.subtitle} · Estudio observacional multicéntrico`,
  ETHICS_FOOTER ? `Informe favorable del ${ETHICS_FOOTER}` : null,
]
  .filter(Boolean)
  .join(' · ');
