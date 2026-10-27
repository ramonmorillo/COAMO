# Trazabilidad: documento original → pregunta → variable digital

Generado automáticamente desde `src/domain/questionnaires/instruments.ts` con `scripts/generate-traceability.ts`. 
La literalidad de cada texto frente al .docx se comprueba en `tests/questionnaireIntegrity.test.ts` (fixtures extraídas con `scripts/extract-docx-text.py`).

- **Clave BD**: clave en `coag_questionnaire_administrations.responses` (y `item_applicability` para condicionados).
- **Columna CSV**: columna de `coamo_cuestionarios_ancho.csv`.
- **Códigos**: valor almacenado = posición de la opción en el documento.

## IEXPAC

- Documento: CUESTIONARIO_IEXPAC.docx
- Fuente: Documento «CUESTIONARIO IEXPAC» (IP, 14/10/2026); puntuación: protocolo COAMO p. 10.
- Puntuación: Ítems 1-11: Nunca = 1 … Siempre = 5. Suma 11-55. Global = 10 × (suma − 11) / 44, rango 0-10 (protocolo p. 10). Solo con los 11 ítems respondidos; sin imputación. Los ítems condicionados 12-15 se registran y exportan, pero no entran en la puntuación (regla no definida).
- Dirección: Mayor puntuación = experiencia más favorable con la atención.

| Sección | Nº | Texto del documento | Opciones (código = etiqueta) | Clave BD | Columna CSV |
|---|---|---|---|---|---|
| — | 1 | **Respetan mi estilo de vida.** Los profesionales que me atienden me escuchan y tienen en cuenta mis necesidades, costumbres y preferencias para adaptar mi plan de cuidados y tratamiento. | 1=Nunca; 2=Casi nunca; 3=A veces; 4=Casi siempre; 5=Siempre | `q1` | `iexpac_q1` |
| — | 2 | **Están coordinados para ofrecerme una buena atención.** Los profesionales que me atienden en el centro de salud y los que me atienden en el hospital hablan entre ellos y se coordinan para mejorar mi bienestar y mi calidad de vida. | 1=Nunca; 2=Casi nunca; 3=A veces; 4=Casi siempre; 5=Siempre | `q2` | `iexpac_q2` |
| — | 3 | **Me ayudan a informarme por Internet.** Los profesionales que me atienden me informan sobre páginas web y foros de internet de los que me puedo fiar para conocer mejor mi enfermedad, su tratamiento y las consecuencias que pueden tener en mi vida. | 1=Nunca; 2=Casi nunca; 3=A veces; 4=Casi siempre; 5=Siempre | `q3` | `iexpac_q3` |
| — | 4 | **Ahora sé cuidarme mejor.** Con el apoyo de mis profesionales siento que ha mejorado mi confianza y mi capacidad para cuidar de mí mismo/a, manejar mejor mis problemas de salud y mantener mi autonomía. | 1=Nunca; 2=Casi nunca; 3=A veces; 4=Casi siempre; 5=Siempre | `q4` | `iexpac_q4` |
| — | 5 | **Me preguntan y me ayudan a seguir mi plan de tratamiento.** Reviso con los profesionales que me atienden el cumplimiento de mi plan de cuidados y tratamiento y, si tengo dudas, me las aclaran. | 1=Nunca; 2=Casi nunca; 3=A veces; 4=Casi siempre; 5=Siempre | `q5` | `iexpac_q5` |
| — | 6 | **Acordamos objetivos para llevar una vida sana y controlar mejor mi enfermedad.** He podido acordar con los profesionales que me atienden objetivos concretos sobre alimentación, ejercicio físico y cómo tomar adecuadamente la medicación para controlar mejor mi enfermedad. | 1=Nunca; 2=Casi nunca; 3=A veces; 4=Casi siempre; 5=Siempre | `q6` | `iexpac_q6` |
| — | 7 | **Uso internet y el móvil para consultar mi historia clínica.** Uso Internet y el móvil para consultar mi historia clínica, resultados de mis pruebas, citas programadas y acceder a otros servicios en la web de mi Servicio de salud. | 1=Nunca; 2=Casi nunca; 3=A veces; 4=Casi siempre; 5=Siempre | `q7` | `iexpac_q7` |
| — | 8 | **Se aseguran de que tomo la medicación correctamente.** Los profesionales que me atienden revisan conmigo todos los medicamentos que tomo, cómo los tomo, cómo me sientan y puedo consultarles las dudas que tenga. | 1=Nunca; 2=Casi nunca; 3=A veces; 4=Casi siempre; 5=Siempre | `q8` | `iexpac_q8` |
| — | 9 | **Se preocupan por mi bienestar.** Los profesionales que me atienden se preocupan por mi calidad de vida y los veo comprometidos para que mejore mi bienestar. | 1=Nunca; 2=Casi nunca; 3=A veces; 4=Casi siempre; 5=Siempre | `q9` | `iexpac_q9` |
| — | 10 | **Me informan de recursos sanitarios y sociales que me pueden ayudar.** Los profesionales que me atienden me informan sobre los recursos sanitarios y sociales de que dispongo (en mi barrio, ciudad o pueblo) y que puedo utilizar para mejorar mis problemas de salud y para cuidarme mejor. | 1=Nunca; 2=Casi nunca; 3=A veces; 4=Casi siempre; 5=Siempre | `q10` | `iexpac_q10` |
| — | 11 | **Me animan a hablar con otros pacientes.** Los profesionales que me atienden me animan a participar en grupos de pacientes para compartir información y experiencias sobre cómo cuidarnos y mejorar nuestra salud. | 1=Nunca; 2=Casi nunca; 3=A veces; 4=Casi siempre; 5=Siempre | `q11` | `iexpac_q11` |
| Preguntas condicionadas: | 12 | **Se preocupan por mí al llegar a casa tras estar en el hospital.** _Si usted ha estado ingresado en el hospital en los últimos 6 meses, por favor, responda a la siguiente pregunta:_ Después de recibir el alta del hospital, me han llamado o visitado en casa para ver cómo me encontraba y qué cuidados necesitaba. | 1=Nunca; 2=Casi nunca; 3=A veces; 4=Casi siempre; 5=Siempre | `q12` | `iexpac_q12`, `iexpac_q12_applies` |
| Preguntas condicionadas: | 13 | **Me orientan para no tener una nueva urgencia.** _Si usted ha recibido atención en urgencias en los últimos 6 meses, por favor, responda a la siguiente pregunta:_ Después de haber estado en urgencias, los profesionales que me atienden saben lo que me ha pasado y me orientan para evitar una nueva urgencia. | 1=Nunca; 2=Casi nunca; 3=A veces; 4=Casi siempre; 5=Siempre | `q13` | `iexpac_q13`, `iexpac_q13_applies` |
| Preguntas condicionadas: | 14 | **Me atienden bien en mi domicilio.** _Si usted ha recibido atención sanitaria en su domicilio en los últimos 6 meses, por favor, responda a la siguiente pregunta:_ Los profesionales que me atienden en mi casa tratan de solucionar mis problemas de salud de forma coordinada con los profesionales del centro de salud y del hospital, y si es necesario, con los servicios sociales. | 1=Nunca; 2=Casi nunca; 3=A veces; 4=Casi siempre; 5=Siempre | `q14` | `iexpac_q14`, `iexpac_q14_applies` |
| Preguntas condicionadas: | 15 | **Los servicios sociales están coordinados con los servicios sanitarios para ofrecerme una buena atención.** _Si usted ha recibido atención de los servicios sociales en los últimos 6 meses, por favor, responda a la siguiente pregunta:_ Los profesionales que me atienden en los servicios sociales hablan y se coordinan con los profesionales sanitarios para ofrecerme una buena atención. | 1=Nunca; 2=Casi nunca; 3=A veces; 4=Casi siempre; 5=Siempre | `q15` | `iexpac_q15`, `iexpac_q15_applies` |

## EQ-5D-3L

- Documento: EQ-5D-3L_autoadministrado.docx (v2.0) / EQ-5D-3L_administrado_por_profesional.docx (v1.0)
- Fuente: Documentos «EQ-5D-3L autoadministrado» (Spain (Spanish) v2.0) y «EQ-5D-3L administrado por profesional» (Spain (Spanish) v1.0), © EuroQol Research Foundation.
- Puntuación: Perfil de 5 dígitos (nivel 1-3 por dimensión, en el orden del documento) solo con las 5 dimensiones; EVA 0-100 independiente. No se suman dimensiones. Índice de utilidad NO calculado: no hay tarifa de valoración aprobada.
- Dirección: Dimensiones: nivel menor = menos problemas. EVA: mayor = mejor estado de salud percibido.

| Sección | Nº | Texto del documento | Opciones (código = etiqueta) | Clave BD | Columna CSV |
|---|---|---|---|---|---|
| Sistema descriptivo del EQ-5D | — | MOVILIDAD <br>Entrevista: Primero, me gustaría preguntarle sobre la MOVILIDAD. ¿Diría usted que… | 1=No tengo problemas para caminar; 2=Tengo algunos problemas para caminar; 3=No puedo moverme de la cama | `mobility` | `eq5d_mobility` |
| Sistema descriptivo del EQ-5D | — | CUIDADOS PERSONALES <br>Entrevista: Ahora, me gustaría preguntarle sobre los CUIDADOS PERSONALES. ¿Diría usted que… | 1=No tengo problemas con los cuidados personales; 2=Tengo algunos problemas para lavarme (bañarme) o vestirme; 3=No puedo lavarme (bañarme) ni vestirme | `self_care` | `eq5d_self_care` |
| Sistema descriptivo del EQ-5D | — | **ACTIVIDADES HABITUALES.** ACTIVIDADES HABITUALES (p. ej., trabajar, estudiar, hacer las tareas domésticas, actividades en familia o actividades de tiempo libre) <br>Entrevista: Ahora, me gustaría preguntarle sobre las ACTIVIDADES HABITUALES, por ejemplo, trabajar, estudiar, hacer las tareas domésticas, actividades en familia o actividades de tiempo libre. ¿Diría usted que… | 1=No tengo problemas para realizar mis actividades habituales; 2=Tengo algunos problemas para realizar mis actividades habituales; 3=No puedo realizar mis actividades habituales | `usual_activities` | `eq5d_usual_activities` |
| Sistema descriptivo del EQ-5D | — | **DOLOR / MOLESTIAS.** DOLOR / MOLESTIAS (p. ej., mareos, náuseas, picazón [comezón]) <br>Entrevista: Ahora, me gustaría preguntarle sobre el DOLOR O LAS MOLESTIAS, por ejemplo, mareos, náuseas, picazón [comezón]. ¿Diría usted que… | 1=No tengo dolor ni molestias; 2=Tengo dolor o molestias moderadas; 3=Tengo dolor o molestias extremas | `pain_discomfort` | `eq5d_pain_discomfort` |
| Sistema descriptivo del EQ-5D | — | ANSIEDAD (ANGUSTIA) / DEPRESIÓN <br>Entrevista: Finalmente, me gustaría preguntarle sobre la ANSIEDAD (ANGUSTIA) O LA DEPRESIÓN. ¿Diría usted que… | 1=No tengo ansiedad ni depresión; 2=Tengo ansiedad o depresión moderada; 3=Tengo ansiedad o depresión extrema | `anxiety_depression` | `eq5d_anxiety_depression` |
| EQ-5D VAS | — | **EVA.** Su estado de salud HOY | 0-100 (entero) | `vas` | `eq5d_vas` |

## EVASAF

- Documento: PROYECTO_EVASAF.docx
- Fuente: Documento «PROYECTO EVASAF» (IP, 14/10/2026); escala 1-5 también en protocolo p. 12.
- Puntuación: Cada ítem 1 (muy deficiente) – 5 (excelente). Sin puntuación total: ni el documento ni el protocolo definen una regla de agregación.
- Dirección: En cada ítem, mayor valor = valoración más favorable.

| Sección | Nº | Texto del documento | Opciones (código = etiqueta) | Clave BD | Columna CSV |
|---|---|---|---|---|---|
| — | 1 | Conozco mejor los medicamentos que utilizo. | 1=1; 2=2; 3=3; 4=4; 5=5 | `q1` | `evasaf_q1` |
| — | 2 | Sé qué medicamentos puedo tomar y cuáles no por las interacciones que puedan existir. Mi farmacéutico me pregunta por mi medicación domiciliaria. | 1=1; 2=2; 3=3; 4=4; 5=5 | `q2` | `evasaf_q2` |
| — | 3 | Soy más consciente de la importancia de cumplir mi tratamiento para ser adherente. | 1=1; 2=2; 3=3; 4=4; 5=5 | `q3` | `evasaf_q3` |
| — | 4 | Tengo mayores conocimientos sobre las reacciones adversas que pueden provocar mis medicamentos. | 1=1; 2=2; 3=3; 4=4; 5=5 | `q4` | `evasaf_q4` |
| — | 5 | He logrado reducir las reacciones adversas de los medicamentos que tomo gracias a una mejor explicación sobre el manejo de los mismos. | 1=1; 2=2; 3=3; 4=4; 5=5 | `q5` | `evasaf_q5` |
| — | 6 | Siento la implicación de mi farmacéutico en mi problema de salud. | 1=1; 2=2; 3=3; 4=4; 5=5 | `q6` | `evasaf_q6` |
| — | 7 | Continuaría visitando la consulta de atención farmacéutica para seguir en el programa de seguimiento de mis medicamentos. | 1=1; 2=2; 3=3; 4=4; 5=5 | `q7` | `evasaf_q7` |
| — | 8 | Solicitaría a mi médico que continúe trabajando conjuntamente con mi farmacéutico porque confío en él. | 1=1; 2=2; 3=3; 4=4; 5=5 | `q8` | `evasaf_q8` |
| — | 9 | La atención farmacéutica prestada se lleva a cabo de forma privada. | 1=1; 2=2; 3=3; 4=4; 5=5 | `q9` | `evasaf_q9` |
| — | 10 | Estoy satisfecho con el servicio que recibo. | 1=1; 2=2; 3=3; 4=4; 5=5 | `q10` | `evasaf_q10` |

## VERITAS-PRN

- Documento: VERITAS-PRN.docx
- Fuente: Documento «VERITAS-PRN» (IP, 14/10/2026).
- Puntuación: Sin puntuación: el documento no incluye clave de puntuación, ítems invertidos, rangos ni regla de datos ausentes. Se registran los códigos de respuesta (1 = Siempre … 5 = Nunca).
- Dirección: No se interpreta la dirección del cambio: hay ítems redactados en sentido opuesto (p. ej., 6, 7, 12, 17) y la clave no está documentada.

| Sección | Nº | Texto del documento | Opciones (código = etiqueta) | Clave BD | Columna CSV |
|---|---|---|---|---|---|
| TRATAMIENTO | 1 | Me administro una infusión cuando aparecen síntomas de sangrado. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q1` | `vprn_q1` |
| TRATAMIENTO | 2 | Me administro infusiones durante el número de días recomendado por el centro de tratamiento. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q2` | `vprn_q2` |
| TRATAMIENTO | 3 | Completo el número de infusiones recomendado cuando se produce un sangrado. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q3` | `vprn_q3` |
| TRATAMIENTO | 4 | Sigo las indicaciones que me ha dado el centro de tratamiento para el manejo de la hemofilia. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q4` | `vprn_q4` |
| MOMENTO DE ADMINISTRACIÓN | 5 | Cuando aparecen síntomas de sangrado, interrumpo mis actividades y me administro una infusión inmediatamente. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q5` | `vprn_q5` |
| MOMENTO DE ADMINISTRACIÓN | 6 | Cuando aparecen síntomas de sangrado, espero para administrarme una infusión hasta que me resulte conveniente. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q6` | `vprn_q6` |
| MOMENTO DE ADMINISTRACIÓN | 7 | Espero uno o dos días después de que comiencen los síntomas de sangrado para administrarme una infusión. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q7` | `vprn_q7` |
| MOMENTO DE ADMINISTRACIÓN | 8 | Me administro una infusión dentro de las tres horas siguientes a la aparición de síntomas de sangrado. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q8` | `vprn_q8` |
| DOSIFICACIÓN | 9 | Me administro la dosis prescrita para los episodios de sangrado. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q9` | `vprn_q9` |
| DOSIFICACIÓN | 10 | Recuerdo la dosis recomendada por el médico. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q10` | `vprn_q10` |
| DOSIFICACIÓN | 11 | Utilizo el número correcto de envases de factor de coagulación para alcanzar la dosis recomendada. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q11` | `vprn_q11` |
| DOSIFICACIÓN | 12 | En lugar de llamar al centro de tratamiento, aumento o disminuyo la dosis de la infusión según lo que considero apropiado. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q12` | `vprn_q12` |
| PLANIFICACIÓN | 13 | Cuando se produce un sangrado, solicito factor de coagulación para entrega el mismo día o acudo a urgencias porque no tengo factor en casa. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q13` | `vprn_q13` |
| PLANIFICACIÓN | 14 | Tengo suficiente factor de coagulación y material en casa para administrarme una infusión cuando lo necesito. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q14` | `vprn_q14` |
| PLANIFICACIÓN | 15 | Mantengo en casa dos o más dosis de factor de coagulación. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q15` | `vprn_q15` |
| PLANIFICACIÓN | 16 | Llevo un control de la cantidad de factor de coagulación y del material disponible en casa. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q16` | `vprn_q16` |
| MEMORIA | 17 | Olvido administrarme una infusión cuando aparecen síntomas de sangrado. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q17` | `vprn_q17` |
| MEMORIA | 18 | Recuerdo qué cantidad de factor de coagulación debo administrarme para los episodios de sangrado. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q18` | `vprn_q18` |
| MEMORIA | 19 | No me administro alguna de las infusiones recomendadas porque se me olvidan. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q19` | `vprn_q19` |
| MEMORIA | 20 | Cuando se produce un sangrado, olvido seguir las recomendaciones de tratamiento que me da el centro de tratamiento. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q20` | `vprn_q20` |
| COMUNICACIÓN | 21 | Llamo al centro de tratamiento para pedir consejo cuando aparecen síntomas de sangrado. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q21` | `vprn_q21` |
| COMUNICACIÓN | 22 | Llamo al centro de tratamiento cuando no sé con certeza si necesito administrarme una infusión. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q22` | `vprn_q22` |
| COMUNICACIÓN | 23 | Tomo decisiones sobre el tratamiento por mi cuenta en lugar de llamar al centro de hemofilia. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q23` | `vprn_q23` |
| COMUNICACIÓN | 24 | Llamo al centro de tratamiento antes de intervenciones médicas, como extracciones dentales, colonoscopias, visitas a urgencias o ingresos hospitalarios. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q24` | `vprn_q24` |

## VERITAS-Pro

- Documento: VERITAS-Pro.docx
- Fuente: Documento «VERITAS-Pro» (IP, 27/10/2026).
- Puntuación: Sin puntuación: el documento no incluye clave de puntuación, ítems invertidos, rangos ni regla de datos ausentes. Se registran los códigos de respuesta (1 = Siempre … 5 = Nunca).
- Dirección: No se interpreta la dirección del cambio: hay ítems redactados en sentido opuesto (p. ej., 6, 7, 11, 13, 14, 16-20, 23) y la clave no está documentada.

| Sección | Nº | Texto del documento | Opciones (código = etiqueta) | Clave BD | Columna CSV |
|---|---|---|---|---|---|
| Periodicidad | 1 | Realizo las infusiones de profilaxis los días programados. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q1` | `vpro_q1` |
| Periodicidad | 2 | Me administro las infusiones el número de veces por semana recomendado. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q2` | `vpro_q2` |
| Periodicidad | 3 | Realizo las infusiones de profilaxis por la mañana, tal como se recomienda. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q3` | `vpro_q3` |
| Periodicidad | 4 | Me administro las infusiones según el calendario proporcionado por el centro de tratamiento. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q4` | `vpro_q4` |
| Dosis | 5 | Utilizo la dosis recomendada por el médico para las infusiones. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q5` | `vpro_q5` |
| Dosis | 6 | Me administro una dosis inferior a la prescrita. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q6` | `vpro_q6` |
| Dosis | 7 | Aumento o disminuyo la dosis sin llamar al centro de tratamiento. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q7` | `vpro_q7` |
| Dosis | 8 | Utilizo el número correcto de envases de factor para completar la dosis recomendada. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q8` | `vpro_q8` |
| Planificación | 9 | Planifico con antelación para disponer de suficiente factor de coagulación en casa. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q9` | `vpro_q9` |
| Planificación | 10 | Controlo cuidadosamente cuánto factor y cuántos materiales tengo en casa. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q10` | `vpro_q10` |
| Planificación | 11 | Me quedo sin factor o sin materiales antes de pedir más. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q11` | `vpro_q11` |
| Planificación | 12 | Tengo un sistema para llevar el control del factor y los materiales que tengo en casa. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q12` | `vpro_q12` |
| Recordatorio | 13 | Olvido administrarme las infusiones de profilaxis. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q13` | `vpro_q13` |
| Recordatorio | 14 | Me resulta difícil acordarme de realizar la profilaxis. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q14` | `vpro_q14` |
| Recordatorio | 15 | Recuerdo administrarme las infusiones según el calendario prescrito por el centro de tratamiento. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q15` | `vpro_q15` |
| Recordatorio | 16 | Dejo de administrarme infusiones recomendadas porque se me olvidan. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q16` | `vpro_q16` |
| Omisión de infusiones | 17 | Me salto infusiones de profilaxis. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q17` | `vpro_q17` |
| Omisión de infusiones | 18 | Decido administrarme infusiones con menos frecuencia de la prescrita. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q18` | `vpro_q18` |
| Omisión de infusiones | 19 | Si no me viene bien administrarme una infusión, me la salto ese día. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q19` | `vpro_q19` |
| Omisión de infusiones | 20 | No me administro infusiones recomendadas porque decido saltármelas. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q20` | `vpro_q20` |
| Comunicación | 21 | Llamo al centro de tratamiento cuando tengo preguntas sobre la hemofilia o su tratamiento. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q21` | `vpro_q21` |
| Comunicación | 22 | Llamo al centro de tratamiento cuando tengo preocupaciones de salud relacionadas con la hemofilia o cuando se producen cambios. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q22` | `vpro_q22` |
| Comunicación | 23 | Tomo decisiones sobre el tratamiento por mi cuenta en lugar de llamar al centro de hemofilia. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q23` | `vpro_q23` |
| Comunicación | 24 | Llamo al centro de tratamiento antes de intervenciones médicas, como extracciones dentales, colonoscopias, visitas a urgencias o ingresos hospitalarios. | 1=Siempre; 2=A menudo; 3=A veces; 4=Rara vez; 5=Nunca | `q24` | `vpro_q24` |
