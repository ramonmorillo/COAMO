-- Reversión de 20261122120000_coag_interventions_planning.sql (solo con autorización y copia de seguridad).
-- Antes de ejecutar: exportar las filas con planned_date u origin_intervention_id no nulos, que se perderían:
--   select id, visit_id, planned_date, origin_intervention_id from public.coag_interventions
--    where planned_date is not null or origin_intervention_id is not null;
-- Los registros vinculados (realizaciones en visitas posteriores) se CONSERVAN como actuaciones realizadas de su visita.
begin;
-- Restaura la función anterior (definición vigente en producción el 22/11/2026, migración coag_interventions).
create or replace function coag_private.enforce_intervention()
 returns trigger language plpgsql security definer set search_path to ''
as $function$
declare
  v_visit public.coag_visits%rowtype;
  v_catalog public.coag_intervention_catalog%rowtype;
begin
  if tg_op = 'UPDATE' and (new.visit_id is distinct from old.visit_id or new.catalog_code is distinct from old.catalog_code) then
    raise exception 'La visita y la actuación de catálogo de un registro no se pueden modificar: anúlelo y regístrelo de nuevo.';
  end if;
  select * into v_visit from public.coag_visits v where v.id = new.visit_id;
  if tg_op = 'INSERT' and v_visit.status = 'cancelled' then
    raise exception 'No se registran actuaciones en una visita anulada.';
  end if;
  if new.catalog_code is not null then
    select * into v_catalog from public.coag_intervention_catalog c where c.code = new.catalog_code;
    if not found or not v_catalog.is_active then
      raise exception 'Actuación de catálogo no válida: %.', new.catalog_code;
    end if;
    new.domain := v_catalog.domain;
  else
    new.custom_text := trim(new.custom_text);
  end if;
  new.followup_note := nullif(trim(coalesce(new.followup_note, '')), '');
  if new.status = 'performed' then
    if new.performed_date is null then raise exception 'Indique la fecha en que se realizó la actuación.'; end if;
    if new.performed_date > current_date then raise exception 'La fecha de realización no puede ser futura.'; end if;
  elsif new.status = 'planned' then
    new.performed_date := null;
  end if;
  if tg_op = 'INSERT' then
    select s.final_priority into new.priority_context
      from public.coag_stratifications s join public.coag_visits sv on sv.id = s.visit_id
     where sv.patient_id = v_visit.patient_id and s.status = 'completed' and sv.status <> 'cancelled'
       and sv.visit_date <= v_visit.visit_date and s.final_priority is not null
     order by sv.visit_date desc, s.completed_at desc nulls last limit 1;
    new.recommended_for_priority := case when new.catalog_code is null or new.priority_context is null then null
      else new.priority_context = any (v_catalog.applies_to_priorities) end;
    new.revision := 1; new.created_by := auth.uid(); new.created_at := timezone('utc', now());
  else
    new.priority_context := old.priority_context; new.recommended_for_priority := old.recommended_for_priority;
    new.revision := old.revision + 1; new.created_by := old.created_by; new.created_at := old.created_at;
  end if;
  new.updated_by := auth.uid(); new.updated_at := timezone('utc', now());
  return new;
end;
$function$;
revoke insert (planned_date, origin_intervention_id), update (planned_date) on public.coag_interventions from authenticated;
drop index if exists public.uq_coag_interventions_origin_active;
drop index if exists public.idx_coag_interventions_origin;
alter table public.coag_interventions drop column if exists origin_intervention_id;
alter table public.coag_interventions drop column if exists planned_date;
commit;
