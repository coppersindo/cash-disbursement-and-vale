-- ============================================================================
-- HR-sync key on drivers. Run once in the DISBURSEMENT project's SQL Editor.
-- Safe to re-run.
--
-- Drivers are extracted from the HR Recruitment Directory project (its
-- `employees` table is the master: name + pay_method + pay_account). Each
-- synced driver carries the HR employee number so re-imports UPDATE the same
-- row instead of duplicating it.
-- ============================================================================

alter table drivers add column if not exists hr_emp_no text;
-- plain unique index (NULLs don't collide in Postgres, and PostgREST upsert
-- needs a full — not partial — unique index for onConflict)
create unique index if not exists idx_drivers_hr_emp_no on drivers(hr_emp_no);

-- HR has an Ibaan garage; drivers.garage FK needs it here too
insert into garages (name) values ('Ibaan') on conflict do nothing;
