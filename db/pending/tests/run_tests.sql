-- Pruebas de 20261122120000_coag_interventions_planning.sql (datos 100 % sintéticos).
-- Ejecución: bash db/pending/tests/run.sh   (PostgreSQL 16 local, base efímera)
\set ON_ERROR_STOP on
\i stub_schema.sql

-- Registros previos a la migración (deben quedar intactos).
insert into public.coag_patients(id, study_code, diagnosis) values
  ('00000000-0000-4000-8000-000000000001', 'TEST-001', 'HA'),
  ('00000000-0000-4000-8000-000000000002', 'TEST-002', 'EVW');
insert into public.coag_visits(id, patient_id, visit_type, visit_date, status) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'baseline', current_date - 60, 'completed'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'followup', current_date - 10, 'completed'),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'final', current_date + 300, 'scheduled'),
  ('10000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-000000000002', 'baseline', current_date - 30, 'completed');
insert into public.coag_intervention_catalog values
  ('SFT-01', 'v', 'pharmacotherapeutic_followup', '{1,2,3}', 'Tabla 5', 1, 'Validar tratamiento', true),
  ('EDU-08', 'v', 'patient_education', '{1,2}', 'Tabla 6', 8, 'Formación', true);
insert into public.coag_interventions(id, visit_id, catalog_code, domain, status, performed_date) values
  ('20000000-0000-4000-8000-0000000000aa', '10000000-0000-4000-8000-000000000001', 'SFT-01', 'x', 'performed', current_date - 60);
create temp table snapshot as select * from public.coag_interventions;

\i ../20261122120000_coag_interventions_planning.sql
-- Idempotencia: la segunda ejecución no falla ni cambia nada.
\i ../20261122120000_coag_interventions_planning.sql

create or replace function pg_temp.expect_error(p_sql text, p_fragment text) returns void language plpgsql as $$
begin
  begin execute p_sql; exception when others then
    if position(p_fragment in sqlerrm) = 0 then raise exception 'Error inesperado: % (se esperaba «%»)', sqlerrm, p_fragment; end if;
    raise notice 'OK (rechazado): %', p_fragment; return;
  end;
  raise exception 'Se esperaba un error con «%», pero la sentencia se aceptó: %', p_fragment, p_sql;
end $$;
create or replace function pg_temp.check(p_ok boolean, p_label text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'FALLO: %', p_label; end if; raise notice 'OK: %', p_label; end $$;

-- 0. Los registros previos no cambian.
select pg_temp.check((select count(*) = 0 from (select * from public.coag_interventions except select *, null::date, null::uuid from snapshot) d), 'registros previos intactos tras la migración');

-- 1. Prever en la visita 1 con fecha prevista futura.
insert into public.coag_interventions(id, visit_id, catalog_code, domain, status, planned_date) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'EDU-08', 'x', 'planned', current_date + 20);
select pg_temp.check((select status = 'planned' and performed_date is null and planned_date = current_date + 20 from public.coag_interventions where id = '20000000-0000-4000-8000-000000000001'), 'prevista con fecha futura, sin fecha de realización');
-- Una prevista nunca cuenta como realizada: la fecha de realización futura sigue prohibida.
select pg_temp.expect_error($$insert into public.coag_interventions(visit_id, custom_text, domain, status, performed_date) values ('10000000-0000-4000-8000-000000000002', 'Futura', 'care_coordination', 'performed', current_date + 5)$$, 'no puede ser futura');
select pg_temp.expect_error($$insert into public.coag_interventions(visit_id, custom_text, domain, status, planned_date) values ('10000000-0000-4000-8000-000000000002', 'Antes de la visita', 'care_coordination', 'planned', current_date - 30)$$, 'anterior a la fecha de la visita');

-- 2-3. En la visita 2 se documenta su realización (registro nuevo vinculado).
insert into public.coag_interventions(id, visit_id, domain, status, performed_date, origin_intervention_id, custom_text) values
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'patient_education', 'performed', current_date - 10, '20000000-0000-4000-8000-000000000001', null);
select pg_temp.check((select catalog_code = 'EDU-08' and planned_date = current_date + 20 and performed_date = current_date - 10 from public.coag_interventions where id = '20000000-0000-4000-8000-000000000002'), 'realización hereda la actuación y la fecha prevista');
-- Sin duplicados: una segunda realización activa de la misma prevista se rechaza.
select pg_temp.expect_error($$insert into public.coag_interventions(visit_id, domain, status, performed_date, origin_intervention_id) values ('10000000-0000-4000-8000-000000000002', 'patient_education', 'performed', current_date - 10, '20000000-0000-4000-8000-000000000001')$$, 'duplicate key');

-- 4-5. La visita 1 conserva exactamente su estado y fecha prevista.
select pg_temp.check((select status = 'planned' and planned_date = current_date + 20 and revision = 1 from public.coag_interventions where id = '20000000-0000-4000-8000-000000000001'), 'visita 1: prevista, misma fecha prevista, revisión 1 (sin modificar)');
-- Ni se puede realizar ni anular desde la visita 1 mientras conste realizada en la visita 2.
select pg_temp.expect_error($$update public.coag_interventions set status = 'performed', performed_date = current_date where id = '20000000-0000-4000-8000-000000000001'$$, 'ya consta como realizada');
select pg_temp.expect_error($$update public.coag_interventions set status = 'discarded' where id = '20000000-0000-4000-8000-000000000001'$$, 'ya consta como realizada');

-- 6. Reglas del vínculo.
select pg_temp.expect_error($$update public.coag_interventions set origin_intervention_id = null where id = '20000000-0000-4000-8000-000000000002'$$, 'no se puede modificar');
select pg_temp.expect_error($$update public.coag_interventions set planned_date = current_date + 40 where id = '20000000-0000-4000-8000-000000000002'$$, 'solo se puede modificar mientras');
select pg_temp.expect_error($$insert into public.coag_interventions(visit_id, domain, status, performed_date, origin_intervention_id) values ('10000000-0000-4000-8000-000000000009', 'patient_education', 'performed', current_date - 1, '20000000-0000-4000-8000-0000000000aa')$$, 'otro paciente');
select pg_temp.expect_error($$insert into public.coag_interventions(visit_id, domain, status, performed_date, origin_intervention_id) values ('10000000-0000-4000-8000-000000000002', 'patient_education', 'performed', current_date - 1, '20000000-0000-4000-8000-0000000000aa')$$, 'sigue prevista');
insert into public.coag_interventions(id, visit_id, custom_text, domain, status, planned_date) values
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'Coordinar con hematología', 'care_coordination', 'planned', current_date + 30);
select pg_temp.expect_error($$insert into public.coag_interventions(visit_id, domain, status, performed_date, origin_intervention_id) values ('10000000-0000-4000-8000-000000000001', 'care_coordination', 'performed', current_date - 60, '20000000-0000-4000-8000-000000000003')$$, 'visita posterior a esta');
select pg_temp.expect_error($$insert into public.coag_interventions(visit_id, domain, status, origin_intervention_id) values ('10000000-0000-4000-8000-000000000003', 'care_coordination', 'planned', '20000000-0000-4000-8000-000000000003')$$, 'debe ser «realizada»');
select pg_temp.expect_error($$insert into public.coag_interventions(visit_id, domain, status, performed_date, origin_intervention_id) values ('10000000-0000-4000-8000-000000000002', 'care_coordination', 'performed', current_date - 1, '20000000-0000-4000-8000-000000000003')$$, 'misma visita');
-- Reprogramar mientras sigue prevista: permitido y auditado.
update public.coag_interventions set planned_date = current_date + 45 where id = '20000000-0000-4000-8000-000000000003';
select pg_temp.check((select count(*) = 2 from public.coag_audit_log where new_row->>'id' = '20000000-0000-4000-8000-000000000003'), 'reprogramación auditada (alta + cambio)');
select pg_temp.check((select (old_row->>'planned_date')::date = current_date + 30 from public.coag_audit_log where op = 'UPDATE' and new_row->>'id' = '20000000-0000-4000-8000-000000000003'), 'auditoría conserva la fecha prevista inicial');
-- Realizada en la misma visita: conserva la fecha prevista original.
update public.coag_interventions set status = 'performed', performed_date = current_date where id = '20000000-0000-4000-8000-000000000003';
select pg_temp.check((select planned_date = current_date + 45 and status = 'performed' from public.coag_interventions where id = '20000000-0000-4000-8000-000000000003'), 'realizada en su visita conserva la fecha prevista');
-- Anular la realización de la visita 2 libera la prevista de la visita 1 (vuelve a estar pendiente) sin tocarla.
update public.coag_interventions set status = 'discarded' where id = '20000000-0000-4000-8000-000000000002';
select pg_temp.check((select revision = 1 and status = 'planned' from public.coag_interventions where id = '20000000-0000-4000-8000-000000000001'), 'anular la realización no modifica la prevista de origen');
select pg_temp.check(not exists (select 1 from public.coag_interventions r where r.origin_intervention_id = '20000000-0000-4000-8000-000000000001' and r.status <> 'discarded'), 'prevista de visita 1 vuelve a estar pendiente');
-- Borrar una prevista con realizaciones vinculadas está impedido (ON DELETE RESTRICT).
select pg_temp.expect_error($$delete from public.coag_interventions where id = '20000000-0000-4000-8000-000000000001'$$, 'violates foreign key');

-- Permisos de columna para authenticated.
select pg_temp.check(has_column_privilege('authenticated', 'public.coag_interventions', 'planned_date', 'INSERT') and has_column_privilege('authenticated', 'public.coag_interventions', 'planned_date', 'UPDATE'), 'authenticated puede fijar y reprogramar planned_date');
select pg_temp.check(has_column_privilege('authenticated', 'public.coag_interventions', 'origin_intervention_id', 'INSERT') and not has_column_privilege('authenticated', 'public.coag_interventions', 'origin_intervention_id', 'UPDATE'), 'origin_intervention_id: alta sí, modificación no');

\echo 'TODAS LAS PRUEBAS SUPERADAS'
