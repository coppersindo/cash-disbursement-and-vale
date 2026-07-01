-- ============================================================================
-- Disbursement & Vale — optional DEMO SEED for a fresh project.
-- Run ONCE, AFTER schema.sql and AFTER you've signed up + promoted yourself
-- (needs at least one profile to own the requests). NOT idempotent.
--
-- Gives you: 5 drivers, 5 loose "Requested" rows for the Cash Encoder demo,
-- and 1 already-Disbursed batch in last week's cutoff so Payroll Vale + Cash
-- Overview aren't empty. Rows are owned by your earliest profile.
-- ============================================================================

-- 5 drivers (3 BPI / 2 Maya)
insert into drivers (name, rail, number, garage, default_fleet) values
  ('Juan dela Cruz', 'BPI',  '0123456789',   'Meycauayan Main', 'Dump – Bounty'),
  ('Ramon Cruz',     'BPI',  '0451239988',   'Teresa Rizal',    'Dump – Cemex'),
  ('Mario Reyes',    'BPI',  '0098761234',   'Bacolor',         'Flatbed – Coke'),
  ('Pedro Santos',   'MAYA', '639171234567', 'Phividec',        'Tanker – Petron'),
  ('Luis Garcia',    'MAYA', '639287654321', 'Meycauayan 2',    'Bulk – Cemex');

-- Loose pool (Requested) — Cash Encoder demo
insert into disbursement_requests
  (driver_id, amount, type, justification, txn_date, week_start,
   requested_by, status, receipt_status, ca_installment)
select d.id, v.amount, v.type, v.justification, current_date, monday_of(current_date),
       (select id from profiles order by created_at limit 1),
       'Requested', v.receipt_status, v.ca_installment
from (values
  ('Juan dela Cruz',  8000, 'Budget', 'Fuel + toll, Cebu run', null,           null),
  ('Pedro Santos',    9000, 'CA',     'Cash advance',          null,           '1000/week'),
  ('Mario Reyes',     6500, 'Reimb',  'Tire repair',           'with_receipt', null),
  ('Ramon Cruz',     10000, 'Budget', 'Trip allowance',        null,           null),
  ('Luis Garcia',     5000, 'Budget', 'Per diem',              null,           null)
) as v(driver_name, amount, type, justification, receipt_status, ca_installment)
join drivers d on d.name = v.driver_name;

-- One finished, Disbursed batch last week — Payroll + Owner views
with b as (
  insert into disbursement_batches
    (code, status, submitted_by, approved_by, approved_at, approval_ref)
  values ('BATCH-0001','Disbursed',
          (select id from profiles order by created_at limit 1),
          (select id from profiles order by created_at limit 1),
          now(), 'APR-0001')
  returning id
)
insert into disbursement_requests
  (driver_id, amount, type, justification, txn_date, week_start,
   requested_by, status, batch_id, receipt_status, ca_installment)
select d.id, v.amount, v.type, v.justification, (current_date - 8), monday_of(current_date - 8),
       (select id from profiles order by created_at limit 1),
       'Disbursed', (select id from b), v.receipt_status, v.ca_installment
from (values
  ('Juan dela Cruz', 8000, 'Budget', 'Fuel + toll',     null,           null),
  ('Juan dela Cruz', 5000, 'Reimb',  'Tire repair',     'with_receipt', null),
  ('Pedro Santos',   9000, 'CA',     'Cash advance',    null,           '1000/week'),
  ('Ramon Cruz',     4500, 'Budget', 'Trip allowance',  null,           null),
  ('Ramon Cruz',     2200, 'Reimb',  'Parking + meals', 'pending',      null)
) as v(driver_name, amount, type, justification, receipt_status, ca_installment)
join drivers d on d.name = v.driver_name;
