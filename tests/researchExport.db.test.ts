// Integración con el esquema REAL (migraciones + RLS) en un PostgreSQL LOCAL y desechable.
// Se omite salvo que EXPORT_DB_URL apunte a una base ya preparada con el historial canónico del proyecto
// Supabase compartido (repositorio ramonmorillo/dermapex): scripts/test-db.sh, que aplica
// db-tests/00_local_supabase_stubs.sql + supabase/migrations/*.sql + db-tests/[1-9]*.sql (estas últimas
// crean las cuentas y pacientes COAMO de prueba: CI1 = LAFE, CI2 = VHEBRON, CC = coordinación).
// Nunca apuntar a Supabase.
//
// Comprueba, con las mismas peticiones que hace la app (TABLE_REQUESTS): que todas las columnas de
// tablas y vistas coag_* existen, que cada usuario solo exporta lo que su RLS le permite y que los
// recuentos cuadran. No cubre la capa HTTP de PostgREST (límite de filas), probada con el origen simulado.

import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { runResearchExport } from '../src/services/researchExport/bundle';
import { STANDARD_DIALECT } from '../src/services/researchExport/csv';
import type { DataSource } from '../src/services/researchExport/reader';
import { readZip } from '../src/services/researchExport/zip';

const DB = process.env.EXPORT_DB_URL;
const CI1 = 'c0a00000-5000-4000-8000-000000000001'; // investigadora LAFE
const CI2 = 'c0a00000-5000-4000-8000-000000000002'; // investigador VHEBRON
const CC = 'c0a00000-5000-4000-8000-000000000003'; // coordinación COAMO
const DERMAPEX_COORD = 'cccccccc-0000-4000-8000-000000000001'; // coordinación DERMAPEX (sin acceso COAMO)

function psql(sql: string): string {
  if (!DB || /supabase\.(co|com)/.test(DB)) throw new Error('Solo bases locales.');
  return execFileSync('psql', [DB, '-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
}

function asUser(uid: string, sql: string): string {
  return psql(`begin;
select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true) \\g /dev/null
set local role authenticated;
${sql}
commit;`);
}

function pgSource(uid: string): DataSource {
  return {
    async count(table) {
      return Number(asUser(uid, `select count(*) from public.${table};`));
    },
    async page(request, from, to) {
      const out = asUser(uid, `select coalesce(json_agg(t), '[]') from (select ${request.columns} from public.${request.table} order by ${request.orderBy} limit ${to - from + 1} offset ${from}) t;`);
      return JSON.parse(out) as unknown[];
    },
  };
}

const exportAs = (uid: string) => runResearchExport(pgSource(uid), { dialect: STANDARD_DIALECT, bom: true, appVersion: 'db-test', userId: uid });
const zipText = (zip: Uint8Array) => readZip(zip).map((e) => new TextDecoder().decode(e.data)).join('\n');

describe.skipIf(!DB)('Exportación COAMO contra el esquema real y la RLS (PostgreSQL local)', () => {
  it('prepara más de 1000 citas ficticias (programadas) de un paciente incluido de LAFE', () => {
    asUser(CI1, `insert into public.coag_visits (patient_id, visit_type, visit_date, status, modality, is_scheduled)
      select p.id, 'followup', current_date + g, 'scheduled', 'phone', true
        from public.coag_patients p, generate_series(1, 1100) g
       where p.study_code = 'COAMO-1-0004';`);
    expect(Number(psql('select count(*) from public.coag_visits;'))).toBeGreaterThan(1000);
  });

  it('coordinación COAMO exporta todos los centros y los recuentos cuadran con la base de datos', { timeout: 180000 }, async () => {
    const bundle = await exportAs(CC);
    const counts = Object.fromEntries(bundle.manifest.source_tables.map((t) => [t.table, t.exported_rows]));
    for (const table of ['coag_centers', 'coag_patients', 'coag_inclusions', 'coag_visits', 'coag_clinical_assessments', 'coag_questionnaire_administrations', 'coag_stratifications', 'coag_patient_schedule']) {
      expect(counts[table], table).toBe(Number(psql(`select count(*) from public.${table};`)));
    }
    expect(bundle.manifest.source_tables.find((t) => t.table === 'coag_visits')!.pages).toBeGreaterThan(2);
    expect(bundle.manifest.scope.centers).toContain('LAFE');
    expect(bundle.manifest.scope.centers).toContain('VHEBRON');
  });

  it('cada investigador solo exporta su centro (RLS): ningún dato del otro centro en el paquete', { timeout: 180000 }, async () => {
    const lafe = await exportAs(CI1);
    expect(lafe.manifest.scope.centers).toEqual(['LAFE']);
    const lafeText = zipText(lafe.zip);
    expect(lafeText).not.toContain('COAMO-2-');
    expect(lafeText).toContain('COAMO-1-0004');

    const vhebron = await exportAs(CI2);
    expect(vhebron.manifest.scope.centers).toEqual(['VHEBRON']);
    expect(zipText(vhebron.zip)).not.toContain('COAMO-1-');
  });

  it('una cuenta sin acceso COAMO (coordinación DERMAPEX) no exporta ningún paciente', { timeout: 120000 }, async () => {
    const bundle = await exportAs(DERMAPEX_COORD);
    expect(bundle.manifest.scope.patients).toBe(0);
    expect(bundle.manifest.scope.visits).toBe(0);
  });
});
