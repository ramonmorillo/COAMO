-- Esquema MÍNIMO para probar la migración en un PostgreSQL local. NO es el esquema canónico (que vive en
-- ramonmorillo/dermapex): reproduce solo las tablas y restricciones que la migración usa, tal como figuran en los
-- metadatos de producción consultados (solo lectura) el 22/11/2026: columnas, CHECK, índice único por visita y
-- catálogo, triggers de reglas y auditoría y permisos de columna de public.coag_interventions.
create extension if not exists pgcrypto;
create schema if not exists auth;
create schema if not exists coag_private;
do $$ begin if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if; end $$;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

create table public.coag_profiles (id uuid primary key);
create table public.coag_patients (id uuid primary key default gen_random_uuid(), study_code text not null, diagnosis text not null);
create table public.coag_visits (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.coag_patients(id),
  visit_type text not null, visit_date date not null, status text not null);
create table public.coag_stratifications (
  id uuid primary key default gen_random_uuid(), visit_id uuid not null references public.coag_visits(id),
  status text not null, final_priority smallint, completed_at timestamptz);
create table public.coag_intervention_catalog (
  code text primary key, catalog_version text not null, domain text not null, applies_to_priorities int[] not null,
  source_table text, sort_order int, action_text text not null, is_active boolean not null default true);
create table public.coag_interventions (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.coag_visits(id) on delete cascade,
  catalog_code text references public.coag_intervention_catalog(code),
  custom_text text, domain text not null, status text not null, performed_date date, followup_note text,
  priority_context smallint, recommended_for_priority boolean, revision integer not null default 1,
  created_by uuid references public.coag_profiles(id) on delete set null,
  updated_by uuid references public.coag_profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint coag_interventions_custom_text_check check (custom_text is null or (length(trim(custom_text)) >= 3 and length(trim(custom_text)) <= 500)),
  constraint coag_interventions_domain_check check (domain = any (array['pharmacotherapeutic_followup','patient_education','care_coordination'])),
  constraint coag_interventions_followup_note_check check (followup_note is null or length(followup_note) <= 1000),
  constraint coag_interventions_one_source check ((catalog_code is null) <> (custom_text is null)),
  constraint coag_interventions_performed_date check (((status = 'performed') = (performed_date is not null)) or status = 'discarded'),
  constraint coag_interventions_priority_context_check check (priority_context >= 1 and priority_context <= 3),
  constraint coag_interventions_status_check check (status = any (array['planned','performed','discarded'])));
create index idx_coag_interventions_visit on public.coag_interventions (visit_id);
create unique index uq_coag_interventions_catalog_per_visit on public.coag_interventions (visit_id, catalog_code)
  where catalog_code is not null and status <> 'discarded';

create table public.coag_audit_log (id bigserial primary key, table_name text, op text, old_row jsonb, new_row jsonb, at timestamptz default now());
create or replace function coag_private.write_audit_log() returns trigger language plpgsql as $$
begin
  insert into public.coag_audit_log(table_name, op, old_row, new_row)
  values (tg_table_name, tg_op, case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- Función de reglas vigente antes de la migración (copiada de producción el 22/11/2026): se carga ejecutando la
-- reversión sobre columnas provisionales, lo que además prueba que la reversión se ejecuta sin errores.
alter table public.coag_interventions add column planned_date date, add column origin_intervention_id uuid;
grant insert (planned_date, origin_intervention_id), update (planned_date) on public.coag_interventions to authenticated;
\i ../20261122120000_coag_interventions_planning.down.sql
create trigger trg_coag_interventions_rules before insert or update on public.coag_interventions for each row execute function coag_private.enforce_intervention();
create trigger trg_coag_interventions_audit after insert or delete or update on public.coag_interventions for each row execute function coag_private.write_audit_log();
grant select, delete on public.coag_interventions to authenticated;
grant insert (catalog_code, custom_text, domain, followup_note, performed_date, status, visit_id) on public.coag_interventions to authenticated;
grant update (custom_text, status, domain, performed_date, followup_note) on public.coag_interventions to authenticated;
