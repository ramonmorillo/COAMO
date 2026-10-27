// Modelo de estratificación CMO para coagulopatías congénitas (SEFH, «Adaptación del Modelo de Atención
// Farmacéutica CMO al paciente con coagulopatías congénitas», v2.0; en adelante «M»). Tablas 1-4 (M pp. 12-16),
// puntos de corte y excepciones (M p. 17), periodicidad y elevación de nivel (M pp. 18-19).
//
// Reglas de lectura documentadas (docs/ESTRATIFICACION_CMO.md):
//   · Las 23 variables del modelo se representan con 26 preguntas: «Cambios en el régimen», «Presencia de
//     comorbilidades» y «Estilo de vida» tienen dos descripciones que SUMAN. Es la única lectura compatible
//     con las puntuaciones máximas de M (25, 15 y 16) y con el caso clínico 1 (M p. 65: 2 + 3 en tratamiento).
//   · Puntos de corte inclusivos: ≥ 28 → Prioridad 1; ≥ 20 → Prioridad 2; resto → Prioridad 3.
//   · Dato ausente ≠ 0 puntos: con preguntas sin responder se calcula el intervalo [mínimo, máximo] posible y la
//     prioridad solo se asigna si ambos extremos caen en el mismo nivel.
//   · La excepción por terapia avanzada asigna Prioridad 1 con independencia de la puntuación.
//   · El profesional puede ELEVAR el nivel con motivo (M p. 19); nunca bajarlo.

import type { Diagnosis } from './clinicalSchema';
import { FOLLOWUP_BY_PRIORITY } from './study';

export const STRATIFICATION_MODEL_VERSION = 'CMO-COAG-SEFH-v2.0';
export const PRIORITY_1_CUTOFF = 28;
export const PRIORITY_2_CUTOFF = 20;

export type Priority = 1 | 2 | 3;
export type Dimension = 'demographic' | 'clinical' | 'treatment' | 'social';

export const DIMENSION_LABEL: Record<Dimension, string> = {
  demographic: 'Dimensión demográfica',
  clinical: 'Dimensión clínica',
  treatment: 'Dimensión de tratamiento',
  social: 'Dimensión sociosanitaria',
};

export type StratOption = { value: string; label: string; points: number };

export type StratVariable = {
  id: string;
  dimension: Dimension;
  /** Nombre de la variable en M (las preguntas desdobladas comparten nombre). */
  modelVariable: string;
  question: string;
  source: string;
  options: StratOption[];
  appliesTo?: Diagnosis[];
  /** Pregunta que no puntúa: activa una excepción del modelo. */
  exception?: 'pediatric' | 'advanced_therapy';
  /** Fuera del pretest con el que se fijaron los puntos de corte (M p. 16). */
  outsidePretest?: boolean;
  hint?: string;
};

const yesNo = (points: number): StratOption[] => [
  { value: 'yes', label: 'Sí', points },
  { value: 'no', label: 'No', points: 0 },
];

export const STRAT_VARIABLES: StratVariable[] = [
  // ── Tabla 1 · Demográfica (máx. 3) ──
  { id: 'age', dimension: 'demographic', modelVariable: 'Edad', source: 'M Tabla 1, p. 12', exception: 'pediatric',
    question: 'Edad del paciente', options: [
      { value: 'lt18', label: 'Menor de 18 años (modelo pediátrico)', points: 0 },
      { value: '18_50', label: 'Entre 18 y 50 años', points: 1 },
      { value: 'gt50', label: 'Más de 50 años', points: 2 }] },
  { id: 'obesity', dimension: 'demographic', modelVariable: 'Peso', source: 'M Tabla 1, p. 12',
    question: 'Obesidad: IMC ≥ 30 kg/m²', options: yesNo(1) },

  // ── Tabla 2 · Clínica (máx. 25) ──
  { id: 'inhibitors', dimension: 'clinical', modelVariable: 'Desarrollo de inhibidores frente al FVIII o FIX', source: 'M Tabla 2, p. 13',
    question: 'Ha desarrollado inhibidores contra el factor VIII o IX', options: yesNo(3) },
  { id: 'pain', dimension: 'clinical', modelVariable: 'Dolor', source: 'M Tabla 2, p. 13',
    question: 'Dolor', options: [
      { value: 'none', label: 'Sin dolor', points: 0 },
      { value: 'mild_moderate', label: 'Dolor leve/moderado', points: 1 },
      { value: 'persistent', label: 'Dolor persistente por daño articular crónico (sangrados repetidos)', points: 2 },
      { value: 'acute', label: 'Dolor agudo por hemartrosis o hematoma muscular (hemorragia activa)', points: 3 }],
    hint: 'El dolor agudo por hemorragia activa no se recoge en los datos clínicos del protocolo: indíquelo aquí.' },
  { id: 'joint_status', dimension: 'clinical', modelVariable: 'Estado/salud articular', source: 'M Tabla 2, p. 13',
    question: 'Complicaciones musculoesqueléticas por las hemorragias (artropatía, contracturas permanentes, deformidades, discapacidad o prótesis articular secundaria)',
    options: yesNo(3) },
  { id: 'bleeding_management', dimension: 'clinical', modelVariable: 'Gravedad (según tipo de hemorragia)', source: 'M Tabla 2, p. 13',
    question: 'Manejo de las hemorragias', options: [
      { value: 'none', label: 'Sin hemorragias', points: 0 },
      { value: 'hospital_admission', label: 'Hemorragias que requieren ingreso hospitalario', points: 2 },
      { value: 'outpatient', label: 'Hemorragias manejadas de forma ambulatoria o en domicilio', points: 3 }],
    hint: 'Puntuación tal como figura en M (ingreso 2, ambulatorio 3). Pendiente de confirmar con los autores: ver documentación.' },
  { id: 'hemophilia_severity', dimension: 'clinical', modelVariable: 'Gravedad para hemofilia', source: 'M Tabla 2, p. 13', appliesTo: ['HA', 'HB'],
    question: 'Gravedad de la hemofilia (nivel de FVIII:C o FIX:C)', options: [
      { value: 'mild', label: 'Leve (>5 % – <40 %)', points: 0 },
      { value: 'moderate', label: 'Moderada (1-5 %)', points: 1 },
      { value: 'severe', label: 'Grave (<1 %)', points: 3 }] },
  { id: 'vwd_type', dimension: 'clinical', modelVariable: 'Gravedad para EVW', source: 'M Tabla 2, p. 13', appliesTo: ['EVW'],
    question: 'Tipo de enfermedad de von Willebrand', options: [
      { value: '1', label: 'Tipo 1', points: 0 },
      { value: '2', label: 'Tipo 2', points: 1 },
      { value: '3', label: 'Tipo 3', points: 3 }] },
  { id: 'spontaneous_bleeds_gt2', dimension: 'clinical', modelVariable: 'Número de hemorragias', source: 'M Tabla 2, p. 14',
    question: 'Más de 2 hemorragias espontáneas al año que han requerido tratamiento', options: yesNo(4) },
  { id: 'comorbidity', dimension: 'clinical', modelVariable: 'Presencia de comorbilidades', source: 'M Tabla 2, p. 14',
    question: 'Comorbilidades además de la patología de base (VIH, hepatitis C, cáncer, ACV, enfermedad cardiovascular, DM, osteoporosis, enfermedad renal, etc.)',
    options: yesNo(1) },
  { id: 'degenerative_joint', dimension: 'clinical', modelVariable: 'Presencia de comorbilidades', source: 'M Tabla 2, p. 14',
    question: 'Patología articular degenerativa', options: yesNo(2),
    hint: 'Se suma a la anterior (puntuación máxima de M). Su relación con «Estado/salud articular» no está definida en M.' },
  { id: 'psychological', dimension: 'clinical', modelVariable: 'Problemas psicológicos', source: 'M Tabla 2, p. 14',
    question: 'Problemas relacionados con la salud mental (ansiedad, depresión)', options: yesNo(3) },

  // ── Tabla 3 · Tratamiento (máx. 15) ──
  { id: 'advanced_therapy', dimension: 'treatment', modelVariable: 'Agente hemostásico empleado', source: 'M Tabla 3, p. 15; excepción p. 17',
    exception: 'advanced_therapy', question: 'Terapia génica y/o cualquier otra terapia avanzada', options: yesNo(0) },
  { id: 'route', dimension: 'treatment', modelVariable: 'Vía de administración del agente hemostático', source: 'M Tabla 3, p. 15',
    question: 'Vía de administración', options: [
      { value: 'sc_only', label: 'Solo subcutánea (o sin agente parenteral)', points: 0 },
      { value: 'sc_iv', label: 'Subcutánea combinada con intravenosa', points: 1 },
      { value: 'iv', label: 'Intravenosa', points: 2 }],
    hint: 'M no puntúa la vía subcutánea exclusiva (0 puntos, coherente con el caso clínico 1).' },
  { id: 'dose_change', dimension: 'treatment', modelVariable: 'Cambios en el régimen de la medicación dispensada', source: 'M Tabla 3, p. 15',
    question: 'Cambio en la dosis o en la pauta posológica desde la última dispensación', options: yesNo(2) },
  { id: 'extra_doses', dimension: 'treatment', modelVariable: 'Cambios en el régimen de la medicación dispensada', source: 'M Tabla 3, p. 15',
    question: 'Dosis adicionales o modificaciones puntuales de pauta desde la última dispensación', options: yesNo(3) },
  { id: 'home_dispensing', dimension: 'treatment', modelVariable: 'Dispensación domiciliaria', source: 'M Tabla 3, p. 15',
    question: 'No acude presencialmente a FH: recibe la medicación a domicilio o en oficina de farmacia', options: yesNo(1) },
  { id: 'prophylaxis', dimension: 'treatment', modelVariable: 'Régimen de tratamiento', source: 'M Tabla 3, p. 15',
    question: 'Tratamiento profiláctico (primario, secundario o terciario)', options: yesNo(3) },
  { id: 'non_adherence', dimension: 'treatment', modelVariable: 'Falta de adherencia al tratamiento', source: 'M Tabla 3, p. 15',
    question: 'Falta de adherencia y/o persistencia subóptima según el registro de dispensación y la HCE', options: yesNo(4),
    hint: 'M no fija un umbral numérico: juicio del farmacéutico con el registro de dispensación y la HCE.' },

  // ── Tabla 4 · Sociosanitaria (máx. 16; 15 en el pretest) ──
  { id: 'socioeconomic', dimension: 'social', modelVariable: 'Entorno familiar y situación socioeconómica', source: 'M Tabla 4, p. 16',
    question: 'Condiciones socioeconómicas desfavorables', options: yesNo(3),
    hint: 'Incluye: no puede almacenar o administrar la medicación en condiciones adecuadas, sin hogar, aislamiento social, sin apoyo familiar (con o sin dependencia funcional), inestabilidad financiera, etc.' },
  { id: 'intense_activity', dimension: 'social', modelVariable: 'Estilo de vida', source: 'M Tabla 4, p. 16',
    question: 'Realiza actividad física intensa', options: yesNo(1) },
  { id: 'cv_risk', dimension: 'social', modelVariable: 'Estilo de vida', source: 'M Tabla 4, p. 16',
    question: 'Uno o más factores de riesgo cardiovascular (hipertensión, obesidad, tabaquismo, entre otros)', options: yesNo(2) },
  { id: 'access_difficulty', dimension: 'social', modelVariable: 'Dificultades de acceso a la atención hospitalaria', source: 'M Tabla 4, p. 16',
    question: 'Dificultades de acceso a la atención hospitalaria', options: yesNo(2) },
  { id: 'limited_knowledge', dimension: 'social', modelVariable: 'Nivel de conocimiento sobre la enfermedad', source: 'M Tabla 4, p. 16',
    question: 'Conocimiento limitado sobre su condición', options: yesNo(3) },
  { id: 'transition', dimension: 'social', modelVariable: 'Transición al régimen de paciente adulto', source: 'M Tabla 4, p. 16',
    question: 'En proceso de transición del régimen pediátrico al de adulto', options: yesNo(4) },
  { id: 'low_qol', dimension: 'social', modelVariable: 'Calidad de vida', source: 'M Tabla 4, p. 16', outsidePretest: true,
    question: 'Baja calidad de vida según cuestionarios validados (SF-36, EQ-5D, Haem-A-QoL…)', options: yesNo(1),
    hint: 'M no define el umbral de «baja calidad de vida». Variable no incluida en el pretest con el que se fijaron los puntos de corte.' },
];

export type StratAnswers = Record<string, string | null | undefined>;

export function applicableVariables(diagnosis: Diagnosis): StratVariable[] {
  return STRAT_VARIABLES.filter((v) => !v.appliesTo || v.appliesTo.includes(diagnosis));
}

export function priorityForScore(score: number): Priority {
  if (score >= PRIORITY_1_CUTOFF) return 1;
  if (score >= PRIORITY_2_CUTOFF) return 2;
  return 3;
}

export type ScoredItem = { variable: StratVariable; answer: string | null; points: number | null; maxPoints: number };

export type StratificationResult = {
  status: 'determined' | 'indeterminate' | 'pediatric_model';
  /** Prioridad por puntuación o excepción (null si indeterminada o modelo pediátrico). */
  modelPriority: Priority | null;
  basis: 'score' | 'advanced_therapy' | null;
  scoreMin: number;
  scoreMax: number;
  /** Solo si no falta ninguna pregunta que puntúe. */
  score: number | null;
  byDimension: Record<Dimension, { points: number; max: number }>;
  items: ScoredItem[];
  missing: StratVariable[];
  warnings: string[];
};

const maxOf = (v: StratVariable) => Math.max(...v.options.map((o) => o.points));

export function computeStratification(diagnosis: Diagnosis, answers: StratAnswers): StratificationResult {
  const variables = applicableVariables(diagnosis);
  const byDimension: StratificationResult['byDimension'] = {
    demographic: { points: 0, max: 0 }, clinical: { points: 0, max: 0 }, treatment: { points: 0, max: 0 }, social: { points: 0, max: 0 },
  };
  const items: ScoredItem[] = [];
  const missing: StratVariable[] = [];
  const warnings: string[] = [];
  let scoreMin = 0;
  let scoreMax = 0;

  for (const variable of variables) {
    const raw = answers[variable.id] ?? null;
    const option = raw === null ? undefined : variable.options.find((o) => o.value === raw);
    const max = maxOf(variable);
    byDimension[variable.dimension].max += max;
    if (!option) {
      items.push({ variable, answer: null, points: null, maxPoints: max });
      missing.push(variable);
      scoreMax += max;
      continue;
    }
    items.push({ variable, answer: option.value, points: option.points, maxPoints: max });
    byDimension[variable.dimension].points += option.points;
    scoreMin += option.points;
    scoreMax += option.points;
  }

  const scoringMissing = missing.filter((v) => maxOf(v) > 0);
  const score = scoringMissing.length === 0 ? scoreMin : null;
  const base = { scoreMin, scoreMax, score, byDimension, items, missing, warnings };

  if (answers.age === 'lt18') {
    return { ...base, status: 'pediatric_model', modelPriority: null, basis: null,
      warnings: ['Paciente menor de 18 años: M indica usar la «Adaptación del Modelo CMO a Pacientes Crónicos Pediátricos» (y el estudio COAMO solo incluye adultos).'] };
  }
  if (answers.advanced_therapy === 'yes') {
    return { ...base, status: 'determined', modelPriority: 1, basis: 'advanced_therapy',
      warnings: ['Terapia génica u otra terapia avanzada: Prioridad 1 con independencia de la puntuación (excepción de M p. 17).'] };
  }

  const low = priorityForScore(scoreMin);
  const high = priorityForScore(scoreMax);
  const ageMissing = !answers.age;
  const advancedMissing = !answers.advanced_therapy;
  if (advancedMissing) warnings.push('Falta indicar si recibe terapia avanzada: si la recibe, es Prioridad 1 sea cual sea la puntuación.');
  if (ageMissing) warnings.push('Falta la edad: si fuera menor de 18 años no se aplicaría este modelo.');

  if (low !== high || advancedMissing || ageMissing) {
    if (low !== high) warnings.push(`Con las preguntas sin responder la puntuación puede ir de ${scoreMin} a ${scoreMax} (Prioridad ${high} a ${low}): complete los datos para asignar el nivel.`);
    return { ...base, status: 'indeterminate', modelPriority: null, basis: null, warnings };
  }
  if (answers.low_qol === 'yes' && priorityForScore(scoreMin - 1) !== low) {
    warnings.push('El nivel depende del punto de «calidad de vida», variable no incluida en el pretest con el que se fijaron los puntos de corte (M p. 17).');
  }
  if (score === null) warnings.push(`Faltan ${scoringMissing.length} pregunta(s), pero no pueden cambiar el nivel (intervalo ${scoreMin}-${scoreMax}).`);
  return { ...base, status: 'determined', modelPriority: low, basis: 'score', warnings };
}

/** Nivel final: el profesional solo puede elevarlo (número menor), con motivo (M p. 19). */
export function finalPriority(modelPriority: Priority | null, raisedTo: Priority | null): { priority: Priority | null; raised: boolean; error: string | null } {
  if (raisedTo === null) return { priority: modelPriority, raised: false, error: null };
  if (modelPriority === null) return { priority: null, raised: false, error: 'No se puede elevar un nivel que aún no está determinado.' };
  if (raisedTo >= modelPriority) return { priority: modelPriority, raised: false, error: 'Solo se puede elevar el nivel (p. ej., de Prioridad 3 a 2 o 1), nunca bajarlo.' };
  return { priority: raisedTo, raised: true, error: null };
}

export function followUpFor(priority: Priority): string {
  return FOLLOWUP_BY_PRIORITY[priority];
}

// ── Información de apoyo al juicio profesional (spec COAMO §5.3-5.4; no puntúa) ──

export type Eq5dContext = { date: string | null; profile: string | null; vas: number | null } | null;

export function contextNotes(clinical: ClinicalSnapshot | null, eq5d: Eq5dContext): Record<string, string> {
  const collected = clinical ? num(clinical.dispensations_collected) : null;
  const expected = clinical ? num(clinical.dispensations_expected) : null;
  const pct = collected === null || expected === null || expected === 0 ? null : Math.round((collected / expected) * 1000) / 10;
  const eqDate = eq5d?.date ? eq5d.date.slice(0, 10).split('-').reverse().join('/') : null;
  return {
    non_adherence: `Dispensaciones recogidas/previstas (últimos 12 meses): ${pct === null ? 'no calculable' : `${String(pct).replace('.', ',')} % (${collected}/${expected})`}. Morisky-Green: sin formulario en la herramienta.`,
    low_qol: eq5d
      ? `EQ-5D-3L${eqDate ? ` del ${eqDate}` : ''}: perfil ${eq5d.profile ?? 'incompleto'}, EVA ${eq5d.vas ?? '—'}.`
      : 'Sin EQ-5D-3L completado hasta esta visita.',
  };
}

// ── Sugerencias desde los datos clínicos del protocolo (el profesional confirma o corrige) ──

export type Suggestion = { value: string; from: string };
export type ClinicalSnapshot = Record<string, string | number | boolean | null | undefined>;

const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const yn = (v: boolean | null) => (v === null ? null : v ? 'yes' : 'no');

/**
 * Propone respuestas a partir de la edad y de un registro de datos clínicos (coag_clinical_assessments).
 * Solo propone cuando la variable del protocolo corresponde a la del modelo; si la correspondencia es parcial
 * se indica en `from`. Nunca propone «No» desde un dato ausente.
 */
export function suggestFromClinical(ageAtInclusion: number | null, clinical: ClinicalSnapshot | null): Record<string, Suggestion> {
  const out: Record<string, Suggestion> = {};
  const put = (id: string, value: string | null, from: string) => { if (value !== null) out[id] = { value, from }; };

  if (ageAtInclusion !== null) {
    put('age', ageAtInclusion < 18 ? 'lt18' : ageAtInclusion <= 50 ? '18_50' : 'gt50', `Edad en la inclusión: ${ageAtInclusion} años (no se dispone de la fecha de nacimiento)`);
  }
  if (!clinical) return out;

  const bmi = num(clinical.bmi);
  const obesityFlag = bool(clinical.obesity);
  const obese = bmi !== null ? bmi >= 30 : obesityFlag;
  put('obesity', yn(obese), bmi !== null ? `IMC ${String(bmi).replace('.', ',')} kg/m²` : 'Comorbilidad «Obesidad» (sin IMC registrado)');

  put('inhibitors', yn(bool(clinical.inhibitors)), 'Datos clínicos: desarrollo de inhibidores');
  const pain = clinical.joint_pain;
  put('pain', pain === 'absent' ? 'none' : pain === 'mild_moderate' ? 'mild_moderate' : pain === 'persistent' ? 'persistent' : null,
    'Datos clínicos: dolor articular (no recoge el dolor agudo por hemorragia activa)');
  if (bool(clinical.hemophilic_arthropathy) === true) put('joint_status', 'yes', 'Datos clínicos: artropatía hemofílica');
  const sev = clinical.bleeding_severity_last_year;
  put('bleeding_management', sev === 'not_applicable' ? 'none' : sev === 'hospital_admission' ? 'hospital_admission' : sev === 'outpatient' ? 'outpatient' : null,
    'Datos clínicos: gravedad de los sangrados en el último año');
  const hs = clinical.hemophilia_severity;
  put('hemophilia_severity', hs === 'mild' || hs === 'moderate' || hs === 'severe' ? hs : null, 'Datos clínicos: gravedad de la hemofilia');
  const vt = clinical.vwd_type;
  put('vwd_type', vt === '1' || vt === '2' || vt === '3' ? vt : null, 'Datos clínicos: tipo de EVW');
  const spont = num(clinical.spontaneous_bleeds);
  put('spontaneous_bleeds_gt2', spont === null ? null : spont > 2 ? 'yes' : 'no',
    `Datos clínicos: ${spont ?? '—'} sangrados espontáneos en el periodo registrado (confirme que el periodo es anual y que requirieron tratamiento)`);
  if (bool(clinical.infection_from_blood_products) === true || bool(clinical.diabetes) === true) {
    put('comorbidity', 'yes', 'Datos clínicos: infección por hemoderivados y/o diabetes');
  }
  put('psychological', yn(bool(clinical.psychological_problems)), 'Datos clínicos: problemas psicológicos');

  const type = clinical.treatment_type;
  if (type === 'gene_therapy') put('advanced_therapy', 'yes', 'Datos clínicos: terapia génica');
  const disp = clinical.dispensing_mode;
  put('home_dispensing', disp === 'hospital' ? 'no' : disp === 'proximity_home' || disp === 'proximity_pharmacy' ? 'yes' : null,
    'Datos clínicos: modalidad de dispensación');
  const regimen = clinical.treatment_regimen;
  put('prophylaxis', regimen === 'prophylaxis' ? 'yes' : regimen === 'on_demand' ? 'no' : null, 'Datos clínicos: régimen de tratamiento');

  const se = clinical.socioeconomic_status;
  put('socioeconomic', se === 'unfavorable' ? 'yes' : se === 'favorable' ? 'no' : null,
    'Datos clínicos: situación socioeconómica (M incluye también falta de apoyo familiar o aislamiento)');
  const act = clinical.physical_activity;
  put('intense_activity', act === 'intense' ? 'yes' : act === 'sedentary' || act === 'moderate' ? 'no' : null, 'Datos clínicos: actividad física');
  const cv = [bool(clinical.hypertension), obese, bool(clinical.smoking)];
  if (cv.includes(true)) put('cv_risk', 'yes', 'Datos clínicos: hipertensión, obesidad o tabaquismo');
  put('access_difficulty', yn(bool(clinical.hospital_access_difficulty)), 'Datos clínicos: dificultad de acceso a la atención hospitalaria');
  const know = clinical.disease_knowledge;
  put('limited_knowledge', know === 'limited' ? 'yes' : know === 'adequate' ? 'no' : null, 'Datos clínicos: conocimiento de la enfermedad');
  return out;
}
