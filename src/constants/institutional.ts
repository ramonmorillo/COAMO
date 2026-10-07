// Identidad institucional de COAMO.
// Los datos institucionales pendientes (promotor, IP, código CEIm) dependen de documentos aprobados:
// no completar con datos inventados; dejar en null hasta disponer de la fuente.

export const PROJECT_IDENTITY = {
  name: 'COAMO',
  subtitle: 'Modelo CMO en coagulopatías congénitas',
} as const;

export const PROJECT_INSTITUTIONAL_REFERENCE: {
  projectTitle: string;
  sponsor: string | null;
  principalInvestigator: string | null;
  ethicsApprovalCode: string | null;
} = {
  projectTitle: `${PROJECT_IDENTITY.name} · ${PROJECT_IDENTITY.subtitle}`,
  sponsor: null,
  principalInvestigator: null,
  ethicsApprovalCode: null,
};

export const PROJECT_SHORT_FOOTER = `${PROJECT_IDENTITY.name} · ${PROJECT_IDENTITY.subtitle} · Estudio observacional multicéntrico`;
