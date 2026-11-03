// Derivados de cada instrumento. Espejo exacto de coag_private.questionnaire_scores() (la BD es la
// fuente de verdad de lo guardado; esto sirve para la vista previa mientras se cumplimenta). Ambos se
// prueban con los mismos ejemplos (tests/questionnaireScoring.test.ts y db-tests/70_*).

import { EQ5D_DIMENSIONS, VERITAS_PRN_BLOCKS, VERITAS_PRO_BLOCKS, type InstrumentCode } from './instruments';

export type Responses = Record<string, number>;
export type Applicability = Record<string, boolean>;

export type IexpacScores = {
  items_expected: 11;
  items_answered: number;
  complete: boolean;
  sum: number | null;
  global_0_10: number | null;
  conditional_applicable: number;
  conditional_answered: number;
};

export type Eq5dScores = {
  dimensions_answered: number;
  profile_complete: boolean;
  profile: string | null;
  vas: number | null;
  utility_index: null;
  utility_index_status: 'no_approved_value_set';
};

export type EvasafScores = { items_expected: 10; items_answered: number; complete: boolean; summary_score: null; summary_score_status: 'no_approved_rule' };

export type VeritasScores = {
  items_expected: 24;
  items_answered: number;
  complete: boolean;
  block_items_answered: Record<string, number>;
  /** Puntuación de cada ítem respondido (1 = máxima adherencia … 5 = mínima), ya invertidos según la clave. */
  item_scores: Record<string, number>;
  /** Suma de los 24 ítems (24 = máxima adherencia … 120 = mínima). Solo con los 24 respondidos; sin imputación. */
  total: number | null;
  total_min: 24;
  total_max: 120;
  direction: 'lower_is_more_adherent';
  scoring_status: 'scored' | 'incomplete_no_total';
  /** El documento de puntuación aportado solo define el total: no se calculan subescalas. */
  subscale_scores: null;
  subscale_status: 'not_defined_in_scoring_document';
};

/** VERITAS-PRN y VERITAS-Pro comparten estructura (6 bloques × 4 ítems) ; difieren en la clave (ítems invertidos). */
export type VeritasPrnScores = VeritasScores;
export type VeritasProScores = VeritasScores;

export type InstrumentScores = IexpacScores | Eq5dScores | EvasafScores | VeritasScores | Record<string, never>;

const has = (responses: Responses, key: string) => Object.prototype.hasOwnProperty.call(responses, key) && Number.isInteger(responses[key]);
const q = (n: number) => `q${n}`;
const seq = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

export function iexpacScores(responses: Responses, applicability: Applicability): IexpacScores {
  const answered = seq(1, 11).filter((n) => has(responses, q(n)));
  const complete = answered.length === 11;
  const sum = complete ? answered.reduce((total, n) => total + responses[q(n)], 0) : null;
  return {
    items_expected: 11,
    items_answered: answered.length,
    complete,
    sum,
    // Protocolo p. 10. Redondeo a 4 decimales, igual que la BD; la interfaz muestra 2.
    global_0_10: sum === null ? null : Math.round(((10 * (sum - 11)) / 44) * 10000) / 10000,
    conditional_applicable: seq(12, 15).filter((n) => applicability[q(n)] === true).length,
    conditional_answered: seq(12, 15).filter((n) => has(responses, q(n))).length,
  };
}

export function eq5dScores(responses: Responses): Eq5dScores {
  const answered = EQ5D_DIMENSIONS.filter((d) => has(responses, d));
  const complete = answered.length === 5;
  return {
    dimensions_answered: answered.length,
    profile_complete: complete,
    profile: complete ? EQ5D_DIMENSIONS.map((d) => String(responses[d])).join('') : null,
    vas: has(responses, 'vas') ? responses.vas : null,
    utility_index: null,
    utility_index_status: 'no_approved_value_set',
  };
}

export function evasafScores(responses: Responses): EvasafScores {
  const answered = seq(1, 10).filter((n) => has(responses, q(n))).length;
  return { items_expected: 10, items_answered: answered, complete: answered === 10, summary_score: null, summary_score_status: 'no_approved_rule' };
}

/**
 * Clave de puntuación de los documentos «VERITAS-PRN puntuación» y «VERITAS-Pro puntuación» (IP, 03/11/2026;
 * Duncan et al., Haemophilia 2010). La respuesta guardada es el código de posición (1 Siempre … 5 Nunca);
 * en los ítems invertidos (redactados en sentido de no adherencia) el documento puntúa Siempre = 5 … Nunca = 1.
 * Versión del algoritmo: VERITAS_SCORING_VERSION. Comprobado contra los documentos en tests/questionnaireScoring.test.ts.
 */
export const VERITAS_SCORING_VERSION = 'coamo-q-2';
export const VERITAS_REVERSED_ITEMS: Record<'VERITAS_PRN' | 'VERITAS_PRO', number[]> = {
  VERITAS_PRN: [6, 7, 12, 13, 17, 19, 20, 23],
  VERITAS_PRO: [6, 7, 11, 13, 14, 16, 17, 18, 19, 20, 23],
};

/** Puntuación de un ítem VERITAS a partir del código de posición guardado (1-5). */
export function veritasItemScore(code: 'VERITAS_PRN' | 'VERITAS_PRO', item: number, positionCode: number): number {
  return VERITAS_REVERSED_ITEMS[code].includes(item) ? 6 - positionCode : positionCode;
}

function veritasScores(code: 'VERITAS_PRN' | 'VERITAS_PRO', blockDefs: Array<{ id: string }>, responses: Responses): VeritasScores {
  const blocks: Record<string, number> = {};
  blockDefs.forEach((block, b) => {
    blocks[block.id] = seq(b * 4 + 1, b * 4 + 4).filter((n) => has(responses, q(n))).length;
  });
  const answered = seq(1, 24).filter((n) => has(responses, q(n)));
  const itemScores: Record<string, number> = {};
  for (const n of answered) itemScores[q(n)] = veritasItemScore(code, n, responses[q(n)]);
  const complete = answered.length === 24;
  return {
    items_expected: 24,
    items_answered: answered.length,
    complete,
    block_items_answered: blocks,
    item_scores: itemScores,
    total: complete ? answered.reduce((sum, n) => sum + itemScores[q(n)], 0) : null,
    total_min: 24,
    total_max: 120,
    direction: 'lower_is_more_adherent',
    scoring_status: complete ? 'scored' : 'incomplete_no_total',
    subscale_scores: null,
    subscale_status: 'not_defined_in_scoring_document',
  };
}

export const veritasPrnScores = (responses: Responses): VeritasPrnScores => veritasScores('VERITAS_PRN', VERITAS_PRN_BLOCKS, responses);
export const veritasProScores = (responses: Responses): VeritasProScores => veritasScores('VERITAS_PRO', VERITAS_PRO_BLOCKS, responses);

export function computeScores(code: InstrumentCode, responses: Responses, applicability: Applicability = {}): InstrumentScores {
  switch (code) {
    case 'IEXPAC': return iexpacScores(responses, applicability);
    case 'EQ5D3L': return eq5dScores(responses);
    case 'EVASAF': return evasafScores(responses);
    case 'VERITAS_PRN': return veritasPrnScores(responses);
    case 'VERITAS_PRO': return veritasProScores(responses);
  }
}

/** Respondidos / esperados para la barra de progreso (los condicionados aplicables suman al esperado). */
export function progress(code: InstrumentCode, coreItems: string[], responses: Responses, applicability: Applicability): { answered: number; expected: number } {
  let expected = coreItems.length;
  let answered = coreItems.filter((item) => has(responses, item)).length;
  if (code === 'IEXPAC') {
    for (const n of seq(12, 15)) {
      if (applicability[q(n)] === true) {
        expected += 1;
        if (has(responses, q(n))) answered += 1;
      }
    }
  }
  return { answered, expected };
}

/** ¿Instrumento completo (sin ítems esenciales ausentes)? */
export function isComplete(code: InstrumentCode, scores: InstrumentScores): boolean {
  switch (code) {
    case 'IEXPAC': return (scores as IexpacScores).complete === true;
    case 'EQ5D3L': return (scores as Eq5dScores).profile_complete === true && (scores as Eq5dScores).vas !== null;
    case 'EVASAF': return (scores as EvasafScores).complete === true;
    case 'VERITAS_PRN':
    case 'VERITAS_PRO': return (scores as VeritasScores).complete === true;
  }
}

/** Versión del algoritmo de puntuación que fija la BD para cada instrumento (espejo de la migración). */
export function scoringVersion(code: InstrumentCode): string {
  return code === 'VERITAS_PRN' || code === 'VERITAS_PRO' ? VERITAS_SCORING_VERSION : 'coamo-q-1';
}

/** Formato español con 2 decimales para la interfaz (el dato guardado conserva 4). */
export function formatScore(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toFixed(decimals).replace('.', ',');
}
