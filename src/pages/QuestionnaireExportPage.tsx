import { useEffect, useMemo, useState } from 'react';

import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { buildExport, EXPORT_SCHEMA_VERSION, exportFiles, type CsvFormat } from '../domain/questionnaires/exportCsv';
import { todayIso } from '../domain/study';
import { getOwnProfile, type CoamoProfile } from '../services/coamoDataService';
import { loadStudyQuestionnaireData } from '../services/questionnaireService';

type Data = Awaited<ReturnType<typeof loadStudyQuestionnaireData>>['data'];

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function QuestionnaireExportPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<CoamoProfile | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [format, setFormat] = useState<CsvFormat>('standard');

  useEffect(() => {
    void (async () => {
      const [p, d] = await Promise.all([getOwnProfile(), loadStudyQuestionnaireData()]);
      setProfile(p.data);
      setData(d.data);
      setError(p.errorMessage ?? d.error);
      setLoading(false);
    })();
  }, []);

  const bundle = useMemo(() => {
    if (!data) return null;
    const centerCode = new Map(data.centers.map((c) => [c.id, c.code]));
    return buildExport(
      data.patients.map((p) => ({ id: p.id, study_code: p.study_code, center_code: centerCode.get(p.center_id) ?? '', diagnosis: p.diagnosis, status: p.status })),
      data.visits,
      data.administrations,
    );
  }, [data]);

  if (loading) return <LoadingState label="Preparando datos..." />;
  if (error) return <ErrorState title="No se pudieron cargar los datos" message={error} />;
  if (!bundle || !data) return null;

  const files = exportFiles(bundle, format);
  const stamp = todayIso();
  const isCoordinator = profile?.role === 'coordinator';

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Investigación"
        title="Exportación de cuestionarios"
        description="Ficheros CSV para Excel, R o SPSS con las respuestas individuales, derivados documentados, estados y fechas de V0 y VF."
      />
      <Notice tone="info" title={isCoordinator ? 'Ámbito: todos los centros COAMO' : 'Ámbito: tus centros'}>
        El servidor solo entrega los datos que tu perfil puede ver (control de acceso en la base de datos). Pacientes incluidos o con
        seguimiento iniciado: {new Set(bundle.wide.map((r) => r.study_code)).size}. Identificadores seudonimizados; sin texto libre.
        Las fechas exactas y el centro pueden actuar como cuasiidentificadores: custodie los ficheros según el plan de protección de datos.
      </Notice>
      <section className="card" aria-labelledby="export-files">
        <h2 id="export-files">Ficheros</h2>
        <fieldset className="coamo-fieldset">
          <legend>Formato</legend>
          <div className="radio-row">
            <label className="radio-inline">
              <input type="radio" name="format" checked={format === 'standard'} onChange={() => setFormat('standard')} />
              Estándar (coma, punto decimal, UTF-8) · R, SPSS, Stata
            </label>
            <label className="radio-inline">
              <input type="radio" name="format" checked={format === 'excel_es'} onChange={() => setFormat('excel_es')} />
              Excel en español (punto y coma, coma decimal, UTF-8 con BOM)
            </label>
          </div>
        </fieldset>
        <div className="table-wrap" style={{ marginTop: 'var(--sp-4)' }}>
          <table>
            <thead><tr><th>Fichero</th><th>Contenido</th><th>Filas</th><th /></tr></thead>
            <tbody>
              <tr>
                <td><code>{files[0].name}</code></td>
                <td>Una fila por paciente y visita (V0 y VF; la visita no registrada aparece con visit_registered = 0).</td>
                <td className="numeric">{bundle.wide.length}</td>
                <td><button type="button" className="button-sm" onClick={() => download(`${stamp}_${files[0].name}`, files[0].content)}>Descargar</button></td>
              </tr>
              <tr>
                <td><code>{files[1].name}</code></td>
                <td>Variable principal: IEXPAC global V0/VF y Δ en pares completos; una fila por paciente.</td>
                <td className="numeric">{bundle.paired.length}</td>
                <td><button type="button" className="button-sm" onClick={() => download(`${stamp}_${files[1].name}`, files[1].content)}>Descargar</button></td>
              </tr>
              <tr>
                <td><code>{files[2].name}</code></td>
                <td>Diccionario de variables: etiqueta, tipo, valores, ausentes y fuente.</td>
                <td className="numeric">—</td>
                <td><button type="button" className="button-sm" onClick={() => download(`${stamp}_${files[2].name}`, files[2].content)}>Descargar</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <ul className="coamo-pending-list" style={{ marginTop: 'var(--sp-4)' }}>
          <li>Esquema de columnas {EXPORT_SCHEMA_VERSION}: nombres estables; cualquier cambio cambiará esta versión.</li>
          <li>Ausente = celda vacía. El motivo se lee en <code>*_status</code> y <code>*_reason</code>; nunca se codifica como 0 ni −999.</li>
          <li>VERITAS-PRN se exporta como códigos de respuesta (1 = Siempre … 5 = Nunca), no como puntuaciones.</li>
          <li>Sin índice de utilidad EQ-5D ni total EVASAF: no hay regla aprobada.</li>
          <li>La descarga se genera en el navegador y no queda registrada en la auditoría (limitación conocida).</li>
        </ul>
      </section>
    </div>
  );
}
