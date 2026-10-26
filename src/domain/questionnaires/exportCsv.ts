// Exportación para análisis (CSV). Tres ficheros:
//   1) coamo_cuestionarios_ancho.csv — una fila por paciente y visita del estudio (V0 y VF), aunque la
//      visita no exista (visit_registered = 0): no se pierden pacientes por faltar la final.
//   2) coamo_iexpac_emparejado.csv — una fila por paciente: variable principal V0/VF y Δ en pares completos.
//   3) coamo_diccionario.csv — diccionario de variables (columnas estables, versionado con EXPORT_SCHEMA_VERSION).
// Ausentes: celda vacía siempre; el motivo se lee en las columnas *_status y *_reason. Nunca -999 ni 0.
// Sin texto libre (los detalles de «otro motivo» no se exportan) ni UUID de producción.

import { INSTRUMENTS, instrumentItems, type InstrumentCode } from './instruments';
import type { QuestionnaireAdministration, StudyVisit } from './administration';
import type { Eq5dScores, IexpacScores } from './scoring';

export const EXPORT_SCHEMA_VERSION = 'coamo-q-export-1';

export type CsvFormat = 'standard' | 'excel_es';

export type ExportPatient = { id: string; study_code: string; center_code: string; diagnosis: string; status: string };
export type ExportVisit = { id: string; patient_id: string; visit_type: string; visit_date: string; status: string };

type Cell = string | number | null | undefined;
type Column = { name: string; label: string; type: 'text' | 'integer' | 'decimal' | 'date'; values?: string; source: string };

const PREFIX: Record<InstrumentCode, string> = { IEXPAC: 'iexpac', EQ5D3L: 'eq5d', EVASAF: 'evasaf', VERITAS_PRN: 'vprn', VERITAS_PRO: 'vpro' };

const STATUS_VALUES = 'pending | in_progress | completed | not_applicable | not_done (vacío = sin registro: pendiente)';

function adminColumns(code: InstrumentCode): Column[] {
  const p = PREFIX[code];
  const def = INSTRUMENTS[code];
  const cols: Column[] = [
    { name: `${p}_status`, label: `${def.shortName}: estado de cumplimentación`, type: 'text', values: STATUS_VALUES, source: 'COAMO' },
    { name: `${p}_reason`, label: `${def.shortName}: motivo (no aplicable / no realizado)`, type: 'text',
      values: 'regimen_mismatch | diagnosis_mismatch | source_document_unavailable | not_in_protocol | patient_declined | patient_unable | not_administered | other', source: 'COAMO (vocabulario provisional)' },
  ];
  if (!def.available) return cols;
  cols.push(
    { name: `${p}_date`, label: `${def.shortName}: fecha de administración`, type: 'date', values: 'AAAA-MM-DD', source: 'COAMO' },
    { name: `${p}_mode`, label: `${def.shortName}: modalidad`, type: 'text', values: 'self | assisted | interviewer', source: 'COAMO' },
    { name: `${p}_source`, label: `${def.shortName}: origen del dato`, type: 'text', values: 'electronic | paper', source: 'COAMO' },
    { name: `${p}_version`, label: `${def.shortName}: versión del instrumento`, type: 'text', source: def.source },
    { name: `${p}_revision`, label: `${def.shortName}: número de revisión del registro (>1 = editado o corregido)`, type: 'integer', source: 'COAMO' },
    { name: `${p}_corrected`, label: `${def.shortName}: corregido tras completarse (1/0)`, type: 'integer', values: '1 = sí; 0 = no', source: 'COAMO' },
  );
  for (const item of instrumentItems(code)) {
    if (code === 'IEXPAC' && item.condition) {
      cols.push({ name: `${p}_${item.code}_applies`, label: `IEXPAC ítem ${item.number}: se cumple la condición`, type: 'integer',
        values: '1 = sí; 0 = no; vacío = no registrado', source: 'Documento IEXPAC' });
    }
    const values = item.kind === 'vas' ? '0-100' : code === 'VERITAS_PRN'
      ? '1 Siempre, 2 A menudo, 3 A veces, 4 Rara vez, 5 Nunca (CÓDIGO, no puntuación)'
      : code === 'EQ5D3L' ? '1-3 (1 = sin problemas)' : code === 'IEXPAC' ? '1 Nunca … 5 Siempre' : '1 muy deficiente … 5 excelente';
    cols.push({ name: `${p}_${item.code}`, label: `${def.shortName} ${item.number ? `ítem ${item.number}` : item.title}: ${item.title ?? item.text}`.slice(0, 200),
      type: 'integer', values, source: def.source });
  }
  if (code === 'IEXPAC') {
    cols.push(
      { name: 'iexpac_n_answered', label: 'IEXPAC: ítems 1-11 respondidos', type: 'integer', values: '0-11', source: 'Derivado' },
      { name: 'iexpac_sum', label: 'IEXPAC: suma ítems 1-11 (solo si completo)', type: 'integer', values: '11-55', source: 'Protocolo p. 10' },
      { name: 'iexpac_global', label: 'IEXPAC global = 10 × (suma − 11) / 44 (solo si completo)', type: 'decimal', values: '0-10', source: 'Protocolo p. 10' },
    );
  }
  if (code === 'EQ5D3L') {
    cols.push(
      { name: 'eq5d_n_dims', label: 'EQ-5D-3L: dimensiones respondidas', type: 'integer', values: '0-5', source: 'Derivado' },
      { name: 'eq5d_profile', label: 'EQ-5D-3L: perfil de 5 dígitos (solo si completo; texto)', type: 'text', values: '11111-33333', source: 'Documento EQ-5D-3L' },
    );
  }
  if (code === 'EVASAF' || code === 'VERITAS_PRN') {
    cols.push({ name: `${p}_n_answered`, label: `${def.shortName}: ítems respondidos`, type: 'integer', values: `0-${def.coreItemCodes.length}`, source: 'Derivado' });
  }
  return cols;
}

const BASE_COLUMNS: Column[] = [
  { name: 'study_code', label: 'Código seudonimizado del paciente', type: 'text', source: 'COAMO' },
  { name: 'center_code', label: 'Código del centro', type: 'text', source: 'COAMO' },
  { name: 'diagnosis', label: 'Diagnóstico', type: 'text', values: 'HA | HB | EVW', source: 'Protocolo p. 9' },
  { name: 'patient_status', label: 'Estado del paciente en el estudio', type: 'text', source: 'COAMO' },
  { name: 'visit', label: 'Momento del estudio', type: 'text', values: 'V0 | VF', source: 'Protocolo p. 14' },
  { name: 'visit_registered', label: 'Visita registrada (1/0)', type: 'integer', values: '1 = sí; 0 = no', source: 'COAMO' },
  { name: 'visit_date', label: 'Fecha de la visita', type: 'date', values: 'AAAA-MM-DD', source: 'COAMO' },
  { name: 'visit_status', label: 'Estado de la visita', type: 'text', values: 'scheduled | completed | cancelled | not_done', source: 'COAMO' },
];

export const WIDE_COLUMNS: Column[] = [...BASE_COLUMNS, ...(['IEXPAC', 'EQ5D3L', 'EVASAF', 'VERITAS_PRN', 'VERITAS_PRO'] as InstrumentCode[]).flatMap(adminColumns)];

export const PAIRED_COLUMNS: Column[] = [
  BASE_COLUMNS[0], BASE_COLUMNS[1], BASE_COLUMNS[2], BASE_COLUMNS[3],
  { name: 'iexpac_v0_date', label: 'IEXPAC V0: fecha', type: 'date', source: 'COAMO' },
  { name: 'iexpac_vf_date', label: 'IEXPAC VF: fecha', type: 'date', source: 'COAMO' },
  { name: 'iexpac_v0_mode', label: 'IEXPAC V0: modalidad', type: 'text', source: 'COAMO' },
  { name: 'iexpac_vf_mode', label: 'IEXPAC VF: modalidad', type: 'text', source: 'COAMO' },
  { name: 'iexpac_v0_global', label: 'IEXPAC V0 global (0-10)', type: 'decimal', source: 'Protocolo p. 10' },
  { name: 'iexpac_vf_global', label: 'IEXPAC VF global (0-10)', type: 'decimal', source: 'Protocolo p. 10' },
  { name: 'iexpac_delta', label: 'Δ IEXPAC global = VF − V0 (solo pares completos)', type: 'decimal', source: 'Protocolo p. 10 (variable principal)' },
  { name: 'iexpac_paired', label: 'Par V0/VF completo (1/0)', type: 'integer', values: '1 = sí; 0 = no', source: 'Derivado' },
  { name: 'iexpac_mode_changed', label: 'Modalidad distinta en V0 y VF (1/0; vacío si no hay par)', type: 'integer', source: 'Derivado' },
];

// ── Formato ─────────────────────────────────────────────────────────────────

const FORMULA_START = /^[=+\-@\t\r]/;

export function formatCell(value: Cell, format: CsvFormat): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    const text = String(value);
    return format === 'excel_es' ? text.replace('.', ',') : text;
  }
  let text = String(value);
  // Neutraliza fórmulas en hojas de cálculo (solo en texto; los números negativos son números).
  if (FORMULA_START.test(text)) text = `'${text}`;
  const separator = format === 'excel_es' ? ';' : ',';
  if (text.includes(separator) || text.includes('"') || text.includes('\n') || text.includes('\r')) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(columns: string[], rows: Array<Record<string, Cell>>, format: CsvFormat): string {
  const separator = format === 'excel_es' ? ';' : ',';
  const lines = [columns.join(separator), ...rows.map((row) => columns.map((c) => formatCell(row[c], format)).join(separator))];
  // BOM solo para Excel (abre UTF-8 correctamente); el estándar queda limpio para R/SPSS.
  return (format === 'excel_es' ? '﻿' : '') + lines.join('\r\n') + '\r\n';
}

// ── Construcción de filas ───────────────────────────────────────────────────

function adminCells(code: InstrumentCode, admin: QuestionnaireAdministration | undefined): Record<string, Cell> {
  const p = PREFIX[code];
  const def = INSTRUMENTS[code];
  const row: Record<string, Cell> = { [`${p}_status`]: admin?.status ?? '', [`${p}_reason`]: admin?.status_reason_code ?? '' };
  if (!def.available || !admin) return row;
  row[`${p}_date`] = admin.administration_date;
  row[`${p}_mode`] = admin.administration_mode;
  row[`${p}_source`] = admin.data_source;
  row[`${p}_version`] = admin.instrument_version;
  row[`${p}_revision`] = admin.revision;
  row[`${p}_corrected`] = admin.last_corrected_at ? 1 : 0;
  for (const item of instrumentItems(code)) {
    if (code === 'IEXPAC' && item.condition) {
      const a = admin.item_applicability?.[item.code];
      row[`${p}_${item.code}_applies`] = a === true ? 1 : a === false ? 0 : null;
    }
    const v = admin.responses?.[item.code];
    row[`${p}_${item.code}`] = Number.isInteger(v) ? v : null;
  }
  if (code === 'IEXPAC') {
    const s = admin.scores as IexpacScores;
    row.iexpac_n_answered = s.items_answered ?? null;
    row.iexpac_sum = s.complete ? s.sum : null;
    row.iexpac_global = s.complete ? s.global_0_10 : null;
  }
  if (code === 'EQ5D3L') {
    const s = admin.scores as Eq5dScores;
    row.eq5d_n_dims = s.dimensions_answered ?? null;
    row.eq5d_profile = s.profile_complete ? s.profile : null;
  }
  if (code === 'EVASAF' || code === 'VERITAS_PRN') {
    row[`${p}_n_answered`] = (admin.scores as { items_answered?: number }).items_answered ?? null;
  }
  return row;
}

export type ExportBundle = { wide: Array<Record<string, Cell>>; paired: Array<Record<string, Cell>> };

const EXPORTABLE_PATIENT_STATUS = ['included', 'withdrawn', 'lost_to_followup', 'completed'];

export function buildExport(patients: ExportPatient[], visits: ExportVisit[], administrations: QuestionnaireAdministration[]): ExportBundle {
  const byVisit = new Map<string, Map<InstrumentCode, QuestionnaireAdministration>>();
  for (const a of administrations) {
    if (!byVisit.has(a.visit_id)) byVisit.set(a.visit_id, new Map());
    byVisit.get(a.visit_id)!.set(a.instrument_code, a);
  }
  const wide: Array<Record<string, Cell>> = [];
  const paired: Array<Record<string, Cell>> = [];
  const sorted = [...patients].filter((p) => EXPORTABLE_PATIENT_STATUS.includes(p.status)).sort((a, b) => a.study_code.localeCompare(b.study_code));

  for (const patient of sorted) {
    const base = { study_code: patient.study_code, center_code: patient.center_code, diagnosis: patient.diagnosis, patient_status: patient.status };
    const found: Partial<Record<StudyVisit, Map<InstrumentCode, QuestionnaireAdministration>>> = {};
    for (const [label, type] of [['V0', 'baseline'], ['VF', 'final']] as const) {
      const visit = visits.find((v) => v.patient_id === patient.id && v.visit_type === type && v.status !== 'cancelled');
      const admins = visit ? byVisit.get(visit.id) ?? new Map() : new Map<InstrumentCode, QuestionnaireAdministration>();
      found[label] = admins;
      let row: Record<string, Cell> = { ...base, visit: label, visit_registered: visit ? 1 : 0, visit_date: visit?.visit_date, visit_status: visit?.status };
      for (const code of ['IEXPAC', 'EQ5D3L', 'EVASAF', 'VERITAS_PRN', 'VERITAS_PRO'] as InstrumentCode[]) {
        row = { ...row, ...adminCells(code, admins.get(code)) };
      }
      wide.push(row);
    }
    const i0 = found.V0?.get('IEXPAC');
    const iF = found.VF?.get('IEXPAC');
    const g = (a?: QuestionnaireAdministration) =>
      a && a.status === 'completed' && (a.scores as IexpacScores).complete ? (a.scores as IexpacScores).global_0_10 : null;
    const g0 = g(i0);
    const gf = g(iF);
    const isPair = g0 !== null && gf !== null;
    paired.push({
      ...base,
      iexpac_v0_date: i0?.administration_date, iexpac_vf_date: iF?.administration_date,
      iexpac_v0_mode: i0?.administration_mode, iexpac_vf_mode: iF?.administration_mode,
      iexpac_v0_global: g0, iexpac_vf_global: gf,
      iexpac_delta: isPair ? Math.round((gf! - g0!) * 10000) / 10000 : null,
      iexpac_paired: isPair ? 1 : 0,
      iexpac_mode_changed: isPair ? (i0!.administration_mode !== iF!.administration_mode ? 1 : 0) : null,
    });
  }
  return { wide, paired };
}

export function dictionaryCsv(format: CsvFormat): string {
  const rows = [
    ...WIDE_COLUMNS.map((c) => ({ file: 'coamo_cuestionarios_ancho.csv', ...c })),
    ...PAIRED_COLUMNS.map((c) => ({ file: 'coamo_iexpac_emparejado.csv', ...c })),
  ].map((c) => ({
    fichero: c.file, variable: c.name, etiqueta: c.label, tipo: c.type, valores: c.values ?? '',
    ausente: 'celda vacía', fuente: c.source, version_esquema: EXPORT_SCHEMA_VERSION,
  }));
  return toCsv(['fichero', 'variable', 'etiqueta', 'tipo', 'valores', 'ausente', 'fuente', 'version_esquema'], rows, format);
}

export function exportFiles(bundle: ExportBundle, format: CsvFormat): Array<{ name: string; content: string }> {
  return [
    { name: 'coamo_cuestionarios_ancho.csv', content: toCsv(WIDE_COLUMNS.map((c) => c.name), bundle.wide, format) },
    { name: 'coamo_iexpac_emparejado.csv', content: toCsv(PAIRED_COLUMNS.map((c) => c.name), bundle.paired, format) },
    { name: 'coamo_diccionario.csv', content: dictionaryCsv(format) },
  ];
}
