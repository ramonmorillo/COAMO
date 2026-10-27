// Genera docs/CUESTIONARIOS_TRAZABILIDAD.md desde el catálogo (fuente única). Uso: npx vite-node scripts/generate-traceability.ts
import { writeFileSync } from 'node:fs';

import { INSTRUMENTS, INSTRUMENT_CODES, instrumentItems, optionsFor } from '../src/domain/questionnaires/instruments';

const PREFIX = { IEXPAC: 'iexpac', EQ5D3L: 'eq5d', EVASAF: 'evasaf', VERITAS_PRN: 'vprn', VERITAS_PRO: 'vpro' } as const;
const DOC = {
  IEXPAC: 'CUESTIONARIO_IEXPAC.docx', EQ5D3L: 'EQ-5D-3L_autoadministrado.docx (v2.0) / EQ-5D-3L_administrado_por_profesional.docx (v1.0)',
  EVASAF: 'PROYECTO_EVASAF.docx', VERITAS_PRN: 'VERITAS-PRN.docx', VERITAS_PRO: 'VERITAS-Pro.docx',
} as const;
const esc = (t: string) => t.replace(/\|/g, '\\|');
const lines: string[] = [
  '# Trazabilidad: documento original → pregunta → variable digital',
  '',
  'Generado automáticamente desde `src/domain/questionnaires/instruments.ts` con `scripts/generate-traceability.ts`. ',
  'La literalidad de cada texto frente al .docx se comprueba en `tests/questionnaireIntegrity.test.ts` (fixtures extraídas con `scripts/extract-docx-text.py`).',
  '',
  '- **Clave BD**: clave en `coag_questionnaire_administrations.responses` (y `item_applicability` para condicionados).',
  '- **Columna CSV**: columna de `coamo_cuestionarios_ancho.csv`.',
  '- **Códigos**: valor almacenado = posición de la opción en el documento.',
  '',
];
for (const code of INSTRUMENT_CODES) {
  const def = INSTRUMENTS[code];
  lines.push(`## ${def.shortName}`, '', `- Documento: ${DOC[code]}`, `- Fuente: ${def.source}`, `- Puntuación: ${def.scoringSummary}`, `- Dirección: ${def.directionNote}`, '');
  if (!def.available) {
    lines.push(`> ${def.unavailableReason}`, '', `Variables: \`vpro_status\`, \`vpro_reason\`.`, '');
    continue;
  }
  lines.push('| Sección | Nº | Texto del documento | Opciones (código = etiqueta) | Clave BD | Columna CSV |', '|---|---|---|---|---|---|');
  for (const section of def.sections) {
    for (const item of section.items) {
      const opts = item.kind === 'vas' ? '0-100 (entero)' : optionsFor(code, item, null).map((o) => `${o.value}=${o.label}`).join('; ');
      const text = [item.title && item.title !== item.text ? `**${item.title}.**` : '', item.condition ? `_${item.condition}_` : '', item.text,
        item.interviewerText ? `<br>Entrevista: ${item.interviewerText}` : ''].filter(Boolean).join(' ');
      const csv = `\`${PREFIX[code]}_${item.code}\`` + (item.condition ? `, \`${PREFIX[code]}_${item.code}_applies\`` : '');
      lines.push(`| ${esc(section.title ?? '—')} | ${item.number ?? '—'} | ${esc(text)} | ${esc(opts)} | \`${item.code}\` | ${csv} |`);
    }
  }
  lines.push('');
}
writeFileSync('docs/CUESTIONARIOS_TRAZABILIDAD.md', lines.join('\n'));
console.log('docs/CUESTIONARIOS_TRAZABILIDAD.md generado');
