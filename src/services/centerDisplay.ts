// Presentación de centros COAMO (lógica pura, probada en tests/centerDisplay.test.ts).

export type CenterRole = 'recruiting' | 'consulting';

export type CoamoCenter = {
  id: string;
  code: string;
  name: string;
  center_role: CenterRole;
  study_number: number | null;
  is_active: boolean;
};

export const CENTER_ROLE_LABEL: Record<CenterRole, string> = {
  recruiting: 'Reclutador',
  consulting: 'Consultor (sin inclusión de pacientes)',
};

/**
 * Prefijo que tendrá el código de paciente del centro (COAMO-<n>-NNNN, decisión del IP 2026-10-07).
 * Solo informativo: los pacientes aún no están implementados. null si el centro no incluye pacientes
 * o no tiene número asignado.
 */
export function patientCodePrefix(center: Pick<CoamoCenter, 'center_role' | 'study_number'>): string | null {
  if (center.center_role !== 'recruiting' || center.study_number == null) return null;
  return `COAMO-${center.study_number}-`;
}

/** Reclutadores por número de estudio; después consultores; después inactivos; empate por nombre. */
export function sortCenters<T extends CoamoCenter>(centers: T[]): T[] {
  return [...centers].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    if (a.center_role !== b.center_role) return a.center_role === 'recruiting' ? -1 : 1;
    const an = a.study_number ?? Number.POSITIVE_INFINITY;
    const bn = b.study_number ?? Number.POSITIVE_INFINITY;
    if (an !== bn) return an - bn;
    return a.name.localeCompare(b.name, 'es');
  });
}

export function summarizeCenters(centers: CoamoCenter[]): { recruiting: number; consulting: number; inactive: number } {
  return {
    recruiting: centers.filter((c) => c.is_active && c.center_role === 'recruiting').length,
    consulting: centers.filter((c) => c.is_active && c.center_role === 'consulting').length,
    inactive: centers.filter((c) => !c.is_active).length,
  };
}
