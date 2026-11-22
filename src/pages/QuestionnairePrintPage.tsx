// Versión imprimible (papel / PDF con «Imprimir → Guardar como PDF») de un cuestionario, generada desde el
// mismo catálogo que el formulario electrónico (src/domain/questionnaires/instruments.ts): el texto no se
// duplica ni se modifica. Solo dentro de la aplicación autenticada.
// Prellenado opcional desde la ficha (?code=…&visit=V0|VF&date=aaaa-mm-dd): solo el código seudonimizado del estudio,
// el momento y la fecha de administración prevista; nunca datos identificativos. Formato A4 (coamo.css).

import { Link, useParams, useSearchParams } from 'react-router-dom';

import { formatDate } from '../domain/study';

/** Valores de prellenado aceptados (lo demás se ignora y se deja el hueco para escribir a mano). */
export function printPrefill(params: URLSearchParams): { code: string | null; visit: 'V0' | 'VF' | null; date: string | null } {
  const code = params.get('code');
  const visit = params.get('visit');
  const date = params.get('date');
  return {
    code: code && /^[A-Z0-9][A-Z0-9-]{2,29}$/.test(code) ? code : null,
    visit: visit === 'V0' || visit === 'VF' ? visit : null,
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) ? date : null,
  };
}

import { ErrorState } from '../components/common/ErrorState';
import { INSTRUMENT_LIBRARY } from '../constants/documents';
import { INSTRUMENTS, INSTRUMENT_CODES, instrumentVersion, optionsFor, type InstrumentCode } from '../domain/questionnaires/instruments';

export function QuestionnairePrintPage() {
  const { instrument = '' } = useParams();
  const [params] = useSearchParams();
  const prefill = printPrefill(params);
  const code = INSTRUMENT_CODES.find((c) => c === instrument) as InstrumentCode | undefined;
  const entry = INSTRUMENT_LIBRARY.find((e) => e.code === code);
  if (!code || !entry) return <ErrorState title="Cuestionario no válido" message="El cuestionario solicitado no forma parte de COAMO." />;
  const def = INSTRUMENTS[code];
  if (!entry.printable) {
    return <ErrorState title="Versión imprimible no disponible" message={entry.restrictions} />;
  }
  return (
    <div className="page-stack coamo-print-sheet">
      <p className="coamo-no-print">
        <Link to="/project#documentacion">← Documentación y cuestionarios</Link>{' · '}
        <button type="button" onClick={() => window.print()}>Imprimir / guardar como PDF</button>
      </p>
      <header>
        <h1>{def.name}</h1>
        <p className="coamo-field-hint">
          Código de estudio: {prefill.code ?? '____________'} · Visita: {prefill.visit ? `${prefill.visit === 'V0' ? '☒ V0 ☐ VF' : '☐ V0 ☒ VF'}` : '☐ V0 ☐ VF'}
          {' '}· Fecha de administración: {prefill.date ? formatDate(prefill.date) : '___/___/______'}
        </p>
        <p className="coamo-field-hint">Instrumento: {def.shortName} · versión {instrumentVersion(code, 'self') ?? '—'}</p>
      </header>
      {(def.instructions.default ?? []).map((p) => <p key={p}>{p}</p>)}
      {def.sections.map((section) => (
        <section key={section.id}>
          {section.title ? <h2>{section.title}</h2> : null}
          {section.intro ? <p>{section.intro}</p> : null}
          {section.items.map((item) => {
            const options = optionsFor(code, item, 'self');
            return (
              <div key={item.code} style={{ breakInside: 'avoid', marginBottom: '0.75rem' }}>
                {item.condition ? <p><em>{item.condition}</em></p> : null}
                <p><strong>{item.number ? `${item.number}. ` : ''}{item.title ? `${item.title} ` : ''}</strong>{item.text}</p>
                <p className="coamo-print-options">{options.map((o) => <span key={o.value}>☐ {o.label}</span>)}</p>
              </div>
            );
          })}
        </section>
      ))}
      {def.commentsField ? (
        <section style={{ breakInside: 'avoid' }}>
          <p><strong>{def.commentsField.label}</strong></p>
          {[1, 2, 3, 4].map((n) => <p key={n} style={{ borderBottom: '1px solid currentColor', height: '1.6em', margin: 0 }} aria-hidden="true" />)}
        </section>
      ) : null}
      <footer className="coamo-field-hint" style={{ marginTop: '1.5rem' }}>
        <p>Versión COAMO: {instrumentVersion(code, 'self') ?? '—'} · {def.source}</p>
        {def.reference ? <p>{def.reference}</p> : null}
        <p>Uso exclusivo para la administración en el estudio COAMO. {entry.restrictions}</p>
      </footer>
    </div>
  );
}
