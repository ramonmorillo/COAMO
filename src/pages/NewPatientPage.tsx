import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import type { Diagnosis } from '../domain/clinicalSchema';
import { DIAGNOSIS_LABEL, SEX_LABEL } from '../domain/study';
import { patientCodePrefix, type CoamoCenter } from '../services/centerDisplay';
import { listVisibleCenters } from '../services/coamoDataService';
import { createPatient } from '../services/patientService';

export function NewPatientPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [centers, setCenters] = useState<CoamoCenter[]>([]);
  const [centerId, setCenterId] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<'male' | 'female' | ''>('');
  const [diagnosis, setDiagnosis] = useState<Diagnosis | ''>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await listVisibleCenters();
      const recruiting = result.data.filter((c) => c.is_active && c.center_role === 'recruiting' && c.study_number != null);
      setCenters(recruiting);
      if (recruiting.length === 1) setCenterId(recruiting[0].id);
      setError(result.errorMessage);
      setLoading(false);
    })();
  }, []);

  const ageNumber = Number(age);
  const ageValid = age !== '' && Number.isInteger(ageNumber) && ageNumber >= 0 && ageNumber <= 120;
  const canSubmit = centerId && ageValid && sex && diagnosis && !saving;
  const selected = centers.find((c) => c.id === centerId);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    const result = await createPatient({ center_id: centerId, age_at_inclusion: ageNumber, sex: sex as 'male' | 'female', diagnosis: diagnosis as Diagnosis });
    setSaving(false);
    if (result.error || !result.data) {
      setError(result.error ?? 'No se pudo dar de alta el paciente.');
      return;
    }
    navigate(`/patients/${result.data.id}`, { replace: true });
  };

  if (loading) return <LoadingState label="Cargando centros..." />;

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Pacientes" title="Nuevo paciente" description="Alta en cribado. La inclusión se confirma después, al verificar los criterios y el consentimiento." />

      {centers.length === 0 ? (
        <Notice tone="warning">No tienes ningún centro reclutador asignado. Los centros consultores no incluyen pacientes.</Notice>
      ) : (
        <section className="card">
          <Notice tone="info" title="Paciente seudonimizado">
            No introduzcas nombre, NHC, DNI, fecha de nacimiento ni datos de contacto. La base de datos asigna el código del
            estudio; anota la correspondencia en el registro de tu centro.
          </Notice>
          <form className="form-grid" onSubmit={handleSubmit} style={{ marginTop: 'var(--sp-4)' }}>
            <div className="grid-2">
              <label>
                Centro
                <select value={centerId} onChange={(e) => setCenterId(e.target.value)} required>
                  <option value="">Selecciona…</option>
                  {centers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Edad (años)
                <input type="number" inputMode="numeric" min={0} max={120} value={age} onChange={(e) => setAge(e.target.value)} required />
              </label>
            </div>
            {age !== '' && ageValid && ageNumber < 18 ? (
              <Notice tone="warning">El estudio incluye pacientes de 18 años o más: podrás registrarlo en cribado, pero no incluirlo.</Notice>
            ) : null}
            <fieldset className="coamo-fieldset">
              <legend>Sexo</legend>
              <div className="coamo-radio-row">
                {(Object.keys(SEX_LABEL) as Array<'male' | 'female'>).map((value) => (
                  <label key={value} className="radio-inline">
                    <input type="radio" name="sex" checked={sex === value} onChange={() => setSex(value)} /> {SEX_LABEL[value]}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="coamo-fieldset">
              <legend>Diagnóstico</legend>
              <div className="coamo-radio-row">
                {(Object.keys(DIAGNOSIS_LABEL) as Diagnosis[]).map((value) => (
                  <label key={value} className="radio-inline">
                    <input type="radio" name="diagnosis" checked={diagnosis === value} onChange={() => setDiagnosis(value)} /> {DIAGNOSIS_LABEL[value]}
                  </label>
                ))}
              </div>
            </fieldset>
            {selected ? (
              <p className="coamo-field-hint">El código del paciente tendrá la forma <code>{patientCodePrefix(selected)}NNNN</code>.</p>
            ) : null}
            {error ? <ErrorState title="No se pudo dar de alta" message={error} /> : null}
            <div className="form-actions">
              <button type="submit" disabled={!canSubmit}>{saving ? 'Guardando...' : 'Dar de alta en cribado'}</button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
