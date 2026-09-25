-- Production monitoring/alerting -- currently a real blind spot per the
-- audit ("client_errors table + manual /errors page review is the entire
-- observability story; no alerting, no uptime check, nothing beyond what a
-- human remembers to go look at"). Scoped deliberately minimal, no external
-- notification channel assumed (that's a product decision for the owner,
-- not something to invent credentials for -- see docs/monitoring.md):
--
--   1. system_alerts: a table to record detected problems.
--   2. pg_cron job, every 15 minutes: checks client_errors for a spike (more
--      than N errors in the last hour for a single branch) and writes a row
--      to system_alerts if found. Nothing sends a push/email/Slack message
--      yet -- see docs/monitoring.md for what a follow-up notification pass
--      would look like.
--
-- No pg_cron usage exists anywhere else in this project yet (checked
-- first, per instruction) -- this is a fresh setup, not an established
-- pattern to match.
--
-- "Money-critical path" tagging: client_errors has no severity/category
-- column (message/stack/url/user_agent/user_id/branch_id/created_at only),
-- so there is nothing to reliably infer a "money-critical" error from
-- without fragile string-matching heuristics on free-text error messages.
-- Not implemented -- the spike check is the only signal this migration
-- adds. Documented as a real limitation in docs/monitoring.md, not
-- silently skipped.

-- ============================================================================
-- 1. system_alerts
-- ============================================================================

create table public.system_alerts (
  id              uuid primary key default gen_random_uuid(),
  branch_id       uuid references public.branches(id) on delete set null,
  kind            text not null,
  detail          jsonb,
  created_at      timestamptz not null default now(),
  acknowledged_at timestamptz
);

create index idx_system_alerts_branch_id on public.system_alerts(branch_id);
create index idx_system_alerts_created_at on public.system_alerts(created_at desc);

alter table public.system_alerts enable row level security;

-- Read-only for admins, same pattern as client_errors_select_admin. No
-- INSERT/UPDATE policy for anon/authenticated: only the cron job (running
-- as its scheduling role, which bypasses RLS) writes rows. acknowledged_at
-- has no write path yet from the app either -- that's follow-up work
-- alongside whichever notification channel gets picked, see
-- docs/monitoring.md. Nothing in this migration lets it silently rot
-- unactionable forever: it is a real column with a real value once
-- something starts setting it, just not from this migration.
create policy "system_alerts_select_admin"
  on public.system_alerts for select
  using (public.is_admin_anywhere());

-- ============================================================================
-- 2. Spike-check function + pg_cron schedule
-- ============================================================================

create extension if not exists pg_cron schema extensions;

create or replace function public._check_client_error_spikes()
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  -- Villcan is pre-launch, low order volume (see odd/tasks/villcan-audit.md);
  -- normal client_errors volume per branch per hour should be near-zero
  -- (QA-1 already filters out third-party browser-extension noise at the
  -- source -- see src/lib/errorLogging.ts). 20/hour/branch is comfortably
  -- above any plausible legitimate rate and low enough to catch a real
  -- broken deploy or a hot loop quickly. Revisit once there's real traffic
  -- data to tune against.
  v_threshold constant integer := 20;
  v_window constant interval := interval '1 hour';
  v_branch record;
begin
  for v_branch in
    select branch_id, count(*) as error_count
    from public.client_errors
    where created_at >= now() - v_window
      and branch_id is not null
    group by branch_id
    having count(*) > v_threshold
  loop
    -- Dedup: skip if an unacknowledged spike alert for this branch was
    -- already raised within the lookback window, so one continuing spike
    -- doesn't produce a new row every 15 minutes.
    if not exists (
      select 1 from public.system_alerts
      where branch_id = v_branch.branch_id
        and kind = 'client_error_spike'
        and acknowledged_at is null
        and created_at >= now() - v_window
    ) then
      insert into public.system_alerts (branch_id, kind, detail)
      values (
        v_branch.branch_id,
        'client_error_spike',
        jsonb_build_object(
          'error_count', v_branch.error_count,
          'threshold', v_threshold,
          'window_minutes', extract(epoch from v_window) / 60
        )
      );
    end if;
  end loop;
end;
$$;

revoke execute on function public._check_client_error_spikes() from public;

select cron.schedule(
  'client-error-spike-check',
  '*/15 * * * *',
  $$select public._check_client_error_spikes()$$
);

-- DOWN (manual):
--   select cron.unschedule('client-error-spike-check');
--   drop function if exists public._check_client_error_spikes();
--   drop table if exists public.system_alerts;
