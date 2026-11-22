-- COAMO · Planificación y seguimiento longitudinal de las actuaciones de AF (22/11/2026)
--
-- ESTADO: PENDIENTE. Este fichero NO se ha aplicado en Supabase. El historial canónico de migraciones del
-- proyecto compartido vive en ramonmorillo/dermapex (supabase/migrations/): debe copiarse allí con este mismo
-- nombre, pasar su CI (scripts/test-db.sh) y aplicarse con autorización expresa y copia de seguridad previa.
--
-- Qué resuelve (revisión del investigador colaborador, fase 5):
--   1. «Prever» no admitía fecha prevista: se añade planned_date (fecha prevista, ≥ fecha de la visita en que se
--      planifica). Es distinta de performed_date (fecha real) y de created_at (fecha de registro).
--   2. Al realizarse más tarde, la ejecución se documentaba modificando el registro de la visita de origen o no se
--      podía documentar. Ahora la realización en una visita posterior es un registro NUEVO de esa visita que apunta
--      a la actuación prevista (origin_intervention_id). El registro de origen NO se modifica: conserva su estado
--      «prevista» y su fecha prevista; su resolución se deduce del vínculo. Un índice único impide documentar dos
--      veces la misma realización.
--
-- Carácter: ADITIVA y no destructiva. Dos columnas anulables nuevas, un índice único parcial, un índice, permisos
-- de columna y la sustitución de coag_private.enforce_intervention() conservando TODAS sus reglas anteriores.
-- Ningún registro existente cambia (planned_date y origin_intervention_id quedan NULL en los registros previos).
-- Solo afecta a public.coag_interventions y coag_private.enforce_intervention (ámbito COAMO).
--
-- Reversión (sin pérdida de datos previos; se pierden solo las fechas previstas y vínculos registrados después):
--   ver 20261122120000_coag_interventions_planning.down.sql

begin;

alter table public.coag_interventions add column if not exists planned_date date;
alter table public.coag_interventions add column if not exists origin_intervention_id uuid
  references public.coag_interventions(id) on delete restrict;

comment on column public.coag_interventions.planned_date is
  'Fecha prevista de realización (solo se fija al prever; se conserva al realizarla). Distinta de performed_date y de created_at.';
comment on column public.coag_interventions.origin_intervention_id is
  'Actuación prevista en una visita ANTERIOR que este registro documenta como realizada. El registro de origen no se modifica.';

create index if not exists idx_coag_interventions_origin on public.coag_interventions (origin_intervention_id)
  where origin_intervention_id is not null;
-- Una actuación prevista solo puede tener una realización activa (no anulada).
create unique index if not exists uq_coag_interventions_origin_active on public.coag_interventions (origin_intervention_id)
  where origin_intervention_id is not null and status <> 'discarded';

-- Permisos por columna: mismo patrón que la migración original (authenticated solo escribe columnas de negocio).
grant insert (planned_date, origin_intervention_id) on public.coag_interventions to authenticated;
grant update (planned_date) on public.coag_interventions to authenticated;

create or replace function coag_private.enforce_intervention()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_visit public.coag_visits%rowtype;
  v_catalog public.coag_intervention_catalog%rowtype;
  v_origin public.coag_interventions%rowtype;
  v_origin_visit public.coag_visits%rowtype;
begin
  if tg_op = 'UPDATE' and (new.visit_id is distinct from old.visit_id or new.catalog_code is distinct from old.catalog_code) then
    raise exception 'La visita y la actuación de catálogo de un registro no se pueden modificar: anúlelo y regístrelo de nuevo.';
  end if;
  if tg_op = 'UPDATE' and new.origin_intervention_id is distinct from old.origin_intervention_id then
    raise exception 'El vínculo con la actuación prevista de origen no se puede modificar: anule el registro y documéntelo de nuevo.';
  end if;
  select * into v_visit from public.coag_visits v where v.id = new.visit_id;
  if tg_op = 'INSERT' and v_visit.status = 'cancelled' then
    raise exception 'No se registran actuaciones en una visita anulada.';
  end if;

  -- Realización en una visita posterior de una actuación prevista antes.
  if tg_op = 'INSERT' and new.origin_intervention_id is not null then
    select * into v_origin from public.coag_interventions i where i.id = new.origin_intervention_id;
    if not found then
      raise exception 'La actuación prevista de origen no existe.';
    end if;
    select * into v_origin_visit from public.coag_visits v where v.id = v_origin.visit_id;
    if v_origin_visit.patient_id is distinct from v_visit.patient_id then
      raise exception 'La actuación prevista de origen pertenece a otro paciente.';
    end if;
    if v_origin.visit_id = new.visit_id then
      raise exception 'En la misma visita, marque la actuación prevista como realizada en lugar de crear otro registro.';
    end if;
    if v_origin_visit.visit_date > v_visit.visit_date then
      raise exception 'La actuación de origen se previó en una visita posterior a esta.';
    end if;
    if v_origin.status <> 'planned' then
      raise exception 'Solo se puede documentar la realización de una actuación que sigue prevista.';
    end if;
    if new.status <> 'performed' then
      raise exception 'Un registro vinculado a una actuación prevista documenta su realización: su estado debe ser «realizada».';
    end if;
    -- Misma actuación que la prevista (no se duplica ni se cambia su contenido).
    new.catalog_code := v_origin.catalog_code;
    new.custom_text := v_origin.custom_text;
    new.domain := v_origin.domain;
    new.planned_date := v_origin.planned_date;
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

  -- Fecha prevista: se fija al prever; después de realizarla o anularla no cambia.
  if tg_op = 'UPDATE' and old.status <> 'planned' and new.planned_date is distinct from old.planned_date then
    raise exception 'La fecha prevista solo se puede modificar mientras la actuación sigue prevista.';
  end if;
  if new.origin_intervention_id is null and new.planned_date is not null
     and (tg_op = 'INSERT' or new.planned_date is distinct from old.planned_date)
     and new.planned_date < v_visit.visit_date then
    raise exception 'La fecha prevista no puede ser anterior a la fecha de la visita en que se planifica.';
  end if;
  if tg_op = 'INSERT' and new.status = 'performed' and new.origin_intervention_id is null then
    new.planned_date := null; -- realizada sin previsión previa
  end if;

  -- Una prevista ya realizada en una visita posterior no se vuelve a realizar ni se anula desde su visita de origen.
  if tg_op = 'UPDATE' and old.status = 'planned' and new.status <> 'planned' and exists (
       select 1 from public.coag_interventions r
        where r.origin_intervention_id = old.id and r.status <> 'discarded') then
    raise exception 'Esta actuación prevista ya consta como realizada en una visita posterior: anule antes ese registro.';
  end if;

  if new.status = 'performed' then
    if new.performed_date is null then
      raise exception 'Indique la fecha en que se realizó la actuación.';
    end if;
    if new.performed_date > current_date then
      raise exception 'La fecha de realización no puede ser futura.';
    end if;
  elsif new.status = 'planned' then
    new.performed_date := null;
  end if;

  if tg_op = 'INSERT' then
    -- Prioridad vigente: última estratificación completada del paciente hasta la fecha de la visita.
    select s.final_priority into new.priority_context
      from public.coag_stratifications s join public.coag_visits sv on sv.id = s.visit_id
     where sv.patient_id = v_visit.patient_id and s.status = 'completed' and sv.status <> 'cancelled'
       and sv.visit_date <= v_visit.visit_date and s.final_priority is not null
     order by sv.visit_date desc, s.completed_at desc nulls last
     limit 1;
    new.recommended_for_priority := case
      when new.catalog_code is null or new.priority_context is null then null
      else new.priority_context = any (v_catalog.applies_to_priorities) end;
    new.revision := 1;
    new.created_by := auth.uid();
    new.created_at := timezone('utc', now());
  else
    new.priority_context := old.priority_context;
    new.recommended_for_priority := old.recommended_for_priority;
    new.revision := old.revision + 1;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := timezone('utc', now());
  return new;
end;
$function$;

commit;
