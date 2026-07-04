-- ============================================================================
-- Run this in the *HR Recruitment Directory* project's SQL Editor
-- (wwfhusblshvarcgvgodz), then click "Download CSV" on the results and
-- import that file in the Disbursement app: Driver Master → Sync from HR.
--
-- Exports every ACTIVE driver that has a mode of payment on file.
-- ============================================================================

select
  emp_no,
  name,
  upper(pay_method) as rail,     -- BPI / MAYA
  pay_account       as number,   -- BPI account or Maya mobile
  garage
from employees
where active
  and coalesce(pay_method, '') <> ''
  and coalesce(pay_account, '') <> ''
order by name;

-- ---------------------------------------------------------------------------
-- OPTIONAL: see which active drivers are missing pay info (they will NOT be
-- exported above — fill in their Mode of Payment in the HR app first):
--
-- select emp_no, name from employees
-- where active and (coalesce(pay_method,'') = '' or coalesce(pay_account,'') = '')
-- order by name;
-- ---------------------------------------------------------------------------
