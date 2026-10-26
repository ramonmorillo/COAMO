// Derivados de cada instrumento. Espejo exacto de coag_private.questionnaire_scores() (la BD es la
// fuente de verdad de lo guardado; esto sirve para la vista previa mientras se cumplimenta). Ambos se
// prueban con los mismos ejemplos (tests/questionnaireScoring.test.ts y db-tests/70_*).

import { EQ5D_DIMENSIONS, VERITAS_PRN_BLOCKS, type InstrumentCode } from './instruments';

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

export type VeritasPrnScores = {
  items_expected: 24;
  items_answered: number;
  complete: boolean;
  block_items_answered: Record<string, number>;
  scores: null;
  scoring_status: 'scoring_key_not_provided';
};

export type InstrumentScores = IexpacScores | Eq5dScores | EvasafScores | VeritasPrnScores | Record<string, never>;

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

export function veritasPrnScores(responses: Responses): VeritasPrnScores {
  const blocks: Record<string, number> = {};
  VERITAS_PRN_BLOCKS.forEach((block, b) => {
    blocks[block.id] = seq(b * 4 + 1, b * 4 + 4).filter((n) => has(responses, q(n))).length;
  });
  const answered = seq(1, 24).filter((n) => has(responses, q(n))).length;
  return {
    items_expected: 24,
    items_answered: answered,
    complete: answered === 24,
    block_items_answered: blocks,
    scores: null,
    scoring_status: 'scoring_key_not_provided',
  };
}

export function computeScores(code: InstrumentCode, responses: Responses, applicability: Applicability = {}): InstrumentScores {
  switch (code) {
    case 'IEXPAC': return iexpacScores(responses, applicability);
    case 'EQ5D3L': return eq5dScores(responses);
    case 'EVASAF': return evasafScores(responses);
    case 'VERITAS_PRN': return veritasPrnScores(responses);
    case 'VERITAS_PRO': return {};
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
    case 'VERITAS_PRN': return (scores as VeritasPrnScores).complete === true;
    case 'VERITAS_PRO': return false;
  }
}

/** Formato español con 2 decimales para la interfaz (el dato guardado conserva 4). */
export function formatScore(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toFixed(decimals).replace('.', ',');
}
