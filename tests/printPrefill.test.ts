import { describe, expect, it } from 'vitest';

import { printPrefill } from '../src/pages/QuestionnairePrintPage';
import { INSTRUMENT_LIBRARY } from '../src/constants/documents';

describe('hoja de cuestionario en papel: prellenado seudonimizado', () => {
  it('acepta código de estudio, momento y fecha válidos', () => {
    expect(printPrefill(new URLSearchParams('code=COAMO-1-0001&visit=VF&date=2026-11-22'))).toEqual({ code: 'COAMO-1-0001', visit: 'VF', date: '2026-11-22' });
  });
  it('ignora valores no previstos (texto libre, nombres, fórmulas, fechas inválidas): deja el hueco en blanco', () => {
    expect(printPrefill(new URLSearchParams('code=Juan Pérez&visit=V3&date=22/11/2026'))).toEqual({ code: null, visit: null, date: null });
    expect(printPrefill(new URLSearchParams('code==HYPERLINK("x")&date=2026-13-45')).code).toBeNull();
    expect(printPrefill(new URLSearchParams('date=2026-13-45')).date).toBeNull();
    expect(printPrefill(new URLSearchParams('')).code).toBeNull();
  });
  it('EQ-5D-3L sigue sin hoja propia (licencia EuroQol)', () => {
    expect(INSTRUMENT_LIBRARY.find((e) => e.code === 'EQ5D3L')?.printable).toBe(false);
  });
});
