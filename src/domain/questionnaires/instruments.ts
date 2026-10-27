// Catálogo de instrumentos de las visitas basal (V0) y final (VF). Textos transcritos literalmente de
// los documentos Word aportados por el IP (14/10/2026; VERITAS-Pro, 27/10/2026); trazabilidad ítem a ítem en
// docs/CUESTIONARIOS_TRAZABILIDAD.md. Los códigos de ítem coinciden con
// coag_private.questionnaire_items() (migración 20261026120000 del historial canónico, DERMAPEX).
//
// Regla: el valor guardado es el CÓDIGO de la opción en el orden del documento. Solo en IEXPAC
// (protocolo p. 10) y EVASAF (documento: 1 muy deficiente – 5 excelente) coincide con el valor de la
// escala. En VERITAS-PRN y VERITAS-Pro es un código de posición (1 = Siempre … 5 = Nunca), no una puntuación.

export type InstrumentCode = 'IEXPAC' | 'EQ5D3L' | 'EVASAF' | 'VERITAS_PRN' | 'VERITAS_PRO';
export type AdministrationMode = 'self' | 'assisted' | 'interviewer';

export const INSTRUMENT_CODES: InstrumentCode[] = ['IEXPAC', 'EQ5D3L', 'EVASAF', 'VERITAS_PRN', 'VERITAS_PRO'];

export const ADMINISTRATION_MODE_LABEL: Record<AdministrationMode, string> = {
  self: 'Autoadministrado',
  assisted: 'Autoadministrado con ayuda (familiar, cuidador o profesional)',
  interviewer: 'Administrado por profesional (entrevista)',
};

export type ResponseOption = { value: number; label: string; hint?: string };

export type QuestionnaireItem = {
  code: string;
  number?: number;
  title?: string;
  /** Texto del ítem (modalidad autoadministrada o única). */
  text: string;
  /** EQ-5D-3L por entrevista: pregunta leída por el profesional. */
  interviewerText?: string;
  /** Opciones propias del ítem (si no, las del instrumento). */
  options?: ResponseOption[];
  interviewerOptions?: ResponseOption[];
  /** Ítem condicionado: frase literal del documento que lo condiciona. */
  condition?: string;
  /** EVA 0-100 del EQ-5D-3L. */
  kind?: 'choice' | 'vas';
};

export type QuestionnaireSection = { id: string; title?: string; intro?: string; items: QuestionnaireItem[] };

export type InstrumentDefinition = {
  code: InstrumentCode;
  shortName: string;
  name: string;
  construct: string;
  /** Fuente documental y página/sección. */
  source: string;
  available: boolean;
  unavailableReason?: string;
  primaryEndpoint?: boolean;
  modes: AdministrationMode[];
  /** Instrucciones literales por modalidad (la clave 'default' sirve para todas). */
  instructions: Partial<Record<AdministrationMode | 'default', string[]>>;
  options?: ResponseOption[];
  sections: QuestionnaireSection[];
  /** Ítems que cuentan para la completitud (no incluye condicionados). */
  coreItemCodes: string[];
  footer?: Partial<Record<AdministrationMode | 'default', string>>;
  scoringSummary: string;
  directionNote: string;
  limitations: string[];
};

// ── IEXPAC ──────────────────────────────────────────────────────────────────

const IEXPAC_OPTIONS: ResponseOption[] = [
  { value: 1, label: 'Nunca' },
  { value: 2, label: 'Casi nunca' },
  { value: 3, label: 'A veces' },
  { value: 4, label: 'Casi siempre' },
  { value: 5, label: 'Siempre' },
];

const IEXPAC_ITEMS: QuestionnaireItem[] = [
  { code: 'q1', number: 1, title: 'Respetan mi estilo de vida',
    text: 'Los profesionales que me atienden me escuchan y tienen en cuenta mis necesidades, costumbres y preferencias para adaptar mi plan de cuidados y tratamiento.' },
  { code: 'q2', number: 2, title: 'Están coordinados para ofrecerme una buena atención',
    text: 'Los profesionales que me atienden en el centro de salud y los que me atienden en el hospital hablan entre ellos y se coordinan para mejorar mi bienestar y mi calidad de vida.' },
  { code: 'q3', number: 3, title: 'Me ayudan a informarme por Internet',
    text: 'Los profesionales que me atienden me informan sobre páginas web y foros de internet de los que me puedo fiar para conocer mejor mi enfermedad, su tratamiento y las consecuencias que pueden tener en mi vida.' },
  { code: 'q4', number: 4, title: 'Ahora sé cuidarme mejor',
    text: 'Con el apoyo de mis profesionales siento que ha mejorado mi confianza y mi capacidad para cuidar de mí mismo/a, manejar mejor mis problemas de salud y mantener mi autonomía.' },
  { code: 'q5', number: 5, title: 'Me preguntan y me ayudan a seguir mi plan de tratamiento',
    text: 'Reviso con los profesionales que me atienden el cumplimiento de mi plan de cuidados y tratamiento y, si tengo dudas, me las aclaran.' },
  { code: 'q6', number: 6, title: 'Acordamos objetivos para llevar una vida sana y controlar mejor mi enfermedad',
    text: 'He podido acordar con los profesionales que me atienden objetivos concretos sobre alimentación, ejercicio físico y cómo tomar adecuadamente la medicación para controlar mejor mi enfermedad.' },
  { code: 'q7', number: 7, title: 'Uso internet y el móvil para consultar mi historia clínica',
    text: 'Uso Internet y el móvil para consultar mi historia clínica, resultados de mis pruebas, citas programadas y acceder a otros servicios en la web de mi Servicio de salud.' },
  { code: 'q8', number: 8, title: 'Se aseguran de que tomo la medicación correctamente',
    text: 'Los profesionales que me atienden revisan conmigo todos los medicamentos que tomo, cómo los tomo, cómo me sientan y puedo consultarles las dudas que tenga.' },
  { code: 'q9', number: 9, title: 'Se preocupan por mi bienestar',
    text: 'Los profesionales que me atienden se preocupan por mi calidad de vida y los veo comprometidos para que mejore mi bienestar.' },
  { code: 'q10', number: 10, title: 'Me informan de recursos sanitarios y sociales que me pueden ayudar',
    text: 'Los profesionales que me atienden me informan sobre los recursos sanitarios y sociales de que dispongo (en mi barrio, ciudad o pueblo) y que puedo utilizar para mejorar mis problemas de salud y para cuidarme mejor.' },
  { code: 'q11', number: 11, title: 'Me animan a hablar con otros pacientes',
    text: 'Los profesionales que me atienden me animan a participar en grupos de pacientes para compartir información y experiencias sobre cómo cuidarnos y mejorar nuestra salud.' },
];

const IEXPAC_CONDITIONAL: QuestionnaireItem[] = [
  { code: 'q12', number: 12, title: 'Se preocupan por mí al llegar a casa tras estar en el hospital',
    condition: 'Si usted ha estado ingresado en el hospital en los últimos 6 meses, por favor, responda a la siguiente pregunta:',
    text: 'Después de recibir el alta del hospital, me han llamado o visitado en casa para ver cómo me encontraba y qué cuidados necesitaba.' },
  { code: 'q13', number: 13, title: 'Me orientan para no tener una nueva urgencia',
    condition: 'Si usted ha recibido atención en urgencias en los últimos 6 meses, por favor, responda a la siguiente pregunta:',
    text: 'Después de haber estado en urgencias, los profesionales que me atienden saben lo que me ha pasado y me orientan para evitar una nueva urgencia.' },
  { code: 'q14', number: 14, title: 'Me atienden bien en mi domicilio',
    condition: 'Si usted ha recibido atención sanitaria en su domicilio en los últimos 6 meses, por favor, responda a la siguiente pregunta:',
    text: 'Los profesionales que me atienden en mi casa tratan de solucionar mis problemas de salud de forma coordinada con los profesionales del centro de salud y del hospital, y si es necesario, con los servicios sociales.' },
  { code: 'q15', number: 15, title: 'Los servicios sociales están coordinados con los servicios sanitarios para ofrecerme una buena atención',
    condition: 'Si usted ha recibido atención de los servicios sociales en los últimos 6 meses, por favor, responda a la siguiente pregunta:',
    text: 'Los profesionales que me atienden en los servicios sociales hablan y se coordinan con los profesionales sanitarios para ofrecerme una buena atención.' },
];

// ── EQ-5D-3L (autoadministrado v2.0 y por entrevista v1.0) ──────────────────

function eqOptions(labels: [string, string, string]): ResponseOption[] {
  return labels.map((label, i) => ({ value: i + 1, label }));
}

const EQ5D_ITEMS: QuestionnaireItem[] = [
  { code: 'mobility', title: 'MOVILIDAD', text: 'MOVILIDAD',
    interviewerText: 'Primero, me gustaría preguntarle sobre la MOVILIDAD. ¿Diría usted que…',
    options: eqOptions(['No tengo problemas para caminar', 'Tengo algunos problemas para caminar', 'No puedo moverme de la cama']),
    interviewerOptions: eqOptions(['no tiene problemas para caminar?', 'tiene algunos problemas para caminar?', 'no puede moverse de la cama?']) },
  { code: 'self_care', title: 'CUIDADOS PERSONALES', text: 'CUIDADOS PERSONALES',
    interviewerText: 'Ahora, me gustaría preguntarle sobre los CUIDADOS PERSONALES. ¿Diría usted que…',
    options: eqOptions(['No tengo problemas con los cuidados personales', 'Tengo algunos problemas para lavarme (bañarme) o vestirme', 'No puedo lavarme (bañarme) ni vestirme']),
    interviewerOptions: eqOptions(['no tiene problemas con los cuidados personales?', 'tiene algunos problemas para lavarse (bañarse) o vestirse?', 'no puede lavarse (bañarse) ni vestirse?']) },
  { code: 'usual_activities', title: 'ACTIVIDADES HABITUALES',
    text: 'ACTIVIDADES HABITUALES (p. ej., trabajar, estudiar, hacer las tareas domésticas, actividades en familia o actividades de tiempo libre)',
    interviewerText: 'Ahora, me gustaría preguntarle sobre las ACTIVIDADES HABITUALES, por ejemplo, trabajar, estudiar, hacer las tareas domésticas, actividades en familia o actividades de tiempo libre. ¿Diría usted que…',
    options: eqOptions(['No tengo problemas para realizar mis actividades habituales', 'Tengo algunos problemas para realizar mis actividades habituales', 'No puedo realizar mis actividades habituales']),
    interviewerOptions: eqOptions(['no tiene problemas para realizar sus actividades habituales?', 'tiene algunos problemas para realizar sus actividades habituales?', 'no puede realizar sus actividades habituales?']) },
  { code: 'pain_discomfort', title: 'DOLOR / MOLESTIAS', text: 'DOLOR / MOLESTIAS (p. ej., mareos, náuseas, picazón [comezón])',
    interviewerText: 'Ahora, me gustaría preguntarle sobre el DOLOR O LAS MOLESTIAS, por ejemplo, mareos, náuseas, picazón [comezón]. ¿Diría usted que…',
    options: eqOptions(['No tengo dolor ni molestias', 'Tengo dolor o molestias moderadas', 'Tengo dolor o molestias extremas']),
    interviewerOptions: eqOptions(['no tiene dolor ni molestias?', 'tiene dolor o molestias moderadas?', 'tiene dolor o molestias extremas?']) },
  { code: 'anxiety_depression', title: 'ANSIEDAD (ANGUSTIA) / DEPRESIÓN', text: 'ANSIEDAD (ANGUSTIA) / DEPRESIÓN',
    interviewerText: 'Finalmente, me gustaría preguntarle sobre la ANSIEDAD (ANGUSTIA) O LA DEPRESIÓN. ¿Diría usted que…',
    options: eqOptions(['No tengo ansiedad ni depresión', 'Tengo ansiedad o depresión moderada', 'Tengo ansiedad o depresión extrema']),
    interviewerOptions: eqOptions(['no tiene ansiedad ni depresión?', 'tiene ansiedad o depresión moderada?', 'tiene ansiedad o depresión extrema?']) },
];

export const EQ5D_DIMENSIONS = EQ5D_ITEMS.map((item) => item.code);

const EQ5D_VAS_SELF = [
  'Nos gustaría saber en qué medida es bueno o malo su estado de salud HOY.',
  'Esta escala está numerada del 0 al 100.',
  '100 representa el mejor estado de salud que usted se pueda imaginar. 0 representa el peor estado de salud que usted se pueda imaginar.',
  'Marque con una X en la escala para indicar cuál es su estado de salud HOY.',
  'Ahora escriba en la casilla que aparece a continuación el número que ha marcado en la escala.',
];

const EQ5D_VAS_INTERVIEWER = [
  'Ahora, me gustaría que valorara en qué medida es bueno o malo su estado de salud HOY.',
  'Para ello, tomemos una línea vertical numerada del 0 al 100.',
  '(Nota para quien hace la entrevista: si es cara a cara, muestre la línea VAS a la persona entrevistada.)',
  '100, en el extremo superior de la línea, representa el mejor estado de salud que usted se pueda imaginar.',
  '0, en el extremo inferior de la línea, representa el peor estado de salud que usted se pueda imaginar.',
  'Ahora me gustaría que me dijera en qué punto de esta línea situaría su estado de salud HOY.',
  '(Nota para quien hace la entrevista: marque la línea en el punto que indique cómo es el estado de salud de la persona entrevistada hoy. Ahora, en la casilla que encontrará a continuación escriba el número que ha marcado en la línea.)',
];

export const EQ5D_VAS_TEXT: Record<'self' | 'interviewer', string[]> = { self: EQ5D_VAS_SELF, interviewer: EQ5D_VAS_INTERVIEWER };

/** Rótulos de la escala vertical dibujada en el documento autoadministrado (v2.0). */
export const EQ5D_VAS_SCALE = {
  top: 'El mejor estado de salud que usted se pueda imaginar',
  bottom: 'El peor estado de salud que usted se pueda imaginar',
  box: 'SU ESTADO DE SALUD HOY =',
};

// ── EVASAF ──────────────────────────────────────────────────────────────────

const EVASAF_OPTIONS: ResponseOption[] = [
  { value: 1, label: '1', hint: 'muy deficiente' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 5, label: '5', hint: 'excelente' },
];

const EVASAF_TEXTS = [
  'Conozco mejor los medicamentos que utilizo.',
  'Sé qué medicamentos puedo tomar y cuáles no por las interacciones que puedan existir. Mi farmacéutico me pregunta por mi medicación domiciliaria.',
  'Soy más consciente de la importancia de cumplir mi tratamiento para ser adherente.',
  'Tengo mayores conocimientos sobre las reacciones adversas que pueden provocar mis medicamentos.',
  'He logrado reducir las reacciones adversas de los medicamentos que tomo gracias a una mejor explicación sobre el manejo de los mismos.',
  'Siento la implicación de mi farmacéutico en mi problema de salud.',
  'Continuaría visitando la consulta de atención farmacéutica para seguir en el programa de seguimiento de mis medicamentos.',
  'Solicitaría a mi médico que continúe trabajando conjuntamente con mi farmacéutico porque confío en él.',
  'La atención farmacéutica prestada se lleva a cabo de forma privada.',
  'Estoy satisfecho con el servicio que recibo.',
];

// ── VERITAS-PRN ─────────────────────────────────────────────────────────────

const VERITAS_OPTIONS: ResponseOption[] = [
  { value: 1, label: 'Siempre', hint: 'todo el tiempo, el 100 % de las veces' },
  { value: 2, label: 'A menudo', hint: 'la mayor parte del tiempo, al menos el 75 % de las veces' },
  { value: 3, label: 'A veces', hint: 'ocasionalmente, al menos el 50 % de las veces' },
  { value: 4, label: 'Rara vez', hint: 'con poca frecuencia, el 25 % de las veces' },
  { value: 5, label: 'Nunca', hint: 'en ningún caso, el 0 % de las veces' },
];

export const VERITAS_PRN_BLOCKS: Array<{ id: string; title: string; texts: string[] }> = [
  { id: 'treatment', title: 'TRATAMIENTO', texts: [
    'Me administro una infusión cuando aparecen síntomas de sangrado.',
    'Me administro infusiones durante el número de días recomendado por el centro de tratamiento.',
    'Completo el número de infusiones recomendado cuando se produce un sangrado.',
    'Sigo las indicaciones que me ha dado el centro de tratamiento para el manejo de la hemofilia.',
  ] },
  { id: 'timing', title: 'MOMENTO DE ADMINISTRACIÓN', texts: [
    'Cuando aparecen síntomas de sangrado, interrumpo mis actividades y me administro una infusión inmediatamente.',
    'Cuando aparecen síntomas de sangrado, espero para administrarme una infusión hasta que me resulte conveniente.',
    'Espero uno o dos días después de que comiencen los síntomas de sangrado para administrarme una infusión.',
    'Me administro una infusión dentro de las tres horas siguientes a la aparición de síntomas de sangrado.',
  ] },
  { id: 'dosing', title: 'DOSIFICACIÓN', texts: [
    'Me administro la dosis prescrita para los episodios de sangrado.',
    'Recuerdo la dosis recomendada por el médico.',
    'Utilizo el número correcto de envases de factor de coagulación para alcanzar la dosis recomendada.',
    'En lugar de llamar al centro de tratamiento, aumento o disminuyo la dosis de la infusión según lo que considero apropiado.',
  ] },
  { id: 'planning', title: 'PLANIFICACIÓN', texts: [
    'Cuando se produce un sangrado, solicito factor de coagulación para entrega el mismo día o acudo a urgencias porque no tengo factor en casa.',
    'Tengo suficiente factor de coagulación y material en casa para administrarme una infusión cuando lo necesito.',
    'Mantengo en casa dos o más dosis de factor de coagulación.',
    'Llevo un control de la cantidad de factor de coagulación y del material disponible en casa.',
  ] },
  { id: 'remembering', title: 'MEMORIA', texts: [
    'Olvido administrarme una infusión cuando aparecen síntomas de sangrado.',
    'Recuerdo qué cantidad de factor de coagulación debo administrarme para los episodios de sangrado.',
    'No me administro alguna de las infusiones recomendadas porque se me olvidan.',
    'Cuando se produce un sangrado, olvido seguir las recomendaciones de tratamiento que me da el centro de tratamiento.',
  ] },
  { id: 'communicating', title: 'COMUNICACIÓN', texts: [
    'Llamo al centro de tratamiento para pedir consejo cuando aparecen síntomas de sangrado.',
    'Llamo al centro de tratamiento cuando no sé con certeza si necesito administrarme una infusión.',
    'Tomo decisiones sobre el tratamiento por mi cuenta en lugar de llamar al centro de hemofilia.',
    'Llamo al centro de tratamiento antes de intervenciones médicas, como extracciones dentales, colonoscopias, visitas a urgencias o ingresos hospitalarios.',
  ] },
];

const VERITAS_PRN_INTRO = [
  'El manejo de la hemofilia es una tarea complicada. Las siguientes preguntas se refieren a cómo maneja los episodios de sangrado y las infusiones. Queremos conocer con qué frecuencia ha realizado cada una de estas acciones durante los últimos tres meses. Al responder, piense en un episodio de sangrado habitual en una articulación o un músculo: un sangrado confirmado, pero que no ponga en peligro la vida ni una extremidad. No hay respuestas correctas ni incorrectas. Lo más importante es que responda con sinceridad. Conteste cada pregunta utilizando la siguiente escala:',
  'Siempre: todo el tiempo, el 100 % de las veces.',
  'A menudo: la mayor parte del tiempo, al menos el 75 % de las veces.',
  'A veces: ocasionalmente, al menos el 50 % de las veces.',
  'Rara vez: con poca frecuencia, el 25 % de las veces.',
  'Nunca: en ningún caso, el 0 % de las veces.',
];

// ── VERITAS-Pro ─────────────────────────────────────────────────────────────
// Misma escala y mismo texto introductorio que VERITAS-PRN en el documento aportado (véase limitaciones).

export const VERITAS_PRO_BLOCKS: Array<{ id: string; title: string; texts: string[] }> = [
  { id: 'routine', title: 'Periodicidad', texts: [
    'Realizo las infusiones de profilaxis los días programados.',
    'Me administro las infusiones el número de veces por semana recomendado.',
    'Realizo las infusiones de profilaxis por la mañana, tal como se recomienda.',
    'Me administro las infusiones según el calendario proporcionado por el centro de tratamiento.',
  ] },
  { id: 'dosing', title: 'Dosis', texts: [
    'Utilizo la dosis recomendada por el médico para las infusiones.',
    'Me administro una dosis inferior a la prescrita.',
    'Aumento o disminuyo la dosis sin llamar al centro de tratamiento.',
    'Utilizo el número correcto de envases de factor para completar la dosis recomendada.',
  ] },
  { id: 'planning', title: 'Planificación', texts: [
    'Planifico con antelación para disponer de suficiente factor de coagulación en casa.',
    'Controlo cuidadosamente cuánto factor y cuántos materiales tengo en casa.',
    'Me quedo sin factor o sin materiales antes de pedir más.',
    'Tengo un sistema para llevar el control del factor y los materiales que tengo en casa.',
  ] },
  { id: 'remembering', title: 'Recordatorio', texts: [
    'Olvido administrarme las infusiones de profilaxis.',
    'Me resulta difícil acordarme de realizar la profilaxis.',
    'Recuerdo administrarme las infusiones según el calendario prescrito por el centro de tratamiento.',
    'Dejo de administrarme infusiones recomendadas porque se me olvidan.',
  ] },
  { id: 'skipping', title: 'Omisión de infusiones', texts: [
    'Me salto infusiones de profilaxis.',
    'Decido administrarme infusiones con menos frecuencia de la prescrita.',
    'Si no me viene bien administrarme una infusión, me la salto ese día.',
    'No me administro infusiones recomendadas porque decido saltármelas.',
  ] },
  { id: 'communicating', title: 'Comunicación', texts: [
    'Llamo al centro de tratamiento cuando tengo preguntas sobre la hemofilia o su tratamiento.',
    'Llamo al centro de tratamiento cuando tengo preocupaciones de salud relacionadas con la hemofilia o cuando se producen cambios.',
    'Tomo decisiones sobre el tratamiento por mi cuenta en lugar de llamar al centro de hemofilia.',
    'Llamo al centro de tratamiento antes de intervenciones médicas, como extracciones dentales, colonoscopias, visitas a urgencias o ingresos hospitalarios.',
  ] },
];

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `q${from + i}`);

// ── Catálogo ────────────────────────────────────────────────────────────────

export const INSTRUMENTS: Record<InstrumentCode, InstrumentDefinition> = {
  IEXPAC: {
    code: 'IEXPAC',
    shortName: 'IEXPAC',
    name: 'Instrumento de Evaluación de la eXperiencia del PAciente Crónico',
    construct: 'Experiencia del paciente crónico con la atención (PREM). Variable principal del estudio.',
    source: 'Documento «CUESTIONARIO IEXPAC» (IP, 14/10/2026); puntuación: protocolo COAMO p. 10.',
    available: true,
    primaryEndpoint: true,
    modes: ['self', 'assisted', 'interviewer'],
    instructions: {},
    options: IEXPAC_OPTIONS,
    sections: [
      { id: 'core', items: IEXPAC_ITEMS },
      { id: 'conditional', title: 'Preguntas condicionadas:', items: IEXPAC_CONDITIONAL },
    ],
    coreItemCodes: range(1, 11),
    scoringSummary: 'Ítems 1-11: Nunca = 1 … Siempre = 5. Suma 11-55. Global = 10 × (suma − 11) / 44, rango 0-10 (protocolo p. 10). Solo con los 11 ítems respondidos; sin imputación. Los ítems condicionados 12-15 se registran y exportan, pero no entran en la puntuación (regla no definida).',
    directionNote: 'Mayor puntuación = experiencia más favorable con la atención.',
    limitations: [
      'El documento no indica versión, autoría ni algoritmo; el algoritmo procede del protocolo (p. 10).',
      'Uso de los ítems condicionados 12-15 en la puntuación: pendiente de definición por el IP.',
      'La diferencia mínima de 1 punto (protocolo p. 13) se usó para el tamaño muestral; no se emplea para clasificar pacientes.',
    ],
  },
  EQ5D3L: {
    code: 'EQ5D3L',
    shortName: 'EQ-5D-3L',
    name: 'EQ-5D-3L · Cuestionario de salud (versión en español para España)',
    construct: 'Calidad de vida relacionada con la salud (PROM): sistema descriptivo de 5 dimensiones y EVA 0-100.',
    source: 'Documentos «EQ-5D-3L autoadministrado» (Spain (Spanish) v2.0) y «EQ-5D-3L administrado por profesional» (Spain (Spanish) v1.0), © EuroQol Research Foundation.',
    available: true,
    modes: ['self', 'interviewer'],
    instructions: {
      self: ['En cada sección, marque UNA casilla, la que mejor describa su estado de salud HOY.'],
      interviewer: [
        'Nota para quien hace la entrevista: aunque tenga su manera particular de expresarse, el texto de las instrucciones del cuestionario debe leerse al pie de la letra en la medida de lo posible. En el caso del sistema descriptivo del EQ-5D-3L, que aparece en la página 2 del cuestionario, debe leerse el texto exacto.',
        'Si la persona entrevistada tiene dificultad para elegir una respuesta o pide una aclaración, se le debe repetir la pregunta palabra por palabra y pedirle que responda de la manera que más se acerque a lo que piensa sobre su estado de salud hoy.',
        'INTRODUCCIÓN (Nota para quien hace la entrevista: lea el siguiente texto a la persona entrevistada.)',
        'Quisiéramos saber su opinión sobre su estado de salud. A medida que avancemos le iré indicando qué debe hacer, pero no dude en interrumpirme si hay algo que no entiende o necesita cualquier aclaración. No hay respuestas correctas o incorrectas. Solamente estamos interesados en su opinión personal.',
        'En primer lugar, voy a leer algunas preguntas. Cada pregunta tiene tres respuestas posibles. Dígame qué respuesta mejor describe su estado de salud HOY.',
        'No seleccione más de una respuesta en cada grupo de preguntas.',
        '(Nota para quien hace la entrevista: lea primero las tres opciones de cada pregunta. Luego, pida a la persona entrevistada que elija la opción que sea más adecuada en su caso. Repita la pregunta y las opciones de respuesta si es necesario. En cada pregunta, marque la casilla que corresponda. Es posible que tenga que recordarle con frecuencia a la persona entrevistada que el periodo al que debe referirse es hoy.)',
      ],
    },
    sections: [
      { id: 'descriptive', title: 'Sistema descriptivo del EQ-5D', items: EQ5D_ITEMS },
      { id: 'vas', title: 'EQ-5D VAS', items: [{ code: 'vas', title: 'EVA', text: 'Su estado de salud HOY', kind: 'vas' }] },
    ],
    coreItemCodes: [...EQ5D_ITEMS.map((i) => i.code), 'vas'],
    footer: {
      self: '© EuroQol Research Foundation. EQ-5D™ is a trade mark of the EuroQol Research Foundation. Spain (Spanish) v2.0',
      interviewer: '© EuroQol Research Foundation. EQ-5D™ is a trade mark of the EuroQol Research Foundation. Spain (Spanish) v1.0 · Gracias por tomarse el tiempo para responder estas preguntas.',
    },
    scoringSummary: 'Perfil de 5 dígitos (nivel 1-3 por dimensión, en el orden del documento) solo con las 5 dimensiones; EVA 0-100 independiente. No se suman dimensiones. Índice de utilidad NO calculado: no hay tarifa de valoración aprobada.',
    directionNote: 'Dimensiones: nivel menor = menos problemas. EVA: mayor = mejor estado de salud percibido.',
    limitations: [
      'Las dos modalidades son administraciones alternativas del mismo instrumento (v2.0 autoadministrado, v1.0 entrevista): se registra la modalidad y nunca se combinan.',
      'EVA: la escala vertical del documento (0-100, marcas cada 5) se reproduce como control deslizante vertical con casilla numérica; en papel se transcribe el número marcado.',
      'Uso electrónico sujeto a licencia y condiciones de EuroQol: verificar antes de la cumplimentación directa en pantalla.',
    ],
  },
  EVASAF: {
    code: 'EVASAF',
    shortName: 'EVASAF',
    name: 'Encuesta de valoración de la satisfacción de los pacientes con la Atención Farmacéutica recibida en las consultas de Farmacia hospitalaria',
    construct: 'Satisfacción con la atención farmacéutica (encuesta validada; Monje-Agudo et al., Farm Hosp 2015;39(3):152-6).',
    source: 'Documento «PROYECTO EVASAF» (IP, 14/10/2026); escala 1-5 también en protocolo p. 12.',
    available: true,
    modes: ['self', 'assisted', 'interviewer'],
    instructions: {
      default: [
        'Marque con una X la puntuación que considere más acorde con el servicio recibido (1 muy deficiente, 5 excelente).',
        'Con la Atención Farmacéutica (AF) que recibo en la consulta de Farmacia de mi centro hospitalario:',
      ],
    },
    options: EVASAF_OPTIONS,
    sections: [{ id: 'items', items: EVASAF_TEXTS.map((text, i) => ({ code: `q${i + 1}`, number: i + 1, text })) }],
    coreItemCodes: range(1, 10),
    scoringSummary: 'Cada ítem 1 (muy deficiente) – 5 (excelente). Sin puntuación total: ni el documento ni el protocolo definen una regla de agregación.',
    directionNote: 'En cada ítem, mayor valor = valoración más favorable.',
    limitations: [
      'Sin puntuación resumen aprobada: se analizan los ítems.',
      'El ítem 2 contiene dos afirmaciones en el documento; se reproduce tal cual.',
      'Errata del documento («Marque con na X») corregida a «una X».',
    ],
  },
  VERITAS_PRN: {
    code: 'VERITAS_PRN',
    shortName: 'VERITAS-PRN',
    name: 'VERITAS-PRN',
    construct: 'Adherencia al tratamiento a demanda en hemofilia (6 bloques de 4 ítems; referencia a los últimos tres meses).',
    source: 'Documento «VERITAS-PRN» (IP, 14/10/2026).',
    available: true,
    modes: ['self', 'assisted', 'interviewer'],
    instructions: { default: VERITAS_PRN_INTRO },
    options: VERITAS_OPTIONS,
    sections: VERITAS_PRN_BLOCKS.map((block, b) => ({
      id: block.id,
      title: block.title,
      items: block.texts.map((text, i) => ({ code: `q${b * 4 + i + 1}`, number: b * 4 + i + 1, text })),
    })),
    coreItemCodes: range(1, 24),
    scoringSummary: 'Sin puntuación: el documento no incluye clave de puntuación, ítems invertidos, rangos ni regla de datos ausentes. Se registran los códigos de respuesta (1 = Siempre … 5 = Nunca).',
    directionNote: 'No se interpreta la dirección del cambio: hay ítems redactados en sentido opuesto (p. ej., 6, 7, 12, 17) y la clave no está documentada.',
    limitations: [
      'No figura en el protocolo COAMO revisado (que cita Morisky-Green para adherencia): confirmar enmienda/aprobación.',
      'El documento no acredita que sea una versión española validada ni el permiso de uso.',
      'Aplicable en principio a régimen a demanda; texto centrado en hemofilia e infusiones de factor: aplicabilidad en EVW y terapias no sustitutivas, pendiente del IP.',
    ],
  },
  VERITAS_PRO: {
    code: 'VERITAS_PRO',
    shortName: 'VERITAS-Pro',
    name: 'VERITAS-Pro',
    construct: 'Adherencia al tratamiento profiláctico en hemofilia (6 bloques de 4 ítems; referencia a los últimos tres meses).',
    source: 'Documento «VERITAS-Pro» (IP, 27/10/2026).',
    available: true,
    modes: ['self', 'assisted', 'interviewer'],
    instructions: { default: VERITAS_PRN_INTRO },
    options: VERITAS_OPTIONS,
    sections: VERITAS_PRO_BLOCKS.map((block, b) => ({
      id: block.id,
      title: block.title,
      items: block.texts.map((text, i) => ({ code: `q${b * 4 + i + 1}`, number: b * 4 + i + 1, text })),
    })),
    coreItemCodes: range(1, 24),
    scoringSummary: 'Sin puntuación: el documento no incluye clave de puntuación, ítems invertidos, rangos ni regla de datos ausentes. Se registran los códigos de respuesta (1 = Siempre … 5 = Nunca).',
    directionNote: 'No se interpreta la dirección del cambio: hay ítems redactados en sentido opuesto (p. ej., 6, 7, 11, 13, 14, 16-20, 23) y la clave no está documentada.',
    limitations: [
      'No figura en el protocolo COAMO revisado (que cita Morisky-Green para adherencia): confirmar enmienda/aprobación.',
      'El documento no acredita que sea una versión española validada ni el permiso de uso; no incluye pie de versión ni copyright.',
      'El texto introductorio del documento es idéntico al de VERITAS-PRN (pide pensar en un episodio de sangrado habitual), aunque los ítems se refieren a la profilaxis: se reproduce tal cual; confirmar con el IP.',
      'Aplicable en principio a régimen de profilaxis; texto centrado en hemofilia e infusiones de factor: aplicabilidad en EVW y terapias no sustitutivas (p. ej., subcutáneas), pendiente del IP.',
    ],
  },
};

export function instrumentItems(code: InstrumentCode): QuestionnaireItem[] {
  return INSTRUMENTS[code].sections.flatMap((section) => section.items);
}

export function optionsFor(code: InstrumentCode, item: QuestionnaireItem, mode: AdministrationMode | null): ResponseOption[] {
  if (mode === 'interviewer' && item.interviewerOptions) return item.interviewerOptions;
  return item.options ?? INSTRUMENTS[code].options ?? [];
}

export function instrumentVersion(code: InstrumentCode, mode: AdministrationMode | null): string | null {
  switch (code) {
    case 'IEXPAC': return 'IEXPAC-COAMO-2026-10-14';
    case 'EQ5D3L': return mode === 'self' ? 'EQ-5D-3L-ES-ES-v2.0-self' : mode === 'interviewer' ? 'EQ-5D-3L-ES-ES-v1.0-interviewer' : null;
    case 'EVASAF': return 'EVASAF-FarmHosp2015-10it';
    case 'VERITAS_PRN': return 'VERITAS-PRN-ES-COAMO-2026-10-14';
    case 'VERITAS_PRO': return 'VERITAS-Pro-ES-COAMO-2026-10-27';
  }
}

/** Rango válido de un ítem (espejo de coag_private.questionnaire_items). */
export function itemRange(code: InstrumentCode, itemCode: string): { min: number; max: number } | null {
  const item = instrumentItems(code).find((i) => i.code === itemCode);
  if (!item) return null;
  if (item.kind === 'vas') return { min: 0, max: 100 };
  const values = optionsFor(code, item, null).map((o) => o.value);
  return { min: Math.min(...values), max: Math.max(...values) };
}
