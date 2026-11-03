import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { INSTRUMENT_LIBRARY, STUDY_DOCUMENTS } from '../src/constants/documents';
import { INSTRUMENTS, INSTRUMENT_CODES } from '../src/domain/questionnaires/instruments';

const fixture = (f: string) => readFileSync(join(__dirname, 'fixtures', 'source', f), 'utf8');

describe('biblioteca de documentación y cuestionarios', () => {
  it('cada instrumento implementado tiene una entrada (y solo una)', () => {
    expect(INSTRUMENT_LIBRARY.map((e) => e.code).sort()).toEqual([...INSTRUMENT_CODES].sort());
  });
  it('EQ-5D-3L (licencia EuroQol) no ofrece versión imprimible propia', () => {
    expect(INSTRUMENT_LIBRARY.find((e) => e.code === 'EQ5D3L')!.printable).toBe(false);
  });
  it('VERITAS figura como decisión de los investigadores (sustituye a Morisky-Green del protocolo aprobado)', () => {
    for (const code of ['VERITAS_PRN', 'VERITAS_PRO']) expect(INSTRUMENT_LIBRARY.find((e) => e.code === code)!.status).toBe('investigators_decision');
  });
  it('las referencias bibliográficas proceden de los documentos aportados (PMID presente en la fuente)', () => {
    const sources: Record<string, string> = { EVASAF: 'evasaf.txt', VERITAS_PRN: 'veritas_prn_scoring.txt', VERITAS_PRO: 'veritas_pro_scoring.txt' };
    for (const [code, file] of Object.entries(sources)) {
      const pmid = /PMID: (\d+)/.exec(INSTRUMENTS[code as keyof typeof INSTRUMENTS].reference ?? '')?.[1];
      expect(pmid, code).toBeDefined();
      expect(fixture(file)).toContain(`PMID: ${pmid}`);
    }
    // Sin referencia en el documento → no se inventa.
    expect(INSTRUMENTS.IEXPAC.reference).toBeUndefined();
  });
  it('los documentos no aportados se declaran como tales (no se inventa versión)', () => {
    for (const d of STUDY_DOCUMENTS.filter((x) => x.status === 'not_provided')) expect(d.version).toBe('—');
  });
});
