-- ============================================================================
-- Run ONCE in the *HR Recruitment Directory* project (wwfhusblshvarcgvgodz).
-- Same pattern as public.parts_drivers / parts_units / parts_mechanics:
-- an owner-owned view that exposes ONLY what the Disbursement app needs,
-- readable with the HR anon key so the sync needs no HR login.
--
-- ⚠ SECURITY NOTE: unlike parts_drivers (names only), this view exposes
-- pay_account (BPI account / Maya mobile numbers) to anyone holding the HR
-- anon key. That key is public by design. Accepted trade-off for one-click
-- sync — if you ever want to close it, `drop view public.disb_drivers;`
-- and the Disbursement app falls back to HR sign-in.
-- ============================================================================

create or replace view public.disb_drivers as
select
  emp_no,
  name,
  upper(pay_method) as rail,     -- BPI / MAYA
  pay_account       as number,   -- BPI account or Maya mobile
  garage
from public.employees
where active
  and coalesce(pay_method,  '') <> ''
  and coalesce(pay_account, '') <> '';

grant select on public.disb_drivers to anon, authenticated;
