-- ============================================================================
-- Truck plate on requests. Run once in the Disbursement project's SQL Editor.
-- Safe to re-run. Interim free-text plate (the authoritative plate list will
-- come from HR later, and eventually tie to the driver).
-- ============================================================================

alter table disbursement_requests add column if not exists truck_plate text;
