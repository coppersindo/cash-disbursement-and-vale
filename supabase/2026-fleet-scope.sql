-- ============================================================================
-- Fleet-scoped ops access. Run once in the Disbursement project's SQL Editor
-- (after schema.sql). Safe to re-run.
--
-- Adds profiles.fleets (the fleet names an ops/requester user is allowed to
-- request for) and makes search_drivers() fleet-aware:
--   - back-office (encoder/approver/admin): all active drivers
--   - requester: only active drivers whose default_fleet is in their fleets
-- ============================================================================

alter table profiles add column if not exists fleets text[];

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
  order by d.name
  limit 50;
$$;

grant execute on function search_drivers(text) to authenticated;
