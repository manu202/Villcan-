-- NOT APPLIED YET. Reviewed by the orchestrator by hand before running against
-- remote (project vjgdtxryudoscumwsjhs) — do NOT `supabase db push` this from
-- an agent session.
--
-- Product decision: removes the "viewer" (read-only) role entirely. It was
-- only ever enforced at the DB level (RLS on movements/services already
-- restricted writes to admin/barber) and had a UI hook (useBranchRole) wired
-- into exactly one screen (/orders) — everywhere else a viewer saw the same
-- write controls as everyone else and got a raw RLS error on submit. Rather
-- than finish wiring it into every write surface, the owner chose to drop
-- the concept: only 'admin' and 'barber' remain.
--
-- Verified before writing this: zero rows in user_branch_access currently
-- have role = 'viewer' in production, so no data needs converting. The
-- UPDATE below is defensive only, in case a row slips in between that check
-- and this migration actually running.

update public.user_branch_access
  set role = 'barber'
  where role = 'viewer';

alter table public.user_branch_access
  drop constraint if exists user_branch_access_role_check;

alter table public.user_branch_access
  add constraint user_branch_access_role_check
  check (role = any (array['admin'::text, 'barber'::text]));

-- Rollback (manual):
--   alter table public.user_branch_access drop constraint if exists user_branch_access_role_check;
--   alter table public.user_branch_access add constraint user_branch_access_role_check
--     check (role = any (array['admin'::text, 'barber'::text, 'viewer'::text]));
