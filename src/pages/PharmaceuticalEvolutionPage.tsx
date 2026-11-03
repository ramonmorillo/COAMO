import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useBlocker, useParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import { EVOLUTION_MAX_LENGTH, buildClinicalNote, validateEvolution, type EvolutionRecord } from '../domain/evolution';
import { MODALITY_LABEL, VISIT_STATUS_LABEL, VISIT_TYPE_LABEL, formatDate } from '../domain/study';
import { getOwnProfile } from '../services/coamoDataService';
import { getEvolution, listEvolutionHistory, saveEvolution, type EvolutionAuditEntry } from '../services/evolutionService';
import { getPatient, getVisit, type Patient, type Visit } from '../services/patientService';
import { getStratification, type StratificationRecord } from '../services/stratificationService';

type Message = { tone: 'success' | 'danger' | 'info'; text: string };

export function PharmaceuticalEvolutionPage() {
  const { visitId = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [visit, setVisit] = useState<Visit | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [strat, setStrat] = useState<StratificationRecord | null>(null);
  const [record, setRecord] = useState<EvolutionRecord | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [isCoordinator, setIsCoordinator] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    const v = await getVisit(visitId);
    if (v.error || !v.data) {
      setLoadError(v.error ?? 'Visita no encontrada o sin acceso.');
      setLoading(false);
      return;
    }
    const [p, e, s, profile] = await Promise.all([getPatient(v.data.patient_id), getEvolution(visitId), getStratification(visitId), getOwnProfile()]);
    setVisit(v.data);
    setPatient(p.data);
    setRecord(e.data);
    setText(e.data?.evolution_text ?? '');
    setStrat(s.data);
    setIsCoordinator(profile.data?.role === 'coordinator');
    setLoadError(p.error ?? e.error ?? null);
    setLoading(false);
  }, [visitId]);

  useEffect(() => { void load(); }, [load]);

  const dirty = text.trim() !== (record?.evolution_text ?? '').trim() && !(record === null && text.trim() === '');
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm('Hay cambios sin guardar en la evolución farmacéutica. ¿Salir y descartarlos?')) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const note = useMemo(() => {
    if (!visit || !record) return null;
    const completed = strat && strat.status === 'completed' ? strat : null;
    return buildClinicalNote({
      visitType: visit.visit_type, visitDate: visit.visit_date, modality: visit.modality, evolutionText: record.evolution_text,
      stratification: completed ? {
        finalPriority: completed.final_priority, modelPriority: completed.model_priority, score: completed.score,
        raised: Boolean(completed.raised_priority), modelVersion: completed.model_version,
      } : null,
    });
  }, [visit, record, strat]);

  if (loading) return <LoadingState label="Cargando evolución farmacéutica..." />;
  if (loadError || !visit || !patient) return <ErrorState title="No se pudo cargar la evolución" message={loadError ?? 'Sin datos.'} />;

  const errors = validateEvolution(text);
  const cancelled = visit.status === 'cancelled';

  const save = async () => {
    if (errors.length > 0) {
      setMessage({ tone: 'danger', text: errors.join(' ') });
      return;
    }
    setSaving(true);
    setMessage(null);
    const result = await saveEvolution(visit.id, text.trim(), record?.revision ?? null);
    setSaving(false);
    if (result.error || !result.data) {
      // Nunca se muestra como guardado si la BD no devolvió la fila: el texto sigue en pantalla.
      setMessage({ tone: 'danger', text: result.error ?? 'No se ha guardado.' });
      return;
    }
    setRecord(result.data);
    setText(result.data.evolution_text);
    setMessage({ tone: 'success', text: `Evolución guardada (revisión ${result.data.revision}).` });
  };

  const copy = async () => {
    if (!note) return;
    setPreview(note);
    try {
      await navigator.clipboard.writeText(note);
      setMessage({ tone: 'success', text: 'Texto copiado. Revísalo antes de pegarlo en la historia clínica: COAMO no escribe en ella.' });
    } catch {
      setMessage({ tone: 'info', text: 'El navegador no permitió copiar automáticamente: selecciona el texto de la vista previa y cópialo.' });
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="Evolución farmacéutica"
        description={`${patient.study_code} · ${VISIT_TYPE_LABEL[visit.visit_type]} del ${formatDate(visit.visit_date)} · ${MODALITY_LABEL[visit.modality]} · ${VISIT_STATUS_LABEL[visit.status]}`}
      />
      <p><Link to={`/patients/${patient.id}`}>← Volver a la ficha del paciente</Link></p>

      <section className="card" aria-labelledby="evo-edit">
        <h2 id="evo-edit">Evolución clínica y farmacoterapéutica</h2>
        <p className="help-text">
          Texto libre asociado a esta visita. No escribas nombre, NHC, DNI, teléfonos ni otros identificadores: COAMO es una base seudonimizada.
          Cada cambio queda registrado con autor y fecha, y se conservan las versiones anteriores.
        </p>
        {cancelled && !record ? <Notice tone="warning">La visita está anulada: no se registra evolución.</Notice> : null}
        <label htmlFor="evo-text" className="visually-hidden">Evolución farmacéutica</label>
        <textarea
          id="evo-text" rows={12} value={text} maxLength={EVOLUTION_MAX_LENGTH + 500} disabled={saving || (cancelled && !record)}
          onChange={(e) => { setText(e.target.value); setMessage(null); }}
          style={{ width: '100%' }}
        />
        <p className="coamo-field-hint">{text.trim().length}/{EVOLUTION_MAX_LENGTH} caracteres{dirty ? ' · cambios sin guardar' : ''}</p>
        {record ? (
          <p className="coamo-field-hint">
            Revisión {record.revision} · creada el {new Date(record.created_at).toLocaleString('es-ES')} · última modificación el {new Date(record.updated_at).toLocaleString('es-ES')}
            {record.updated_by && record.updated_by !== record.created_by ? ' (por otro profesional)' : ''}
          </p>
        ) : <p className="coamo-field-hint">Sin evolución registrada en esta visita.</p>}
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        <div className="form-actions">
          <button type="button" onClick={() => void save()} disabled={saving || !dirty || (cancelled && !record)}>
            {saving ? 'Guardando…' : 'Guardar evolución'}
          </button>
          <button type="button" className="button-secondary" onClick={() => void copy()} disabled={!record || dirty}
            title={dirty ? 'Guarda antes de copiar: se copia solo el texto guardado.' : undefined}>
            Copiar evolución para historia clínica
          </button>
        </div>
        {dirty && record ? <p className="coamo-field-hint">Guarda antes de copiar: el texto copiado es siempre el guardado en la base de datos.</p> : null}
      </section>

      {preview ? (
        <section className="card" aria-labelledby="evo-preview">
          <h2 id="evo-preview">Texto para la historia clínica (revisar antes de pegar)</h2>
          <pre className="coamo-note-preview" style={{ whiteSpace: 'pre-wrap' }}>{preview}</pre>
          <p className="coamo-field-hint">
            Incluye fecha, tipo y modalidad de la visita, la estratificación CMO completada en esa visita y la valoración. No incluye el código del
            estudio ni otros identificadores. Las actuaciones farmacéuticas se añadirán cuando exista el catálogo aprobado.
          </p>
        </section>
      ) : null}

      {isCoordinator && record ? <EvolutionHistory visitId={visit.id} revision={record.revision} /> : null}
    </div>
  );
}

function EvolutionHistory({ visitId, revision }: { visitId: string; revision: number }) {
  const [entries, setEntries] = useState<EvolutionAuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void listEvolutionHistory(visitId).then((r) => { setEntries(r.data); setError(r.error); });
  }, [visitId, revision]);
  return (
    <section className="card" aria-labelledby="evo-audit">
      <h2 id="evo-audit">Versiones anteriores <span className="coamo-source">Solo coordinación</span></h2>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {entries && entries.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Acción</th><th>Revisión</th><th>Texto anterior</th></tr></thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={`${e.at}-${i}`}>
                  <td>{new Date(e.at).toLocaleString('es-ES')}</td>
                  <td>{e.action === 'INSERT' ? 'Alta' : e.action === 'UPDATE' ? 'Modificación' : 'Borrado'}</td>
                  <td>{e.new_data?.revision ?? e.old_data?.revision ?? '—'}</td>
                  <td style={{ whiteSpace: 'pre-wrap' }}>{e.old_data?.evolution_text ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : entries ? <p className="text-muted">Sin cambios registrados.</p> : null}
    </section>
  );
}
