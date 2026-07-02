-- ============================================================================
-- GITC — Disbursement & Vale : COMPLETE schema for a fresh Supabase project.
-- This app has its OWN Supabase project (separate from the HR app), so this
-- one file stands up everything from an empty database:
--   role enum · profiles + signup trigger · garages · drivers ·
--   disbursement_requests / _batches · payroll_weeks · RPCs · RLS · storage.
--
-- Run once in the Supabase SQL Editor (Dashboard → SQL → New query → Run).
-- Safe to re-run. Because the database is fresh, the role enum is created with
-- all values at once — no multi-file / ALTER TYPE ordering needed.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---- Roles -----------------------------------------------------------------
do $$ begin
  create type user_role as enum
    ('requester','encoder','approver','payroll','admin');
exception when duplicate_object then null; end $$;

-- ---- Reference: garages ----------------------------------------------------
create table if not exists garages (name text primary key);
insert into garages (name) values
  ('Meycauayan Main'),('Meycauayan 2'),('Teresa Rizal'),('Phividec'),('Bacolor')
on conflict do nothing;

-- ---- Profiles (one row per auth user; carries role + access flags) ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role user_role not null default 'requester',
  approved boolean not null default false,
  disbursement_approver boolean not null default false,
  fleets text[],                    -- fleet names an ops/requester user may request for
  created_at timestamptz not null default now()
);

-- Auto-create a profile on signup (new users land unapproved).
create or replace function handle_new_user()
returns trigger language plpgsql
security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', new.email),
          new.email)
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---- Access helpers (every check requires an APPROVED account) --------------
create or replace function is_member()
returns boolean language sql stable
security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and approved);
$$;

create or replace function has_role(roles user_role[])
returns boolean language sql stable
security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.approved and p.role = any(roles)
  );
$$;

-- ============================================================================
-- Disbursement tables
-- ============================================================================
create table if not exists drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rail text not null check (rail in ('BPI','MAYA')),
  number text not null,                       -- BPI account OR Maya mobile; ALWAYS text
  garage text references garages(name),
  default_fleet text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists disbursement_batches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                   -- BATCH-0001
  status text not null default 'Submitted'
    check (status in ('Submitted','Approved','Rejected','Disbursed')),
  submitted_by uuid references profiles(id),
  submitted_at timestamptz not null default now(),
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  approval_ref text,                           -- APR-0001
  reject_reason text
);

create table if not exists disbursement_requests (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references drivers(id),
  amount numeric(12,2) not null check (amount > 0),
  type text not null check (type in ('Budget','CA','Reimb')),
  justification text,
  txn_date date not null default current_date,
  week_start date not null,                    -- Monday of txn_date's cutoff week
  receipt_status text check (receipt_status in ('with_receipt','pending','charge_driver')),
  ca_installment text,
  status text not null default 'Requested'
    check (status in ('Requested','Submitted','Approved','Rejected','Disbursed')),
  batch_id uuid references disbursement_batches(id),
  requested_by uuid references profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists payroll_weeks (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  closed boolean not null default false,
  submitted_to_payroll_at timestamptz,
  released_at date
);

create index if not exists idx_disb_req_status   on disbursement_requests(status);
create index if not exists idx_disb_req_week      on disbursement_requests(week_start);
create index if not exists idx_disb_req_batch     on disbursement_requests(batch_id);
create index if not exists idx_disb_req_driver    on disbursement_requests(driver_id);
create index if not exists idx_disb_req_requester on disbursement_requests(requested_by);

-- ---- Sequence + date helpers -----------------------------------------------
create or replace function next_batch_code()
returns text language sql stable as $$
  select 'BATCH-' || lpad(
    (coalesce(max((regexp_replace(code, '\D', '', 'g'))::int), 0) + 1)::text, 4, '0')
  from disbursement_batches;
$$;

create or replace function next_approval_ref()
returns text language sql stable as $$
  select 'APR-' || lpad(
    (coalesce(max((regexp_replace(approval_ref, '\D', '', 'g'))::int), 0) + 1)::text, 4, '0')
  from disbursement_batches where approval_ref is not null;
$$;

create or replace function monday_of(d date)
returns date language sql immutable as $$
  select date_trunc('week', d)::date;
$$;

-- ---- Approver gate ("two named users only") --------------------------------
create or replace function is_disbursement_approver()
returns boolean language sql stable
security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.approved and p.disbursement_approver
      and p.role in ('approver','admin')
  );
$$;

-- ---- Requester-safe driver access (no rail / no number) --------------------
create or replace function search_drivers(q text default '')
returns table (id uuid, name text, default_fleet text, garage text, active boolean)
language sql stable security definer set search_path = public as $$
  with me as (
    select role, fleets from profiles where id = auth.uid() and approved
  )
  select d.id, d.name, d.default_fleet, d.garage, d.active
  from drivers d, me
  where d.active
    and (q = '' or d.name ilike '%' || q || '%')
    and (
      me.role in ('encoder','approver','admin')            -- back-office: all fleets
      or (me.fleets is not null and d.default_fleet = any(me.fleets)) -- ops: their fleets
    )
  order by d.name limit 50;
$$;

create or replace function driver_names(ids uuid[])
returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select d.id, d.name from drivers d where is_member() and d.id = any(ids);
$$;

create or replace function profile_names(ids uuid[])
returns table (id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name from profiles p where is_member() and p.id = any(ids);
$$;

-- ============================================================================
-- Lifecycle RPCs (SECURITY DEFINER — the ONLY legal state transitions)
-- ============================================================================
create or replace function submit_batch(request_ids uuid[])
returns disbursement_batches
language plpgsql security definer set search_path = public as $$
declare b disbursement_batches;
begin
  if not has_role(array['encoder','admin']::user_role[]) then
    raise exception 'Only encoders may submit batches';
  end if;
  if array_length(request_ids, 1) is null then
    raise exception 'No requests selected';
  end if;
  if exists (select 1 from disbursement_requests
             where id = any(request_ids) and status <> 'Requested') then
    raise exception 'All requests must be in Requested status';
  end if;

  insert into disbursement_batches (code, status, submitted_by)
  values (next_batch_code(), 'Submitted', auth.uid())
  returning * into b;

  update disbursement_requests set status = 'Submitted', batch_id = b.id
    where id = any(request_ids) and status = 'Requested';
  return b;
end; $$;

create or replace function approve_batch(p_batch_id uuid)
returns disbursement_batches
language plpgsql security definer set search_path = public as $$
declare b disbursement_batches;
begin
  if not is_disbursement_approver() then raise exception 'Not authorized to approve'; end if;
  update disbursement_batches
    set status='Approved', approved_by=auth.uid(), approved_at=now(),
        approval_ref = coalesce(approval_ref, next_approval_ref())
    where id = p_batch_id and status = 'Submitted'
    returning * into b;
  if b.id is null then raise exception 'Batch not found or not in Submitted status'; end if;
  update disbursement_requests set status='Approved'
    where batch_id = p_batch_id and status = 'Submitted';
  return b;
end; $$;

create or replace function reject_batch(p_batch_id uuid, p_reason text)
returns disbursement_batches
language plpgsql security definer set search_path = public as $$
declare b disbursement_batches;
begin
  if not is_disbursement_approver() then raise exception 'Not authorized to reject'; end if;
  update disbursement_batches set status='Rejected', reject_reason=p_reason
    where id = p_batch_id and status = 'Submitted'
    returning * into b;
  if b.id is null then raise exception 'Batch not found or not in Submitted status'; end if;
  update disbursement_requests set status='Requested', batch_id=null where batch_id = p_batch_id;
  return b;
end; $$;

create or replace function mark_disbursed(p_batch_id uuid)
returns disbursement_batches
language plpgsql security definer set search_path = public as $$
declare b disbursement_batches;
begin
  if not is_disbursement_approver() then raise exception 'Not authorized'; end if;
  update disbursement_batches set status='Disbursed'
    where id = p_batch_id and status = 'Approved'
    returning * into b;
  if b.id is null then raise exception 'Batch not found or not in Approved status'; end if;
  update disbursement_requests set status='Disbursed'
    where batch_id = p_batch_id and status = 'Approved';
  return b;
end; $$;

create or replace function close_week(p_week_start date)
returns payroll_weeks
language plpgsql security definer set search_path = public as $$
declare w payroll_weeks;
begin
  if not has_role(array['payroll','admin']::user_role[]) then
    raise exception 'Only payroll may close a week';
  end if;
  insert into payroll_weeks (week_start, closed, submitted_to_payroll_at)
  values (p_week_start, true, now())
  on conflict (week_start) do update
    set closed = true,
        submitted_to_payroll_at = coalesce(payroll_weeks.submitted_to_payroll_at, now())
  returning * into w;
  return w;
end; $$;

grant execute on function search_drivers(text)    to authenticated;
grant execute on function driver_names(uuid[])     to authenticated;
grant execute on function profile_names(uuid[])    to authenticated;
grant execute on function submit_batch(uuid[])     to authenticated;
grant execute on function approve_batch(uuid)      to authenticated;
grant execute on function reject_batch(uuid, text) to authenticated;
grant execute on function mark_disbursed(uuid)     to authenticated;
grant execute on function close_week(date)         to authenticated;

-- ============================================================================
-- Row-Level Security
-- ============================================================================
alter table garages               enable row level security;
alter table profiles              enable row level security;
alter table drivers               enable row level security;
alter table disbursement_requests enable row level security;
alter table disbursement_batches  enable row level security;
alter table payroll_weeks         enable row level security;

-- garages: readable by approved members
drop policy if exists garages_read on garages;
create policy garages_read on garages for select to authenticated using (is_member());

-- profiles: read own (admins read all); admins manage
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select to authenticated
  using (id = auth.uid() or has_role(array['admin']::user_role[]));
drop policy if exists profiles_admin_all on profiles;
create policy profiles_admin_all on profiles for all to authenticated
  using (has_role(array['admin']::user_role[]))
  with check (has_role(array['admin']::user_role[]));

-- drivers: full table for encoder/approver/admin; requesters use search_drivers()
drop policy if exists drivers_read on drivers;
create policy drivers_read on drivers for select to authenticated
  using (has_role(array['encoder','approver','admin']::user_role[]));
drop policy if exists drivers_write on drivers;
create policy drivers_write on drivers for insert to authenticated
  with check (has_role(array['admin','encoder']::user_role[]));
drop policy if exists drivers_update on drivers;
create policy drivers_update on drivers for update to authenticated
  using (has_role(array['admin','encoder']::user_role[]))
  with check (has_role(array['admin','encoder']::user_role[]));
drop policy if exists drivers_delete on drivers;
create policy drivers_delete on drivers for delete to authenticated
  using (has_role(array['encoder','admin']::user_role[]));

-- requests
drop policy if exists disb_req_read on disbursement_requests;
create policy disb_req_read on disbursement_requests for select to authenticated
  using (requested_by = auth.uid()
    or has_role(array['encoder','approver','payroll','admin']::user_role[]));
drop policy if exists disb_req_insert on disbursement_requests;
create policy disb_req_insert on disbursement_requests for insert to authenticated
  with check (is_member() and requested_by = auth.uid()
    and status = 'Requested' and batch_id is null);
drop policy if exists disb_req_update on disbursement_requests;
create policy disb_req_update on disbursement_requests for update to authenticated
  using (requested_by = auth.uid() and status = 'Requested')
  with check (requested_by = auth.uid() and status = 'Requested');
drop policy if exists disb_req_delete on disbursement_requests;
create policy disb_req_delete on disbursement_requests for delete to authenticated
  using (
    (requested_by = auth.uid() and status = 'Requested')
    or (status = 'Requested' and has_role(array['encoder','admin']::user_role[]))
    or has_role(array['admin']::user_role[])
  );

-- batches + payroll weeks: read by back-office; writes via RPCs only
drop policy if exists disb_batch_read on disbursement_batches;
create policy disb_batch_read on disbursement_batches for select to authenticated
  using (has_role(array['encoder','approver','payroll','admin']::user_role[]));
drop policy if exists payroll_weeks_read on payroll_weeks;
create policy payroll_weeks_read on payroll_weeks for select to authenticated
  using (has_role(array['encoder','approver','payroll','admin']::user_role[]));

-- ============================================================================
-- Storage: private 'disbursements' bucket for generated bank files (audit)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('disbursements','disbursements', false)
on conflict (id) do nothing;

drop policy if exists disb_files_read on storage.objects;
create policy disb_files_read on storage.objects for select to authenticated
  using (bucket_id = 'disbursements'
    and has_role(array['approver','payroll','admin']::user_role[]));
drop policy if exists disb_files_write on storage.objects;
create policy disb_files_write on storage.objects for insert to authenticated
  with check (bucket_id = 'disbursements' and is_disbursement_approver());
drop policy if exists disb_files_delete on storage.objects;
create policy disb_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'disbursements' and has_role(array['admin']::user_role[]));

-- ============================================================================
-- AFTER you have signed up once in the app, make yourself the admin + approver
-- by running this (promotes the most-recent signup):
--
--   update public.profiles set approved = true, role = 'admin',
--          disbursement_approver = true
--   where id = (select id from auth.users order by created_at desc limit 1);
-- ============================================================================
