import { describe, expect, it } from 'vitest';

import { patientCodePrefix, sortCenters, summarizeCenters, type CoamoCenter } from '../src/services/centerDisplay';

const center = (overrides: Partial<CoamoCenter>): CoamoCenter => ({
  id: overrides.code ?? 'x',
  code: 'X',
  name: 'Centro',
  center_role: 'recruiting',
  study_number: 1,
  is_active: true,
  ...overrides,
});

describe('patientCodePrefix', () => {
  it('reclutador con número → COAMO-<n>-', () => {
    expect(patientCodePrefix({ center_role: 'recruiting', study_number: 4 })).toBe('COAMO-4-');
  });

  it('consultor o reclutador sin número → sin prefijo', () => {
    expect(patientCodePrefix({ center_role: 'consulting', study_number: null })).toBeNull();
    expect(patientCodePrefix({ center_role: 'recruiting', study_number: null })).toBeNull();
  });
});

describe('sortCenters', () => {
  it('ordena reclutadores por número, luego consultores, luego inactivos', () => {
    const sorted = sortCenters([
      center({ code: 'VALME', center_role: 'consulting', study_number: null }),
      center({ code: 'B', study_number: 2 }),
      center({ code: 'OFF', study_number: 1, is_active: false }),
      center({ code: 'A', study_number: 1 }),
    ]);
    expect(sorted.map((c) => c.code)).toEqual(['A', 'B', 'VALME', 'OFF']);
  });

  it('no modifica la lista original', () => {
    const original = [center({ code: 'B', study_number: 2 }), center({ code: 'A', study_number: 1 })];
    sortCenters(original);
    expect(original.map((c) => c.code)).toEqual(['B', 'A']);
  });
});

describe('summarizeCenters', () => {
  it('cuenta reclutadores y consultores activos e inactivos aparte', () => {
    expect(
      summarizeCenters([
        center({ code: 'A' }),
        center({ code: 'B', study_number: 2 }),
        center({ code: 'V', center_role: 'consulting', study_number: null }),
        center({ code: 'OFF', is_active: false }),
      ]),
    ).toEqual({ recruiting: 2, consulting: 1, inactive: 1 });
  });
});
