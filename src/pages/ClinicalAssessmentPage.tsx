import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { YesNoField } from '../components/forms/YesNoField';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import {
  CLINICAL_SECTIONS, buildClinicalPayload, dispensingPercentage, fieldApplies,
  type ClinicalField, type ClinicalValues,
} from '../domain/clinicalSchema';
import { DIAGNOSIS_LABEL, VISIT_TYPE_LABEL, formatDate } from '../domain/study';
import {
  getClinicalAssessment, getPatient, getVisit, saveClinicalAssessment, type Patient, type Visit,
} from '../services/patientService';

export function ClinicalAssessmentPage() {
  const { visitId = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visit, setVisit] = useState<Visit | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [values, setValues] = useState<ClinicalValues>({});
  const [exists, setExists] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'danger'; text: string; details?: string[] } | null>(null);

  useEffect(() => {
    void (async () => {
      const v = await getVisit(visitId);
      if (v.error || !v.data) {
        setError(v.error ?? 'Visita no encontrada o sin acceso.');
        setLoading(false);
        return;
      }
      const [p, ca] = await Promise.all([getPatient(v.data.patient_id), getClinicalAssessment(visitId)]);
      setVisit(v.data);
      setPatient(p.data);
      setValues(ca.data ?? {});
      setExists(Boolean(ca.data));
      setError(p.error ?? ca.error);
      setLoading(false);
    })();
  }, [visitId]);

  if (loading) return <LoadingState label="Cargando datos clínicos..." />;
  if (error || !visit || !patient) return <ErrorState title="No se pudieron cargar los datos" message={error ?? 'Sin datos.'} />;
  if (visit.visit_type !== 'baseline' && visit.visit_type !== 'final') {
    return <ErrorState title="Visita no válida" message="Los datos clínicos del protocolo se registran en las visitas basal y final." />;
  }

  const set = (key: string, value: string | number | boolean | null) => setValues((current) => ({ ...current, [key]: value }));
  const pct = dispensingPercentage(
    values.dispensations_collected === '' || values.dispensations_collected == null ? null : Number(values.dispensations_collected),
    values.dispensations_expected === '' || values.dispensations_expected == null ? null : Number(values.dispensations_expected),
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const { payload, errors } = buildClinicalPayload(values, patient.diagnosis);
    if (errors.length > 0) {
      setResult({ tone: 'danger', text: 'Revisa estos campos antes de guardar:', details: errors });
      return;
    }
    setSaving(true);
    const saved = await saveClinicalAssessment(visit.id, payload, exists);
    setSaving(false);
    if (saved.error) {
      setResult({ tone: 'danger', text: saved.error });
      return;
    }
    setExists(true);
    const refreshed = await getClinicalAssessment(visit.id);
    if (refreshed.data) setValues(refreshed.data);
    setResult({ tone: 'success', text: 'Datos clínicos guardados.' });
  };

  const renderField = (field: ClinicalField) => {
    const value = values[field.key];
    const label = (
      <>
        {field.label}
        {'unit' in field && field.unit ? ` (${field.unit})` : ''}
        <span className="coamo-source">{field.source}</span>
      </>
    );
    if (field.kind === 'boolean') {
      return (
        <YesNoField key={field.key} name={field.key} label={field.label} hint={field.hint}
          value={typeof value === 'boolean' ? value : null} onChange={(v) => set(field.key, v)} />
      );
    }
    if (field.kind === 'text' && field.requires && values[field.requires] !== true) return null;
    return (
      <label key={field.key}>
        {label}
        {field.kind === 'enum' ? (
          <select value={value == null ? '' : String(value)} onChange={(e) => set(field.key, e.target.value || null)}>
            <option value="">Sin registrar</option>
            {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : field.kind === 'text' ? (
          <input value={value == null ? '' : String(value)} maxLength={field.maxLength} onChange={(e) => set(field.key, e.target.value)} />
        ) : (
          <input type="number" inputMode="decimal" min={field.min}
            step={field.kind === 'integer' ? '1' : field.step}
            value={value == null ? '' : String(value)} onChange={(e) => set(field.key, e.target.value)} />
        )}
        {field.hint ? <span className="coamo-field-hint" style={{ display: 'block', marginTop: '0.3rem' }}>{field.hint}</span> : null}
      </label>
    );
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={`${patient.study_code} · ${DIAGNOSIS_LABEL[patient.diagnosis]}`}
        title={`Datos clínicos · ${VISIT_TYPE_LABEL[visit.visit_type]}`}
        description={`Visita del ${formatDate(visit.visit_date)}. Variables del protocolo COAMO (pp. 10-12). Deja vacío lo que no conste: no se interpreta como «No».`}
        actions={<Link className="button-link button-secondary" to={`/patients/${patient.id}`}>Volver a la ficha</Link>}
      />
      <form className="page-stack" onSubmit={submit}>
        {CLINICAL_SECTIONS.map((section) => {
          const fields = section.fields.filter((f) => fieldApplies(f, patient.diagnosis));
          if (fields.length === 0) return null;
          return (
            <section key={section.id} className="card" aria-labelledby={`sec-${section.id}`}>
              <h2 id={`sec-${section.id}`}>{section.title}</h2>
              <div className="grid-2" style={{ marginTop: 'var(--sp-3)' }}>{fields.map(renderField)}</div>
              {section.id === 'anthropometry' && typeof values.bmi === 'number' ? (
                <p className="coamo-field-hint" style={{ marginTop: 'var(--sp-3)' }}>IMC guardado: {String(values.bmi).replace('.', ',')} kg/m²</p>
              ) : null}
              {section.id === 'dispensing' ? (
                <p className="coamo-field-hint" style={{ marginTop: 'var(--sp-3)' }}>
                  Dispensaciones recogidas / previstas: {pct === null ? 'no calculable (falta algún dato o no hay dispensaciones previstas)' : `${String(pct).replace('.', ',')} %`}
                  {pct !== null && pct > 100 ? ' · Revisa: más recogidas que previstas.' : ''}
                </p>
              ) : null}
            </section>
          );
        })}
        {result ? (
          <Notice tone={result.tone}>
            {result.text}
            {result.details ? <ul className="coamo-gap-list">{result.details.map((d) => <li key={d}>{d}</li>)}</ul> : null}
          </Notice>
        ) : null}
        <div className="form-actions">
          <button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar datos clínicos'}</button>
        </div>
      </form>
    </div>
  );
}
