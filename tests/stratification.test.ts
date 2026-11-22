// Modelo CMO de coagulopatías congénitas (SEFH v2.0): estructura frente a las tablas del documento, puntos de
// corte, datos ausentes, excepciones, caso clínico 1 del documento (M pp. 63-65) y sugerencias desde datos clínicos.

import { describe, expect, it } from 'vitest';

import {
  STRAT_VARIABLES, applicableVariables, computeStratification, contextNotes, finalPriority, priorityForScore, suggestFromClinical,
  type StratAnswers,
} from '../src/domain/stratification';
import { buildStratificationPayload } from '../src/services/stratificationService';

const maxOf = (id: string) => Math.max(...STRAT_VARIABLES.find((v) => v.id === id)!.options.map((o) => o.points));
const sumMax = (ids: string[]) => ids.reduce((t, id) => t + maxOf(id), 0);
const allNo = (diagnosis: 'HA' | 'EVW'): StratAnswers => Object.fromEntries(applicableVariables(diagnosis).map((v) => [v.id, v.options[v.options.length > 2 ? 0 : 1].value]));

// Caso clínico 1 (M pp. 63-65): varón de 62 años, hemofilia A grave, inicia emicizumab s.c. Total 31 → Prioridad 1.
const CASE_1: StratAnswers = {
  age: 'gt50', obesity: 'no',
  inhibitors: 'no', pain: 'mild_moderate', joint_status: 'yes', bleeding_management: 'outpatient', hemophilia_severity: 'severe',
  spontaneous_bleeds_gt2: 'yes', comorbidity: 'yes', degenerative_joint: 'no', psychological: 'yes',
  advanced_therapy: 'no', route: 'sc_only', dose_change: 'yes', extra_doses: 'yes', home_dispensing: 'yes', prophylaxis: 'yes', non_adherence: 'no',
  socioeconomic: 'no', intense_activity: 'no', cv_risk: 'yes', access_difficulty: 'no', limited_knowledge: 'no', transition: 'no', low_qol: 'no',
};

describe('estructura frente a las tablas 1-4 del documento', () => {
  it('23 variables del modelo (26 preguntas: tres variables con dos descripciones acumulables)', () => {
    expect(new Set(STRAT_VARIABLES.map((v) => v.modelVariable)).size).toBe(23);
    expect(STRAT_VARIABLES).toHaveLength(26);
  });
  it('puntuaciones máximas por dimensión: 3, 25, 15 y 16 (58 sin calidad de vida)', () => {
    expect(sumMax(['age', 'obesity'])).toBe(3);
    const clinicalHA = applicableVariables('HA').filter((v) => v.dimension === 'clinical').map((v) => v.id);
    const clinicalEVW = applicableVariables('EVW').filter((v) => v.dimension === 'clinical').map((v) => v.id);
    expect(sumMax(clinicalHA)).toBe(25);
    expect(sumMax(clinicalEVW)).toBe(25);
    expect(sumMax(STRAT_VARIABLES.filter((v) => v.dimension === 'treatment').map((v) => v.id))).toBe(15);
    expect(sumMax(STRAT_VARIABLES.filter((v) => v.dimension === 'social').map((v) => v.id))).toBe(16);
    const total = applicableVariables('HA').reduce((t, v) => t + maxOf(v.id), 0);
    expect(total).toBe(59);
    expect(total - maxOf('low_qol')).toBe(58);
  });
  it('gravedad de hemofilia solo en HA/HB; tipo de EVW solo en EVW', () => {
    expect(applicableVariables('HB').map((v) => v.id)).toContain('hemophilia_severity');
    expect(applicableVariables('HB').map((v) => v.id)).not.toContain('vwd_type');
    expect(applicableVariables('EVW').map((v) => v.id)).toContain('vwd_type');
  });
});

describe('puntos de corte (M p. 17: 20 → Prioridad 2; 28 → Prioridad 1)', () => {
  it('límites inclusivos', () => {
    expect([0, 19, 20, 27, 28, 59].map(priorityForScore)).toEqual([3, 3, 2, 2, 1, 1]);
  });
});

describe('caso clínico 1 del documento', () => {
  const r = computeStratification('HA', CASE_1);
  it('2 + 18 + 9 + 2 = 31 → Prioridad 1', () => {
    expect(r.byDimension.demographic.points).toBe(2);
    expect(r.byDimension.clinical.points).toBe(18);
    expect(r.byDimension.treatment.points).toBe(9);
    expect(r.byDimension.social.points).toBe(2);
    expect(r).toMatchObject({ status: 'determined', score: 31, modelPriority: 1, basis: 'score', missing: [] });
  });
});

describe('datos ausentes: intervalo, nunca 0 por defecto', () => {
  it('sin respuestas: indeterminado 0-59', () => {
    const r = computeStratification('HA', {});
    expect(r).toMatchObject({ status: 'indeterminate', modelPriority: null, score: null, scoreMin: 0, scoreMax: 59 });
    expect(r.missing).toHaveLength(25);
  });
  it('si lo que falta no puede cambiar el nivel, se asigna y se avisa', () => {
    const answers = { ...allNo('HA'), age: '18_50', transition: null };
    const r = computeStratification('HA', answers);
    expect(r).toMatchObject({ status: 'determined', modelPriority: 3, score: null, scoreMin: 1, scoreMax: 5 });
    expect(r.warnings.join(' ')).toMatch(/no pueden cambiar el nivel/);
  });
  it('si lo que falta puede cambiar el nivel, queda indeterminado', () => {
    const r = computeStratification('HA', { ...CASE_1, pain: null, joint_status: null, spontaneous_bleeds_gt2: null, psychological: null, comorbidity: null, prophylaxis: null });
    expect(r.scoreMin).toBe(16);
    expect(r).toMatchObject({ status: 'indeterminate', modelPriority: null });
  });
  it('sin la pregunta de terapia avanzada no se asigna nivel', () => {
    expect(computeStratification('HA', { ...CASE_1, advanced_therapy: null }).status).toBe('indeterminate');
  });
});

describe('excepciones', () => {
  it('terapia avanzada → Prioridad 1 aunque la puntuación sea baja', () => {
    const r = computeStratification('HB', { ...allNo('HA'), age: '18_50', advanced_therapy: 'yes' });
    expect(r).toMatchObject({ status: 'determined', modelPriority: 1, basis: 'advanced_therapy', score: 1 });
  });
  it('menor de 18 años → modelo pediátrico, sin nivel', () => {
    expect(computeStratification('HA', { ...CASE_1, age: 'lt18' })).toMatchObject({ status: 'pediatric_model', modelPriority: null });
  });
  it('aviso si el nivel depende de la variable de calidad de vida (fuera del pretest)', () => {
    const answers = { ...allNo('HA'), age: '18_50', hemophilia_severity: 'severe', prophylaxis: 'yes', route: 'iv', non_adherence: 'yes', limited_knowledge: 'yes', cv_risk: 'yes', obesity: 'yes', low_qol: 'yes' };
    const r = computeStratification('HA', answers);
    expect(r.score).toBe(20);
    expect(r.modelPriority).toBe(2);
    expect(r.warnings.join(' ')).toMatch(/calidad de vida/);
  });
});

describe('elevación del nivel por criterio profesional (M p. 19)', () => {
  it('solo hacia arriba', () => {
    expect(finalPriority(3, 1)).toEqual({ priority: 1, raised: true, error: null });
    expect(finalPriority(2, 3).error).toMatch(/nunca bajarlo/);
    expect(finalPriority(2, 2).error).toMatch(/Solo se puede elevar/);
    expect(finalPriority(null, 1).error).toMatch(/no está determinado/);
    expect(finalPriority(2, null)).toEqual({ priority: 2, raised: false, error: null });
  });
});

describe('sugerencias desde los datos clínicos', () => {
  it('correspondencias directas y frontera de edad 50', () => {
    const s = suggestFromClinical(50, {
      bmi: 31.2, inhibitors: false, joint_pain: 'persistent', hemophilic_arthropathy: true, bleeding_severity_last_year: 'outpatient',
      hemophilia_severity: 'severe', spontaneous_bleeds: 3, diabetes: true, psychological_problems: false, treatment_type: 'recombinant_extended',
      dispensing_mode: 'proximity_home', treatment_regimen: 'prophylaxis', socioeconomic_status: 'favorable', physical_activity: 'moderate',
      hypertension: false, smoking: false, hospital_access_difficulty: true, disease_knowledge: 'adequate',
    });
    expect(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.value]))).toEqual({
      age: '18_50', obesity: 'yes', inhibitors: 'no', pain: 'persistent', joint_status: 'yes', bleeding_management: 'outpatient',
      hemophilia_severity: 'severe', spontaneous_bleeds_gt2: 'yes', comorbidity: 'yes', psychological: 'no', home_dispensing: 'yes',
      prophylaxis: 'yes', socioeconomic: 'no', intense_activity: 'no', cv_risk: 'yes', access_difficulty: 'yes', limited_knowledge: 'no',
    });
  });
  it('nunca propone «No» desde un dato ausente ni donde el protocolo no cubre toda la definición', () => {
    const s = suggestFromClinical(51, { hemophilic_arthropathy: false, diabetes: false, infection_from_blood_products: false, hypertension: false, smoking: false, obesity: false });
    expect(s.age.value).toBe('gt50');
    expect(s.joint_status).toBeUndefined();
    expect(s.comorbidity).toBeUndefined();
    expect(s.cv_risk).toBeUndefined();
    expect(s.obesity.value).toBe('no');
    expect(s.advanced_therapy).toBeUndefined();
    expect(Object.keys(suggestFromClinical(null, null))).toEqual([]);
  });
  it('terapia génica se propone como excepción', () => {
    expect(suggestFromClinical(40, { treatment_type: 'gene_therapy' }).advanced_therapy.value).toBe('yes');
  });
});

describe('información de apoyo (spec COAMO §5.3-5.4: no puntúa)', () => {
  it('% de dispensaciones y EQ-5D-3L junto a adherencia y calidad de vida', () => {
    const n = contextNotes({ dispensations_collected: 10, dispensations_expected: 12 }, { date: '2026-01-15', profile: '11223', vas: 60 });
    expect(n.non_adherence).toMatch(/83,3 % \(10\/12\)/);
    expect(n.low_qol).toBe('EQ-5D-3L del 15/01/2026: perfil 11223, EVA 60.');
  });
  it('sin datos lo dice, sin inventar', () => {
    const n = contextNotes({ dispensations_collected: 3, dispensations_expected: 0 }, null);
    expect(n.non_adherence).toMatch(/no calculable/);
    expect(n.low_qol).toMatch(/Sin EQ-5D-3L/);
  });
});

describe('carga útil del registro', () => {
  const base = { status: 'in_progress' as const, answers: { age: '18_50', pain: null, route: '' }, suggestions: {}, clinical_source_visit_id: null,
    raised_priority: null, raised_reason: '  algo ', restratification_reason: '  Cambio de tratamiento  ' };
  it('descarta respuestas vacías y motivos que no proceden', () => {
    const p = buildStratificationPayload(base, true);
    expect(p.answers).toEqual({ age: '18_50' });
    expect(p.raised_reason).toBeNull();
    expect(p.restratification_reason).toBeNull();
  });
  it('conserva y recorta los motivos cuando proceden', () => {
    const p = buildStratificationPayload({ ...base, raised_priority: 1 }, false);
    expect(p.raised_reason).toBe('algo');
    expect(p.restratification_reason).toBe('Cambio de tratamiento');
  });
});

describe('excepciones del modelo: solo anulan los puntos cuando se activan', () => {
  it('edad 18-50 y > 50 puntúan; < 18 activa el modelo pediátrico; terapia avanzada «sí» activa la excepción', async () => {
    const { activatesException, STRAT_VARIABLES } = await import('../src/domain/stratification');
    const age = STRAT_VARIABLES.find((v) => v.id === 'age');
    const adv = STRAT_VARIABLES.find((v) => v.id === 'advanced_therapy');
    expect(activatesException(age, 'gt50')).toBe(false);
    expect(activatesException(age, '18_50')).toBe(false);
    expect(activatesException(age, 'lt18')).toBe(true);
    expect(activatesException(adv, 'yes')).toBe(true);
    expect(activatesException(adv, 'no')).toBe(false);
  });
});

// ── Límites de los tres niveles y efecto teórico de retirar «calidad de vida» (revisión del colaborador, fase 4.4) ──
// La retirada de la variable NO está decidida (el modelo v2.0 la incluye): estas pruebas documentan que la decisión
// no crearía huecos ni solapamientos, porque los puntos de corte se fijaron SIN esa variable (modelo p. 17).
describe('límites de prioridad: clasificación completa, contigua y sin huecos', () => {
  it('cada puntuación entera de 0 a 59 recibe exactamente un nivel; P3 0-19, P2 20-27, P1 28-59', () => {
    const levels = Array.from({ length: 60 }, (_, s) => priorityForScore(s));
    expect(levels.slice(0, 20).every((p) => p === 3)).toBe(true);
    expect(levels.slice(20, 28).every((p) => p === 2)).toBe(true);
    expect(levels.slice(28).every((p) => p === 1)).toBe(true);
    // Monótona: más puntos nunca bajan la prioridad asistencial.
    for (let s = 1; s < 60; s++) expect(levels[s]).toBeLessThanOrEqual(levels[s - 1]);
  });
  it('fronteras exactas 19/20 y 27/28 en el motor completo (no solo en priorityForScore)', () => {
    // Base sin puntos y suma de respuestas «sí» hasta la puntuación buscada.
    const base = allNo('HA');
    const withScore = (target: number): StratAnswers => {
      const answers: StratAnswers = { ...base, age: '18_50' }; // 1
      let score = 1;
      for (const v of applicableVariables('HA').filter((x) => !x.exception && x.id !== 'age' && x.options.length === 2)) {
        const pts = v.options[0].points;
        if (score + pts <= target) { answers[v.id] = 'yes'; score += pts; }
      }
      expect(score).toBe(target);
      return answers;
    };
    for (const [score, priority] of [[19, 3], [20, 2], [27, 2], [28, 1]] as const) {
      const r = computeStratification('HA', withScore(score));
      expect(r.status).toBe('determined');
      expect(r.score).toBe(score);
      expect(r.modelPriority).toBe(priority);
    }
  });
  it('sin calidad de vida el máximo sería 58 y los rangos seguirían contiguos (P1 28-58); con ella, 59', () => {
    const maxWith = applicableVariables('EVW').reduce((t, v) => t + maxOf(v.id), 0);
    expect(maxWith).toBe(59);
    expect(maxWith - maxOf('low_qol')).toBe(58);
    expect(priorityForScore(58)).toBe(1);
    expect(priorityForScore(28)).toBe(1);
  });
  it('calidad de vida en la frontera: con 20 puntos de los que 1 es calidad de vida → P2 con aviso de dependencia', () => {
    const answers: StratAnswers = { ...allNo('HA'), age: '18_50', prophylaxis: 'yes', inhibitors: 'yes', joint_status: 'yes', non_adherence: 'yes', transition: 'yes', limited_knowledge: 'no', socioeconomic: 'no', degenerative_joint: 'yes', low_qol: 'yes' };
    // Edad 1 + profilaxis 3 + inhibidores 3 + articular 3 + adherencia 4 + transición 4 + calidad de vida 1 = 19.
    const r = computeStratification('HA', { ...answers, degenerative_joint: 'no', dose_change: 'yes' }); // + 2 = 21
    expect(r.score).toBe(21);
    const r20 = computeStratification('HA', { ...answers, degenerative_joint: 'no', obesity: 'yes' }); // + 1 = 20
    expect(r20.score).toBe(20);
    expect(r20.modelPriority).toBe(2);
    expect(r20.warnings.join(' ')).toMatch(/calidad de vida/);
    expect(computeStratification('HA', { ...answers, degenerative_joint: 'no', dose_change: 'yes' }).warnings.join(' ')).not.toMatch(/depende del punto de «calidad de vida»/);
  });
  it('el cambio de denominación de inhibidores no altera su puntuación (Sí = 3, No = 0) ni su aplicabilidad', () => {
    const v = STRAT_VARIABLES.find((x) => x.id === 'inhibitors')!;
    expect(v.question).toBe('Presencia de inhibidores frente a factor VIII, factor IX o factor de von Willebrand');
    expect(v.options.map((o) => [o.value, o.points])).toEqual([['yes', 3], ['no', 0]]);
    expect(v.appliesTo).toBeUndefined();
  });
  it('las observaciones visibles no empiezan por la abreviatura «M»', () => {
    for (const v of STRAT_VARIABLES) {
      expect(v.source.startsWith('M ')).toBe(false);
      if (v.hint) expect(/^M\s/.test(v.hint)).toBe(false);
    }
  });
});

describe('versionado del algoritmo', () => {
  it('la versión vigente tiene reglas registradas coherentes con el motor', async () => {
    const { STRATIFICATION_RULES, STRATIFICATION_MODEL_VERSION, PRIORITY_1_CUTOFF, PRIORITY_2_CUTOFF } = await import('../src/domain/stratification');
    const rules = STRATIFICATION_RULES[STRATIFICATION_MODEL_VERSION];
    expect(rules.cutoffs).toEqual({ priority1_min: PRIORITY_1_CUTOFF, priority2_min: PRIORITY_2_CUTOFF });
    expect(rules.theoretical_max).toBe(applicableVariables('HA').reduce((t, v) => t + maxOf(v.id), 0));
    expect(rules.outside_pretest.every((id) => STRAT_VARIABLES.some((v) => v.id === id && v.outsidePretest))).toBe(true);
  });
});
