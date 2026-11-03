# COAMO · Fase de pruebas en producción (datos ficticios)

**Estado: EN CURSO** desde el 14/10/2026. Decisión del investigador (03/11/2026): los investigadores usan la herramienta con
pacientes de prueba para familiarizarse con ella. **Ninguno de estos registros es un paciente del estudio.**

## Pacientes de prueba (excluir de cualquier análisis)

| Código | Centro | Estado al 03/11/2026 | Alta |
|---|---|---|---|
| COAMO-1-0001 | LAFE | Incluido | 14/10/2026 |
| COAMO-1-0002 | LAFE | Finalizado | 26/10/2026 |
| COAMO-1-0003 | LAFE | Incluido | 30/10/2026 |
| COAMO-2-0001 | VHEBRON | Incluido | 30/10/2026 |

Cualquier paciente que se cree durante la fase de pruebas también es de prueba y debe añadirse a esta tabla (o constar en el
acta de cierre). Las exportaciones de investigación generadas durante esta fase contienen solo datos ficticios.

## Cierre de la fase (solo cuando lo indique el investigador)

No se ha borrado nada. Antes de incluir el primer paciente real hay que decidir y ejecutar, en este orden:

1. **Copia de seguridad** de las tablas COAMO.
2. **Borrado de los pacientes de prueba** por coordinación COAMO: el borrado de un paciente arrastra sus visitas, cuestionarios,
   estratificaciones, actuaciones y evoluciones. El historial queda en `coag_audit_log` (auditoría: no se borra).
3. **Numeración de los códigos.** Los códigos son correlativos por centro y no se reutilizan: sin más acción, el primer paciente
   real de La Fe sería COAMO-1-0004 y el de Vall d'Hebron COAMO-2-0002. Si se quiere que empiecen en 0001, hay que reiniciar
   `coag_private.patient_code_counters` en ese momento (decisión del investigador).
4. Comprobar que `coag_patients` queda vacía y registrar aquí la fecha de cierre.
