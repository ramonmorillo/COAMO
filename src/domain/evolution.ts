// Evolución farmacéutica por visita: validación y texto para copiar a la historia clínica.
// El texto se genera solo para que el profesional lo revise y lo pegue; COAMO nunca escribe en la historia
// clínica. No incluye identificadores (ni el código seudonimizado del estudio, ni fechas de nacimiento, ni centro).

import { MODALITY_LABEL, VISIT_TYPE_LABEL, formatDate, type Modality, type VisitType } from './study';

export const EVOLUTION_MAX_LENGTH = 8000;

export type EvolutionRecord = {
  visit_id: string;
  evolution_text: string;
  revision: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Mismas reglas que coag_private.enforce_visit_evolution / el check de la tabla. */
export function validateEvolution(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return ['Escribe la evolución antes de guardar (el texto vacío no se guarda).'];
  if (trimmed.length > EVOLUTION_MAX_LENGTH) return [`Máximo ${EVOLUTION_MAX_LENGTH} caracteres (ahora ${trimmed.length}).`];
  return [];
}

export type ClinicalNoteInput = {
  visitType: VisitType;
  visitDate: string;
  modality: Modality;
  evolutionText: string;
  /** Estratificación CMO completada en esa visita (si existe). */
  stratification?: { finalPriority: number | null; modelPriority: number | null; score: number | null; raised: boolean; modelVersion: string | null } | null;
};

/** Texto profesional, sin identificadores, listo para revisar y pegar en la historia clínica. */
export function buildClinicalNote(input: ClinicalNoteInput): string {
  const lines: string[] = [
    'EVOLUCIÓN FARMACÉUTICA — Atención farmacéutica (estudio COAMO, modelo CMO)',
    `Fecha: ${formatDate(input.visitDate)} · ${VISIT_TYPE_LABEL[input.visitType]} · ${MODALITY_LABEL[input.modality]}`,
  ];
  const s = input.stratification;
  if (s && s.finalPriority) {
    const detail = [
      s.score !== null ? `puntuación ${s.score}` : null,
      s.raised && s.modelPriority ? `elevada por criterio farmacéutico desde prioridad ${s.modelPriority}` : null,
      s.modelVersion,
    ].filter(Boolean).join('; ');
    lines.push(`Estratificación CMO: prioridad ${s.finalPriority}${detail ? ` (${detail})` : ''}.`);
  } else {
    lines.push('Estratificación CMO: no completada en esta visita.');
  }
  lines.push('', 'Valoración y evolución:', input.evolutionText.trim());
  return lines.join('\n');
}
