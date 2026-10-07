// Esquema declarativo de las variables del protocolo COAMO (memoria IIS La Fe, 30/08/2026) que se
// registran en las visitas basal y final. Cada campo coincide con una columna de
// public.coag_clinical_assessments y cita la página del protocolo (P).
// Regla: un campo vacío es «no registrado» (NULL), nunca «No» ni cero.

export type Diagnosis = 'HA' | 'HB' | 'EVW';

type Option = { value: string; label: string };

type BaseField = {
  key: string;
  label: string;
  source: string; // página del protocolo
  hint?: string;
  appliesTo?: Diagnosis[];
};

export type ClinicalField =
  | (BaseField & { kind: 'boolean' })
  | (BaseField & { kind: 'enum'; options: Option[] })
  | (BaseField & { kind: 'integer'; min?: number; unit?: string })
  | (BaseField & { kind: 'decimal'; min?: number; step: string; unit?: string })
  | (BaseField & { kind: 'text'; maxLength: number; requires?: string });

export type ClinicalSection = { id: string; title: string; fields: ClinicalField[] };

export const CLINICAL_SECTIONS: ClinicalSection[] = [
  {
    id: 'anthropometry',
    title: 'Datos antropométricos',
    fields: [
      { key: 'weight_kg', label: 'Peso', kind: 'decimal', step: '0.1', min: 0, unit: 'kg', source: 'P p. 10' },
      { key: 'height_m', label: 'Altura', kind: 'decimal', step: '0.01', min: 0, unit: 'm', source: 'P p. 10', hint: 'En metros (p. ej., 1,75). El IMC lo calcula la base de datos.' },
    ],
  },
  {
    id: 'social',
    title: 'Variables sociosanitarias',
    fields: [
      { key: 'education_level', label: 'Nivel de estudios', kind: 'enum', source: 'P p. 10', options: [
        { value: 'none', label: 'Sin estudios' }, { value: 'primary', label: 'Primaria' },
        { value: 'secondary', label: 'Secundaria' }, { value: 'higher', label: 'Estudios superiores' }] },
      { key: 'employment_status', label: 'Situación laboral', kind: 'enum', source: 'P p. 10', options: [
        { value: 'employed', label: 'Empleado' }, { value: 'unemployed', label: 'Desempleado' },
        { value: 'retired', label: 'Jubilado' }, { value: 'sick_leave', label: 'Baja por enfermedad' }] },
      { key: 'socioeconomic_status', label: 'Situación socioeconómica', kind: 'enum', source: 'P p. 11', options: [
        { value: 'favorable', label: 'Favorable' }, { value: 'unfavorable', label: 'Desfavorable' }] },
      { key: 'family_support', label: 'Soporte familiar disponible', kind: 'boolean', source: 'P p. 11' },
      { key: 'functional_autonomy', label: 'Autonomía funcional', kind: 'boolean', source: 'P p. 11' },
      { key: 'physical_activity', label: 'Nivel de actividad física', kind: 'enum', source: 'P p. 11', options: [
        { value: 'sedentary', label: 'Sedentaria' }, { value: 'moderate', label: 'Moderada' }, { value: 'intense', label: 'Intensa' }] },
      { key: 'hospital_access_difficulty', label: 'Dificultad de acceso a la atención hospitalaria', kind: 'boolean', source: 'P p. 11' },
      { key: 'ict_access', label: 'Acceso a tecnologías de la información y comunicación', kind: 'boolean', source: 'P p. 11' },
      { key: 'disease_knowledge', label: 'Nivel de conocimiento de la enfermedad', kind: 'enum', source: 'P p. 11', options: [
        { value: 'limited', label: 'Limitado' }, { value: 'adequate', label: 'Adecuado' }] },
    ],
  },
  {
    id: 'comorbidities',
    title: 'Comorbilidades y hábitos tóxicos',
    fields: [
      { key: 'infection_from_blood_products', label: 'Enfermedades infecciosas secundarias a hemoderivados', kind: 'boolean', source: 'P p. 11' },
      { key: 'diabetes', label: 'Diabetes', kind: 'boolean', source: 'P p. 11' },
      { key: 'hypertension', label: 'Hipertensión', kind: 'boolean', source: 'P p. 11' },
      { key: 'obesity', label: 'Obesidad', kind: 'boolean', source: 'P p. 11' },
      { key: 'psychological_problems', label: 'Problemas psicológicos', kind: 'boolean', source: 'P p. 11' },
      { key: 'smoking', label: 'Hábito tabáquico', kind: 'boolean', source: 'P p. 11' },
      { key: 'alcohol_use', label: 'Consumo de alcohol', kind: 'boolean', source: 'P p. 11' },
    ],
  },
  {
    id: 'clinical',
    title: 'Variables clínicas',
    fields: [
      { key: 'hemophilia_severity', label: 'Gravedad de la hemofilia', kind: 'enum', source: 'P p. 11', appliesTo: ['HA', 'HB'],
        hint: 'Según concentración plasmática del factor deficitario: leve >5%, moderada 1-5%, grave <1%.', options: [
        { value: 'mild', label: 'Leve' }, { value: 'moderate', label: 'Moderada' }, { value: 'severe', label: 'Grave' }] },
      { key: 'vwd_type', label: 'Tipo de enfermedad de von Willebrand', kind: 'enum', source: 'P p. 11', appliesTo: ['EVW'], options: [
        { value: '1', label: 'Tipo 1' }, { value: '2', label: 'Tipo 2' }, { value: '3', label: 'Tipo 3' }] },
      { key: 'years_since_diagnosis', label: 'Años desde el diagnóstico', kind: 'integer', min: 0, unit: 'años', source: 'P p. 11' },
      { key: 'inhibitors', label: 'Desarrollo de inhibidores', kind: 'boolean', source: 'P pp. 11-12' },
      { key: 'annualized_bleeding_rate', label: 'Tasa anualizada de sangrados', kind: 'decimal', step: '0.01', min: 0, source: 'P p. 11',
        hint: 'Episodios de sangrado registrados en el periodo de seguimiento, ajustados a 12 meses.' },
      { key: 'spontaneous_bleeds', label: 'Número de sangrados espontáneos', kind: 'integer', min: 0, source: 'P p. 12' },
      { key: 'traumatic_bleeds', label: 'Número de sangrados traumáticos', kind: 'integer', min: 0, source: 'P p. 12' },
      { key: 'annualized_joint_bleeding_rate', label: 'Tasa anualizada de sangrados articulares', kind: 'decimal', step: '0.01', min: 0, source: 'P p. 11',
        hint: 'Episodios de sangrado articular en el periodo de seguimiento, ajustados a 12 meses.' },
      { key: 'bleeding_severity_last_year', label: 'Gravedad de los sangrados en el último año', kind: 'enum', source: 'P p. 11', options: [
        { value: 'not_applicable', label: 'No aplica' }, { value: 'outpatient', label: 'Manejo ambulatorio' },
        { value: 'hospital_admission', label: 'Ingreso hospitalario' }] },
      { key: 'hemophilic_arthropathy', label: 'Artropatía hemofílica', kind: 'boolean', source: 'P p. 11' },
      { key: 'target_joint_present', label: 'Articulación diana', kind: 'boolean', source: 'P p. 11',
        hint: '≥3 hemartrosis en la misma articulación en 6 meses consecutivos.' },
      { key: 'target_joint_detail', label: 'Localización de la articulación diana', kind: 'text', maxLength: 80, requires: 'target_joint_present', source: 'P p. 11',
        hint: 'Solo la localización (p. ej., «rodilla derecha»). Sin datos identificativos.' },
      { key: 'joint_pain', label: 'Dolor articular', kind: 'enum', source: 'P p. 11', options: [
        { value: 'absent', label: 'Ausente' }, { value: 'mild_moderate', label: 'Leve-moderado' }, { value: 'persistent', label: 'Persistente' }] },
      { key: 'hjhs_score', label: 'Hemophilia Joint Health Score (HJHS)', kind: 'decimal', step: '0.1', min: 0, source: 'P p. 12', hint: 'Solo si se ha determinado.' },
      { key: 'head_us_score', label: 'HEAD-US', kind: 'decimal', step: '0.1', min: 0, source: 'P p. 12', hint: 'Solo si se ha determinado.' },
    ],
  },
  {
    id: 'treatment',
    title: 'Tratamiento',
    fields: [
      { key: 'treatment_regimen', label: 'Régimen de tratamiento', kind: 'enum', source: 'P p. 11', options: [
        { value: 'prophylaxis', label: 'Profilaxis' }, { value: 'on_demand', label: 'A demanda' }] },
      { key: 'treatment_type', label: 'Tipo de tratamiento', kind: 'enum', source: 'P p. 11', options: [
        { value: 'plasma_derived', label: 'Plasmático' },
        { value: 'recombinant_standard', label: 'Recombinante de vida media estándar' },
        { value: 'recombinant_extended', label: 'Recombinante de vida media extendida' },
        { value: 'non_replacement', label: 'Terapia no sustitutiva' },
        { value: 'rebalancing', label: 'Terapia rebalanceadora' },
        { value: 'gene_therapy', label: 'Terapia génica' }] },
      { key: 'hemostatic_agent', label: 'Agente hemostático', kind: 'text', maxLength: 120, source: 'P p. 11', hint: 'Principio activo o nombre comercial.' },
      { key: 'regimen_changed_since_last_visit', label: 'Cambios en el régimen desde la última visita', kind: 'boolean', source: 'P p. 11' },
      { key: 'dispensing_mode', label: 'Dispensación del tratamiento', kind: 'enum', source: 'P p. 11', options: [
        { value: 'hospital', label: 'Hospital' }, { value: 'proximity_home', label: 'Proximidad: domicilio' },
        { value: 'proximity_pharmacy', label: 'Proximidad: oficina de farmacia' }] },
      { key: 'polypharmacy', label: 'Polifarmacia', kind: 'boolean', source: 'P p. 11', hint: '≥5 medicamentos concurrentes.' },
    ],
  },
  {
    id: 'therapeutic',
    title: 'Resultados terapéuticos',
    fields: [
      { key: 'deficient_factor_level', label: 'Concentración de factor deficitario', kind: 'decimal', step: '0.001', min: 0, source: 'P p. 12',
        hint: 'En pacientes con terapia de reemplazo.' },
      { key: 'half_life_hours', label: 'Tiempo de semivida de la terapia de reemplazo', kind: 'decimal', step: '0.01', min: 0, unit: 'h', source: 'P p. 12', hint: 'Solo si se ha determinado.' },
      { key: 'auc', label: 'Área bajo la curva de la terapia de reemplazo', kind: 'decimal', step: '0.01', min: 0, source: 'P p. 12', hint: 'Solo si se ha determinado.' },
      { key: 'dose_modified', label: 'Modificación de la pauta de tratamiento', kind: 'boolean', source: 'P p. 12' },
      { key: 'hemostatic_agent_changed', label: 'Cambio de agente hemostático', kind: 'boolean', source: 'P p. 12' },
      { key: 'factor_needed_for_bleeds', label: 'Necesidad de factor para el manejo de sangrados', kind: 'boolean', source: 'P p. 12' },
    ],
  },
  {
    id: 'dispensing',
    title: 'Registro de dispensaciones (últimos 12 meses)',
    fields: [
      { key: 'dispensations_collected', label: 'Dispensaciones de agentes hemostáticos recogidas', kind: 'integer', min: 0, source: 'P p. 12' },
      { key: 'dispensations_expected', label: 'Dispensaciones previstas', kind: 'integer', min: 0, source: 'P p. 12' },
    ],
  },
];

export const ALL_CLINICAL_FIELDS: ClinicalField[] = CLINICAL_SECTIONS.flatMap((section) => section.fields);

export function fieldApplies(field: ClinicalField, diagnosis: Diagnosis): boolean {
  return !field.appliesTo || field.appliesTo.includes(diagnosis);
}

export type ClinicalValues = Record<string, string | number | boolean | null>;

/**
 * Prepara el envío: solo campos aplicables al diagnóstico; '' → null; números convertidos.
 * Devuelve errores de validación en lugar de enviar datos dudosos.
 */
export function buildClinicalPayload(values: ClinicalValues, diagnosis: Diagnosis): { payload: ClinicalValues; errors: string[] } {
  const payload: ClinicalValues = {};
  const errors: string[] = [];

  for (const field of ALL_CLINICAL_FIELDS) {
    const raw = values[field.key];
    if (!fieldApplies(field, diagnosis)) {
      payload[field.key] = null;
      continue;
    }
    if (raw === undefined || raw === null || raw === '') {
      payload[field.key] = null;
      continue;
    }
    switch (field.kind) {
      case 'boolean':
        payload[field.key] = raw === true || raw === 'true';
        break;
      case 'enum':
        if (!field.options.some((option) => option.value === raw)) errors.push(`${field.label}: opción no válida.`);
        payload[field.key] = String(raw);
        break;
      case 'integer': {
        const n = Number(String(raw).replace(',', '.'));
        if (!Number.isInteger(n) || (field.min !== undefined && n < field.min)) errors.push(`${field.label}: debe ser un número entero ≥ ${field.min ?? 0}.`);
        payload[field.key] = n;
        break;
      }
      case 'decimal': {
        const n = Number(String(raw).replace(',', '.'));
        if (!Number.isFinite(n) || (field.min !== undefined && n < field.min)) errors.push(`${field.label}: debe ser un número ≥ ${field.min ?? 0}.`);
        payload[field.key] = n;
        break;
      }
      case 'text': {
        const text = String(raw).trim();
        if (text.length > field.maxLength) errors.push(`${field.label}: máximo ${field.maxLength} caracteres.`);
        payload[field.key] = text === '' ? null : text;
        break;
      }
    }
  }

  for (const field of ALL_CLINICAL_FIELDS) {
    if (field.kind === 'text' && field.requires && payload[field.key] !== null && payload[field.requires] !== true) {
      payload[field.key] = null;
    }
  }
  if (typeof payload.height_m === 'number' && payload.height_m > 3) {
    errors.push('Altura: indíquela en metros (p. ej., 1,75).');
  }
  return { payload, errors };
}

/** % de dispensaciones recogidas/previstas (P p. 12). Sin denominador no hay porcentaje. */
export function dispensingPercentage(collected: number | null, expected: number | null): number | null {
  if (collected == null || expected == null || expected === 0) return null;
  return Math.round((collected / expected) * 1000) / 10;
}
