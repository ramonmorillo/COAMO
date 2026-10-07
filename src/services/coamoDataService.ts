// Acceso a datos COAMO. Solo tablas coag_*: nunca se consultan tablas de DERMAPEX.
// El control de acceso real lo hace la RLS; el rol solo decide qué se MUESTRA.

import { supabase } from '../lib/supabase';
import { sortCenters, type CoamoCenter } from './centerDisplay';

export type CoamoRole = 'investigator' | 'coordinator';

export type CoamoProfile = {
  id: string;
  full_name: string | null;
  role: CoamoRole;
};

type Result<T> = { data: T; errorMessage: string | null };

export async function getOwnProfile(): Promise<Result<CoamoProfile | null>> {
  if (!supabase) return { data: null, errorMessage: 'Supabase no está configurado.' };

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { data: null, errorMessage: 'Usuario no autenticado.' };

  const { data, error } = await supabase.from('coag_profiles').select('id,full_name,role').eq('id', user.id).maybeSingle();
  if (error) return { data: null, errorMessage: error.message };
  return { data: (data as CoamoProfile | null) ?? null, errorMessage: null };
}

/** Centros visibles: los propios (investigación) o todos los de COAMO (coordinación). */
export async function listVisibleCenters(): Promise<Result<CoamoCenter[]>> {
  if (!supabase) return { data: [], errorMessage: 'Supabase no está configurado.' };

  const { data, error } = await supabase
    .from('coag_centers')
    .select('id,code,name,center_role,study_number,is_active');
  if (error) return { data: [], errorMessage: error.message };
  return { data: sortCenters((data ?? []) as CoamoCenter[]), errorMessage: null };
}

/** Número de profesionales asignados por centro (solo coordinación ve todas las pertenencias). */
export async function countMembershipsByCenter(): Promise<Result<Record<string, number>>> {
  if (!supabase) return { data: {}, errorMessage: 'Supabase no está configurado.' };

  const { data, error } = await supabase.from('coag_center_memberships').select('center_id');
  if (error) return { data: {}, errorMessage: error.message };
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{ center_id: string }>) {
    counts[row.center_id] = (counts[row.center_id] ?? 0) + 1;
  }
  return { data: counts, errorMessage: null };
}
