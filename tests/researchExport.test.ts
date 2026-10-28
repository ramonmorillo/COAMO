import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';

import { buildExportBundle, readAllTables, runResearchExport, type ExportOptions } from '../src/services/researchExport/bundle';
import { parseCsv, SPANISH_EXCEL_DIALECT, STANDARD_DIALECT, writeCsv, type CsvDialect } from '../src/services/researchExport/csv';
import { TABLE_REQUESTS, type RawData } from '../src/services/researchExport/datasets';
import { ExportIntegrityError, readWholeTable } from '../src/services/researchExport/reader';
import { escapeForSpss, unescapeFromSpss } from '../src/services/researchExport/spss';
import { readZip } from '../src/services/researchExport/zip';
import { memorySource, syntheticData, TRICKY_TEXTS } from './helpers/exportFixture';

const NOW = new Date('2026-10-28T12:00:00');
const options = (dialect: CsvDialect = STANDARD_DIALECT): ExportOptions => ({ dialect, bom: true, appVersion: 'test', userId: null, now: NOW });

async function exportAll(data: RawData, dialect: CsvDialect = STANDARD_DIALECT, serverMaxRows = 1000) {
  const bundle = await runResearchExport(memorySource(data, { serverMaxRows }), options(dialect));
  const files = new Map(readZip(bundle.zip).map((e) => [e.path, e.data]));
  const text = (path: string) => {
    const content = files.get(path);
    if (!content) throw new Error(`Falta ${path}`);
    return new TextDecoder().decode(content);
  };
  const table = (path: string) => {
    const [header, ...rows] = parseCsv(text(path), dialect.delimiter);
    return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
  };
  return { bundle, files, text, table };
}

/** Celda CSV → valor tipado para comparar con el origen. */
function decode(cell: string, sourceValue: unknown, dialect: CsvDialect): unknown {
  if (cell === '') return null;
  if (typeof sourceValue === 'number') return Number(dialect.decimal === ',' ? cell.replace(',', '.') : cell);
  if (typeof sourceValue === 'boolean') return cell === '1';
  if (sourceValue !== null && typeof sourceValue === 'object') return JSON.parse(cell);
  return cell;
}

describe('CSV RFC 4180', () => {
  it('conserva exactamente textos difíciles (separadores, comillas, saltos de línea, ñ, emoji, espacios, ceros)', () => {
    for (const dialect of [STANDARD_DIALECT, SPANISH_EXCEL_DIALECT]) {
      const rows = TRICKY_TEXTS.map((t) => [t, null, '0']);
      const csv = writeCsv(['texto', 'vacio', 'cero'], rows, dialect);
      const [header, ...body] = parseCsv(csv, dialect.delimiter);
      expect(header).toEqual(['texto', 'vacio', 'cero']);
      expect(body.map((r) => r[0])).toEqual(TRICKY_TEXTS);
      expect(body.every((r) => r[1] === '' && r[2] === '0')).toBe(true);
    }
  });
});

describe('Lectura paginada y conciliada', () => {
  const big = { ...syntheticData({ patients: 2 }), visits: Array.from({ length: 5003 }, (_, i) => ({ id: `id-${String(i).padStart(6, '0')}`, patient_id: 'x' })) } as RawData;

  it('lee las 5003 filas aunque el servidor corte a 1000 por petición', async () => {
    const result = await readWholeTable(memorySource(big, { serverMaxRows: 1000 }), TABLE_REQUESTS.visits, 500);
    expect(result.rows).toHaveLength(5003);
    expect(result.dbCount).toBe(5003);
  });

  it('no se salta filas si el límite del servidor es menor que el tamaño de página', async () => {
    const result = await readWholeTable(memorySource(big, { serverMaxRows: 100 }), TABLE_REQUESTS.visits, 500);
    expect(new Set(result.rows.map((r) => (r as { id: string }).id)).size).toBe(5003);
  });

  it('falla (no entrega) si la base de datos devuelve menos filas que su recuento', async () => {
    const source = memorySource(big, { truncateTable: { table: 'coag_visits', maxTotal: 1000 } });
    await expect(readWholeTable(source, TABLE_REQUESTS.visits, 500)).rejects.toThrow(ExportIntegrityError);
  });

  it('falla si los datos cambian durante la exportación', async () => {
    const source = memorySource(big, { mutateTable: 'coag_visits' });
    await expect(readWholeTable(source, TABLE_REQUESTS.visits, 500)).rejects.toThrow(/cambió durante la exportación/);
  });

  it('falla si la paginación devuelve registros repetidos (orden inestable)', async () => {
    const source = memorySource(big, { unstableOrderTable: 'coag_visits' });
    await expect(readWholeTable(source, TABLE_REQUESTS.visits, 500)).rejects.toThrow(ExportIntegrityError);
  });
});

describe('Paquete de exportación COAMO (datos sintéticos)', () => {
  const data = syntheticData({ patients: 60 });

  it('cada tabla raw reproduce fielmente la base de datos (recuento y valor a valor)', async () => {
    for (const dialect of [STANDARD_DIALECT, SPANISH_EXCEL_DIALECT]) {
      const { table, bundle } = await exportAll(data, dialect);
      const map: Array<[string, keyof RawData, string]> = [
        ['raw/centros.csv', 'centers', 'id'], ['raw/pacientes.csv', 'patients', 'id'], ['raw/inclusion.csv', 'inclusions', 'patient_id'],
        ['raw/visitas.csv', 'visits', 'id'], ['raw/datos_clinicos.csv', 'clinical', 'visit_id'], ['raw/cuestionarios_registros.csv', 'questionnaires', 'id'],
        ['raw/estratificaciones.csv', 'stratifications', 'id'], ['raw/calendario_final.csv', 'schedule', 'patient_id'],
      ];
      for (const [path, key, idKey] of map) {
        const rows = table(path);
        expect(rows, path).toHaveLength(data[key].length);
        const byId = new Map(rows.map((r) => [r[idKey], r]));
        for (const src of data[key]) {
          const out = byId.get(String(src[idKey]));
          expect(out, `${path} ${String(src[idKey])}`).toBeDefined();
          for (const [col, value] of Object.entries(src)) {
            if (!(col in out!)) continue; // columnas excluidas a propósito (documentadas)
            expect(decode(out![col], value, dialect), `${path}.${col}`).toEqual(value ?? null);
          }
        }
      }
      for (const t of bundle.manifest.source_tables) expect(t.exported_rows, t.table).toBe(t.db_count);
    }
  });

  it('LONG: una fila por visita; WIDE: una por paciente con V0/VF y cambio IEXPAC solo en pares completos', async () => {
    const { table } = await exportAll(data);
    const long = table('analisis/long_visitas.csv');
    const wide = table('analisis/wide_pacientes.csv');
    expect(long).toHaveLength(data.visits.length);
    expect(wide).toHaveLength(data.patients.length);
    let pairs = 0;
    for (const row of wide) {
      const a = row.iexpac_global_v0;
      const b = row.iexpac_global_vf;
      if (a !== '' && b !== '') {
        pairs += 1;
        expect(Number(row.iexpac_global_cambio_vf_v0)).toBeCloseTo(Number(b) - Number(a), 4);
      } else {
        expect(row.iexpac_global_cambio_vf_v0).toBe('');
      }
    }
    expect(pairs).toBeGreaterThan(0);
    // Nulo ≠ cero: visitas sin IEXPAC tienen la puntuación vacía, nunca 0.
    expect(long.filter((r) => r.iexpac_estado === '').every((r) => r.iexpac_global === '')).toBe(true);
    // La IEXPAC global exportada es la guardada por la BD (scores.global_0_10), sin recalcular.
    for (const q of data.questionnaires.filter((x) => x.instrument_code === 'IEXPAC')) {
      const row = long.find((l) => l.visit_id === q.visit_id)!;
      const stored = (q.scores as { global_0_10?: number | null }).global_0_10 ?? null;
      expect(row.iexpac_global === '' ? null : Number(row.iexpac_global)).toEqual(stored);
    }
  });

  it('una final anulada no ocupa el hueco VF de un paciente sin final activa', async () => {
    const { table } = await exportAll(data);
    const wide = table('analisis/wide_pacientes.csv');
    const cancelledOnly = data.patients.filter((p) => {
      const finals = data.visits.filter((v) => v.patient_id === p.id && v.visit_type === 'final');
      return finals.length > 0 && finals.every((v) => v.status === 'cancelled');
    });
    expect(cancelledOnly.length).toBeGreaterThan(0);
    for (const p of cancelledOnly) {
      const row = wide.find((w) => w.study_code === p.study_code)!;
      expect(row.estado_vf).toBe('cancelled');
      expect(row.fecha_vf).toBe('');
    }
  });

  it('exporta todas las respuestas individuales y la aplicabilidad de los ítems condicionados', async () => {
    const { table } = await exportAll(data);
    const items = table('analisis/cuestionarios_items.csv');
    const expected = data.questionnaires.reduce(
      (sum, q) => sum + new Set([...Object.keys(q.responses as object), ...Object.keys(q.item_applicability as object)]).size, 0);
    expect(items).toHaveLength(expected);
    const byKey = new Map(items.map((i) => [`${i.administration_id}|${i.item}`, i]));
    for (const q of data.questionnaires) {
      for (const [item, value] of Object.entries(q.responses as Record<string, number>)) expect(byKey.get(`${String(q.id)}|${item}`)!.valor).toBe(String(value));
      for (const [item, applies] of Object.entries(q.item_applicability as Record<string, boolean>)) expect(byKey.get(`${String(q.id)}|${item}`)!.aplica).toBe(applies ? '1' : '0');
    }
  });

  it('desglosa las respuestas de la estratificación con puntos del modelo y comparación con la propuesta', async () => {
    const { table } = await exportAll(data);
    const rows = table('analisis/estratificaciones_respuestas.csv');
    const expected = data.stratifications.reduce(
      (sum, s) => sum + new Set([...Object.keys(s.answers as object), ...Object.keys(s.suggestions as object)]).size, 0);
    expect(rows).toHaveLength(expected);
    // Suma de puntos de una estratificación completa = puntuación guardada.
    const complete = data.stratifications.find((s) => s.status === 'completed' && s.score !== null && (s.answers as Record<string, string>).advanced_therapy !== 'yes')!;
    const points = rows.filter((r) => r.stratification_id === complete.id && r.puntos !== '').reduce((sum, r) => sum + Number(r.puntos), 0);
    expect(points).toBe(complete.score);
  });

  it('señala incidencias (cita vencida, final fuera de ventana) sin bloquear la exportación', async () => {
    const { table, bundle } = await exportAll(data);
    const issues = table('analisis/incidencias_integridad.csv');
    expect(issues.length).toBe(bundle.manifest.integrity.errors + bundle.manifest.integrity.to_review);
    expect(issues.some((i) => i.tipo === 'cita_vencida')).toBe(true);
    expect(issues.some((i) => i.tipo === 'fuera_de_ventana')).toBe(true);
    expect(bundle.manifest.integrity.errors).toBe(0);
  });

  it('el manifiesto contiene huellas SHA-256 correctas, la referencia del CEIm y los ficheros esperados', async () => {
    const { bundle, files } = await exportAll(data);
    for (const f of bundle.manifest.files) {
      const content = files.get(f.path)!;
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', content));
      expect([...digest].map((b) => b.toString(16).padStart(2, '0')).join(''), f.path).toBe(f.sha256);
    }
    expect(bundle.manifest.study.ethics_registry).toBe('2026-0810-1');
    for (const path of ['manifest.json', 'LEEME.txt', 'diccionario_variables.csv', 'coamo_export.xlsx', 'coamo_export.json', 'analisis/wide_pacientes.sps']) {
      expect(files.has(path), path).toBe(true);
    }
    expect(bundle.fileName).toMatch(/^coamo_export_\d{8}_\d{6}\.zip$/);
  });

  it('el diccionario documenta todas las variables de todos los ficheros', async () => {
    const { table, bundle, text } = await exportAll(data);
    const dict = table('diccionario_variables.csv');
    for (const ds of bundle.manifest.datasets) {
      const header = parseCsv(text(`${ds.folder}/${ds.id}.csv`), ',')[0];
      for (const variable of header) expect(dict.some((d) => d.conjunto === ds.id && d.variable === variable), `${ds.id}.${variable}`).toBe(true);
    }
  });

  it('no exporta columnas de texto libre ni identificadores de profesionales', async () => {
    const { text } = await exportAll(data);
    for (const path of ['raw/cuestionarios_registros.csv', 'raw/estratificaciones.csv', 'raw/inclusion.csv', 'raw/datos_clinicos.csv']) {
      const header = parseCsv(text(path), ',')[0];
      for (const banned of ['status_reason_detail', 'last_correction_reason', 'raised_reason', 'restratification_reason', 'created_by', 'updated_by', 'assessed_by']) {
        expect(header, `${path}.${banned}`).not.toContain(banned);
      }
    }
  });

  it('Excel y JSON contienen todas las filas y los valores originales', async () => {
    const { files, bundle } = await exportAll(data);
    const wb = XLSX.read(files.get('coamo_export.xlsx')!, { type: 'array' });
    for (const ds of bundle.manifest.datasets) {
      const sheet = wb.Sheets[ds.id.slice(0, 31)];
      expect(sheet, ds.id).toBeDefined();
      expect(XLSX.utils.sheet_to_json(sheet, { defval: null }), ds.id).toHaveLength(ds.rows);
    }
    const clinicos = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.datos_clinicos, { defval: null });
    for (const row of data.clinical) {
      const out = clinicos.find((r) => r.visit_id === row.visit_id)!;
      expect(out.hemostatic_agent ?? null).toEqual(row.hemostatic_agent ?? null); // saltos de línea y comillas intactos
    }
    const json = JSON.parse(new TextDecoder().decode(files.get('coamo_export.json')!));
    expect(json.datasets.visitas.rows).toHaveLength(data.visits.length);
  });

  it('el escape para SPSS es reversible', () => {
    for (const t of [...TRICKY_TEXTS, 'a\\nb', '\\', 'fin\\']) expect(unescapeFromSpss(escapeForSpss(t)!)).toBe(t);
  });

  it('aborta si una fila trae una columna no definida (no se pierde en silencio)', async () => {
    const small = syntheticData({ patients: 3 });
    const { raw, results } = await readAllTables(memorySource(small));
    raw.visits[0] = { ...raw.visits[0], columna_nueva: 'x' };
    await expect(buildExportBundle(raw, results, options())).rejects.toThrow(/columnas no definidas/);
  });

  it('escenario de alto volumen: 600 pacientes y más de 1000 visitas', async () => {
    const vol = syntheticData({ patients: 600, seed: 7, followupsPerPatient: 3 });
    expect(vol.visits.length).toBeGreaterThan(1000);
    const { bundle } = await exportAll(vol);
    expect(bundle.manifest.scope.patients).toBe(600);
    expect(bundle.manifest.source_tables.every((t) => t.ok)).toBe(true);
    expect(bundle.manifest.source_tables.find((t) => t.table === 'coag_visits')!.pages).toBeGreaterThan(2);
  }, 60000);

  it('escribe un paquete de muestra para la validación con PSPP si se pide (EXPORT_FIXTURE_DIR)', async () => {
    const dir = process.env.EXPORT_FIXTURE_DIR;
    if (!dir) return;
    for (const [name, dialect] of [['standard', STANDARD_DIALECT], ['spanish', SPANISH_EXCEL_DIALECT]] as const) {
      const { files } = await exportAll(data, dialect);
      for (const [path, content] of files) {
        const target = join(dir, name, path);
        mkdirSync(join(target, '..'), { recursive: true });
        writeFileSync(target, content);
      }
    }
  });
});
