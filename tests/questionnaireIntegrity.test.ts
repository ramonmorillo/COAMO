// Integridad de preguntas y opciones frente a los documentos originales. Los textos de referencia
// (tests/fixtures/source/*.txt) se extraen de los .docx del IP con scripts/extract-docx-text.py.
// Cada texto digital debe aparecer LITERALMENTE en su documento y en el mismo orden.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  EQ5D_VAS_SCALE, EQ5D_VAS_TEXT, INSTRUMENTS, INSTRUMENT_CODES, VERITAS_PRN_BLOCKS, instrumentItems, instrumentVersion, itemRange,
} from '../src/domain/questionnaires/instruments';

const norm = (text: string) => text.replace(/\s+/g, ' ').trim();
const source = (name: string) => norm(readFileSync(resolve(__dirname, 'fixtures/source', `${name}.txt`), 'utf8'));

/** Comprueba presencia literal y orden creciente de una lista de fragmentos. */
function expectInOrder(doc: string, fragments: string[]) {
  let cursor = 0;
  for (const fragment of fragments) {
    const at = doc.indexOf(norm(fragment), cursor);
    expect(at, `no encontrado (o fuera de orden): «${fragment}»`).toBeGreaterThanOrEqual(0);
    cursor = at + norm(fragment).length;
  }
}

describe('IEXPAC frente al documento', () => {
  const doc = source('iexpac');
  const items = instrumentItems('IEXPAC');

  it('15 ítems: 11 generales y 4 condicionados (12-15)', () => {
    expect(items.map((i) => i.number)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(items.filter((i) => i.condition).map((i) => i.code)).toEqual(['q12', 'q13', 'q14', 'q15']);
    expect(INSTRUMENTS.IEXPAC.coreItemCodes).toHaveLength(11);
  });

  it('títulos, condiciones y enunciados literales y en orden', () => {
    expectInOrder(doc, items.flatMap((i) => [`${i.number}. ${i.title}`, ...(i.condition ? [i.condition] : []), i.text]));
    expect(doc).toContain('Preguntas condicionadas:');
  });

  it('opciones en el orden del documento (NUNCA … SIEMPRE) con códigos 1-5 (protocolo p. 10)', () => {
    expectInOrder(doc, INSTRUMENTS.IEXPAC.options!.map((o) => o.label.toUpperCase()));
    expect(INSTRUMENTS.IEXPAC.options!.map((o) => o.value)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('EQ-5D-3L frente a los dos documentos', () => {
  const self = source('eq5d3l_self');
  const interviewer = source('eq5d3l_interviewer');
  const items = instrumentItems('EQ5D3L').filter((i) => i.kind !== 'vas');

  it('5 dimensiones de 3 niveles + EVA 0-100', () => {
    expect(items.map((i) => i.code)).toEqual(['mobility', 'self_care', 'usual_activities', 'pain_discomfort', 'anxiety_depression']);
    for (const item of items) {
      expect(item.options!.map((o) => o.value)).toEqual([1, 2, 3]);
      expect(item.interviewerOptions!.map((o) => o.value)).toEqual([1, 2, 3]);
    }
    expect(itemRange('EQ5D3L', 'vas')).toEqual({ min: 0, max: 100 });
  });

  it('autoadministrado (v2.0): instrucción, dimensiones, opciones, EVA y copyright literales', () => {
    expectInOrder(self, [
      ...INSTRUMENTS.EQ5D3L.instructions.self!,
      ...items.flatMap((i) => [i.text, ...i.options!.map((o) => o.label)]),
    ]);
    expectInOrder(self, EQ5D_VAS_TEXT.self.slice(0, 2));
    for (const line of EQ5D_VAS_TEXT.self) expect(self).toContain(norm(line).replace('imaginar. 0', 'imaginar.0'));
    for (const label of Object.values(EQ5D_VAS_SCALE)) expect(self).toContain(label);
    expect(self).toContain(INSTRUMENTS.EQ5D3L.footer!.self!);
  });

  it('por entrevista (v1.0): notas, preguntas, opciones y EVA literales y en orden', () => {
    expectInOrder(interviewer, [
      ...INSTRUMENTS.EQ5D3L.instructions.interviewer!.map((t) => t.replace('INTRODUCCIÓN ', '')),
      ...items.flatMap((i) => [i.interviewerText!, ...i.interviewerOptions!.map((o) => o.label)]),
      ...EQ5D_VAS_TEXT.interviewer,
      'Gracias por tomarse el tiempo para responder estas preguntas.',
    ]);
    expect(interviewer).toContain('Spain (Spanish) v1.0');
  });

  it('cada modalidad registra su versión; la modalidad asistida no existe en los documentos', () => {
    expect(instrumentVersion('EQ5D3L', 'self')).toBe('EQ-5D-3L-ES-ES-v2.0-self');
    expect(instrumentVersion('EQ5D3L', 'interviewer')).toBe('EQ-5D-3L-ES-ES-v1.0-interviewer');
    expect(instrumentVersion('EQ5D3L', null)).toBeNull();
    expect(INSTRUMENTS.EQ5D3L.modes).toEqual(['self', 'interviewer']);
  });
});

describe('EVASAF frente al documento', () => {
  const doc = source('evasaf');
  it('10 ítems literales y en orden, escala 1-5', () => {
    const items = instrumentItems('EVASAF');
    expect(items).toHaveLength(10);
    expectInOrder(doc, [INSTRUMENTS.EVASAF.instructions.default![1], ...items.map((i) => i.text)]);
    expect(INSTRUMENTS.EVASAF.options!.map((o) => o.value)).toEqual([1, 2, 3, 4, 5]);
  });
  it('la única diferencia con la instrucción original es la errata «na X» → «una X»', () => {
    expect(doc).toContain(INSTRUMENTS.EVASAF.instructions.default![0].replace('con una X', 'con na X'));
  });
});

describe('VERITAS-PRN frente al documento', () => {
  const doc = source('veritas_prn');
  it('24 ítems en 6 bloques de 4, literales y en orden', () => {
    expect(VERITAS_PRN_BLOCKS).toHaveLength(6);
    const sections = INSTRUMENTS.VERITAS_PRN.sections;
    expect(sections.map((s) => s.items.length)).toEqual([4, 4, 4, 4, 4, 4]);
    expectInOrder(doc, [
      ...INSTRUMENTS.VERITAS_PRN.instructions.default!,
      ...sections.flatMap((s) => [s.title!, ...s.items.map((i) => `${i.number}. ${i.text}`)]),
    ]);
  });
  it('opciones Siempre … Nunca en el orden del documento, códigos de posición 1-5', () => {
    expectInOrder(doc, INSTRUMENTS.VERITAS_PRN.options!.map((o) => `☐ ${o.label}`).slice(0, 5));
    expect(INSTRUMENTS.VERITAS_PRN.options!.map((o) => `${o.value}:${o.label}`)).toEqual(['1:Siempre', '2:A menudo', '3:A veces', '4:Rara vez', '5:Nunca']);
  });
});

describe('VERITAS-Pro', () => {
  it('sin documento fuente: no se reproducen preguntas ni puntuación', () => {
    expect(INSTRUMENTS.VERITAS_PRO.available).toBe(false);
    expect(instrumentItems('VERITAS_PRO')).toHaveLength(0);
    expect(instrumentVersion('VERITAS_PRO', 'self')).toBeNull();
  });
});

describe('catálogo', () => {
  it('los cinco códigos coinciden con los de la base de datos', () => {
    expect(INSTRUMENT_CODES).toEqual(['IEXPAC', 'EQ5D3L', 'EVASAF', 'VERITAS_PRN', 'VERITAS_PRO']);
  });
  it('solo IEXPAC es variable principal', () => {
    expect(INSTRUMENT_CODES.filter((c) => INSTRUMENTS[c].primaryEndpoint)).toEqual(['IEXPAC']);
  });
});
