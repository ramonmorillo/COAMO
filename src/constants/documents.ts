// Registro documental del estudio COAMO (sección «Proyecto» → «Documentación y cuestionarios»).
// Jerarquía: 1) documentos aprobados por el CEIm (dictamen 2026-0810-1, 21/10/2026); 2) documentos
// aportados por el IP para su uso en la herramienta; 3) publicaciones. Una publicación NO prevalece sobre el
// protocolo aprobado. Solo se registra lo que consta en los documentos aportados: nada se completa por analogía.
//
// Custodia: los documentos del estudio (protocolo, HIP/CI, memoria) NO se publican en la aplicación ni en el
// repositorio (ambos son públicos: GitHub Pages y GitHub). Se muestran su identificación y estado; el original
// lo custodia el promotor. Su publicación requiere un almacenamiento autenticado (pendiente de decisión).

import type { InstrumentCode } from '../domain/questionnaires/instruments';

export type ApprovalStatus = 'ceim_approved' | 'investigators_decision' | 'not_provided' | 'published';

export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  ceim_approved: 'Aprobado por el CEIm (vigente)',
  investigators_decision: 'En uso por decisión de los investigadores (03/11/2026): sustituye a Morisky-Green del protocolo aprobado',
  not_provided: 'No aportado a la herramienta',
  published: 'Publicación (referencia)',
};

export type StudyDocument = { id: string; title: string; version: string; status: ApprovalStatus; custody: string };

export const STUDY_DOCUMENTS: StudyDocument[] = [
  { id: 'protocol', title: 'Protocolo del estudio', version: 'Protocolo de 30/08/2026 (el dictamen no indica número de versión)', status: 'ceim_approved',
    custody: 'Promotor. No se publica en la aplicación.' },
  { id: 'hip_ci', title: 'Hoja de información al paciente y consentimiento informado (adultos)', version: 'Versión 2 de 25/09/2026', status: 'ceim_approved',
    custody: 'Promotor y centros. El consentimiento firmado se custodia en el centro (fuera de COAMO); en la herramienta solo se registran fecha y versión.' },
  { id: 'memoria', title: 'Memoria del proyecto', version: '—', status: 'not_provided', custody: 'Pendiente de aportar e indicar si es de difusión interna.' },
  { id: 'article', title: 'Artículo del protocolo y anexos', version: '—', status: 'not_provided',
    custody: 'Pendiente de la versión definitiva, su estado editorial y los derechos de distribución.' },
  { id: 'datos_clinicos', title: 'Documento «DATOS CLÍNICOS» (anexo 1 del artículo del protocolo)', version: '—', status: 'not_provided',
    custody: 'Necesario para revisar campo a campo el formulario clínico.' },
];

export type InstrumentLibraryEntry = {
  code: InstrumentCode;
  moments: string;
  status: ApprovalStatus;
  /** Restricciones de reproducción y uso según la documentación aportada. */
  restrictions: string;
  /** Se ofrece versión imprimible generada desde el texto implementado (solo personal autenticado del estudio). */
  printable: boolean;
};

export const INSTRUMENT_LIBRARY: InstrumentLibraryEntry[] = [
  { code: 'IEXPAC', moments: 'V0 (antes de aplicar el modelo CMO) y VF', status: 'ceim_approved',
    restrictions: 'El documento no indica titular de derechos ni condiciones de uso: confirmar con el IP.', printable: true },
  { code: 'EQ5D3L', moments: 'V0 y VF', status: 'ceim_approved',
    restrictions: '© EuroQol Research Foundation. Requiere registro/licencia EuroQol y usar las versiones oficiales (en papel y electrónica): no se genera versión imprimible propia.', printable: false },
  { code: 'EVASAF', moments: 'V0 y VF', status: 'ceim_approved',
    restrictions: 'Encuesta publicada (Farm Hosp 2015). Sin restricciones indicadas en el documento aportado. Versión vigente: documento de 31/10/2026 (con «Comentarios»).', printable: true },
  { code: 'VERITAS_PRN', moments: 'V0 y VF, en pacientes con tratamiento a demanda (orientativo; no se impone)', status: 'investigators_decision',
    restrictions: 'Permiso de uso para el estudio confirmado por los investigadores (03/11/2026). Validación de la versión española no acreditada en la documentación aportada.', printable: true },
  { code: 'VERITAS_PRO', moments: 'V0 y VF, en pacientes con profilaxis (orientativo; no se impone)', status: 'investigators_decision',
    restrictions: 'Permiso de uso para el estudio confirmado por los investigadores (03/11/2026). Validación de la versión española no acreditada en la documentación aportada.', printable: true },
];
