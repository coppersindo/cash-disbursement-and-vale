-- ============================================================================
-- Delete permissions. Run once in the Disbursement project's SQL Editor.
-- Safe to re-run.
--
--  * drivers: encoder + admin may delete (was admin-only). A driver that has
--    any request can't be deleted (FK) — deactivate it instead.
--  * requests: the requester may delete their own while still Requested;
--    encoder/admin may delete any Requested (pool) row; admin may delete any.
--    Submitted/Approved/Disbursed rows stay locked.
-- ============================================================================

drop policy if exists drivers_delete on drivers;
create policy drivers_delete on drivers for delete to authenticated
  using (has_role(array['encoder','admin']::user_role[]));

drop policy if exists disb_req_delete on disbursement_requests;
create policy disb_req_delete on disbursement_requests for delete to authenticated
  using (
    (requested_by = auth.uid() and status = 'Requested')
    or (status = 'Requested' and has_role(array['encoder','admin']::user_role[]))
    or has_role(array['admin']::user_role[])
  );
