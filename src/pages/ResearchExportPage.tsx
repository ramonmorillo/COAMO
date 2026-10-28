import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { getOwnProfile, type CoamoProfile } from '../services/coamoDataService';
import { EXPORT_FORMAT_VERSION } from '../services/researchExport/bundle';
import { EXCLUDED_COLUMNS } from '../services/researchExport/datasets';
import { exportResearchDataBundle, type ExportFormat } from '../services/researchExportService';

export function ResearchExportPage() {
  const [profile, setProfile] = useState<CoamoProfile | null>(null);
  const [format, setFormat] = useState<ExportFormat>('standard');
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    void getOwnProfile().then((r) => setProfile(r.data));
  }, []);

  const run = async () => {
    setExporting(true);
    setMessage(null);
    const result = await exportResearchDataBundle(format, setProgress);
    setProgress(null);
    setExporting(false);
    setMessage(result.success
      ? { tone: 'success', text: `Exportación completada y verificada. ${result.summary ?? ''}` }
      : { tone: 'danger', text: result.errorMessage ?? 'No se pudieron exportar los datos.' });
  };

  const isCoordinator = profile?.role === 'coordinator';

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Investigación"
        title="Exportación de datos"
        description="Paquete completo de la base de investigación: tablas íntegras, formatos largo y ancho, respuestas por ítem, diccionario, sintaxis SPSS, Excel, JSON y manifiesto verificado."
      />

      <Notice tone="info" title={isCoordinator ? 'Ámbito: todos los centros COAMO' : 'Ámbito: tus centros'}>
        El servidor solo entrega los datos que tu perfil puede ver (control de acceso en la base de datos). Identificadores seudonimizados
        (study_code). Las fechas exactas y el centro pueden actuar como cuasiidentificadores: custodia los ficheros según el plan de
        protección de datos del estudio.
      </Notice>

      <section className="card" aria-labelledby="research-export">
        <h2 id="research-export">Paquete de investigación (ZIP)</h2>
        <fieldset className="coamo-fieldset">
          <legend>Formato de los CSV</legend>
          <div className="radio-row">
            <label className="radio-inline">
              <input type="radio" name="format" checked={format === 'standard'} onChange={() => setFormat('standard')} disabled={exporting} />
              Estándar (coma; decimal punto) · SPSS, R, Stata
            </label>
            <label className="radio-inline">
              <input type="radio" name="format" checked={format === 'spanish_excel'} onChange={() => setFormat('spanish_excel')} disabled={exporting} />
              Excel España (punto y coma; decimal coma)
            </label>
          </div>
        </fieldset>
        <div className="form-actions" style={{ marginTop: 'var(--sp-4)' }}>
          <button type="button" onClick={() => void run()} disabled={exporting}>{exporting ? 'Exportando...' : 'Exportar y descargar'}</button>
        </div>
        {progress ? <Notice tone="info">{progress}</Notice> : null}
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

        <ul className="coamo-pending-list" style={{ marginTop: 'var(--sp-4)' }}>
          <li>
            <strong>Completa y conciliada:</strong> cada tabla se lee por páginas con orden estable y se compara con el recuento exacto de la base
            de datos. Si faltan filas, se repiten o cambian durante la lectura, la exportación se cancela y no se descarga nada.
          </li>
          <li>
            <strong>Verificada antes de entregar:</strong> cada CSV se relee celda a celda; el ZIP se relee comprobando CRC y huellas SHA-256
            (manifest.json).
          </li>
          <li>
            <strong>Contenido:</strong> raw/ (centros, pacientes, inclusión, visitas, datos clínicos, cuestionarios, estratificaciones, ventana de la
            visita final); analisis/ (LONG por visita, WIDE por paciente con V0/VF y cambio VF − V0 de IEXPAC global, ítems de cuestionarios,
            respuestas de la estratificación, incidencias de integridad); diccionario de variables; .sps por fichero; Excel y JSON.
          </li>
          <li>Ausente = celda vacía, nunca 0 ni −999. Las puntuaciones son las calculadas por la base de datos (no se recalculan al exportar).</li>
          <li>Formato {EXPORT_FORMAT_VERSION}. La descarga se genera en el navegador y no queda registrada en la auditoría (limitación conocida).</li>
        </ul>

        <details style={{ marginTop: 'var(--sp-3)' }}>
          <summary>Columnas que no se exportan y motivo</summary>
          <ul className="coamo-pending-list">
            {EXCLUDED_COLUMNS.map((e) => (
              <li key={e.table}><code>{e.table}</code>: {e.columns}. {e.reason}</li>
            ))}
          </ul>
        </details>
      </section>

      <section className="card" aria-labelledby="questionnaire-export">
        <h2 id="questionnaire-export">CSV de cuestionarios V0/VF</h2>
        <p className="help-text">
          Ficheros CSV sueltos centrados en los cuestionarios (formato ancho por paciente y visita, IEXPAC emparejado y diccionario).
          Se mantienen por compatibilidad con los análisis ya preparados; el paquete de investigación contiene la misma información.
        </p>
        <Link className="button-link button-secondary" to="/questionnaires/export">Abrir exportación de cuestionarios</Link>
      </section>
    </div>
  );
}
