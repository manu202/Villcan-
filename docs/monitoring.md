# Production monitoring / alerting

Status: minimal scaffold added 2026-09-25. Do not read this as "monitoring is
solved" — it closes one specific blind spot (silent client-side error
spikes) and explicitly does not cover most of what real production
monitoring means. See "What this does NOT cover" below before assuming
anything is watched that isn't listed here.

## What this covers

A `pg_cron` job (`client-error-spike-check`, every 15 minutes) that checks
`client_errors` for an unusually high volume of client-side errors in the
last hour for a single branch, and — if found — writes a row to a new
`system_alerts` table.

- **Table**: `public.system_alerts` (`id`, `branch_id`, `kind`, `detail`
  jsonb, `created_at`, `acknowledged_at` nullable). Read-only for admins via
  RLS (`is_admin_anywhere()`, same pattern as `client_errors`). No
  INSERT/UPDATE policy for `anon`/`authenticated` — only the cron job
  (running as its scheduling role, which bypasses RLS) writes rows.
- **Detection function**: `public._check_client_error_spikes()`. For every
  branch with **more than 20** `client_errors` rows in the trailing 1 hour,
  inserts a `system_alerts` row with `kind = 'client_error_spike'` and
  `detail = {error_count, threshold, window_minutes}`.
  - **Why 20/hour/branch**: Villcan is pre-launch with low order volume (see
    `odd/tasks/villcan-audit.md`), and `src/lib/errorLogging.ts` already
    filters out third-party browser-extension noise at the source (QA-1), so
    normal `client_errors` volume per branch per hour should be near-zero.
    20 is comfortably above any plausible legitimate rate while still low
    enough to catch a real broken deploy or a client-side hot loop quickly.
    **This has not been tuned against real traffic** — there isn't any yet.
    Revisit once there is.
  - **Deduplication**: won't raise a second alert for the same branch while
    an earlier `client_error_spike` alert for that branch is still
    unacknowledged and within the same 1-hour lookback window. Once that
    alert is acknowledged (`acknowledged_at` set), a still-ongoing spike
    raises a new one on the next run.
- **Verified**: `tests/integration/system-alerts-spike-check.test.ts` proves
  the detection fires on a synthetic 21-error spike, does not false-positive
  on 5 errors (normal volume), ignores errors older than the 1-hour window,
  deduplicates against an unacknowledged alert, and re-fires once that alert
  is acknowledged — all against real Postgres, not a mock. Also proves the
  RLS: an admin can read `system_alerts`, a non-admin cannot, and nobody can
  insert into it directly through the API.

## What this does NOT cover

Read this list as the actual current state, not a to-do list to quietly
assume is handled:

- **No notification of any kind.** Nothing emails, pages, Slacks, or
  pushes anyone when a `system_alerts` row is written. The only way to see
  one today is to query the table directly (dashboard SQL editor, or a
  future admin UI). This was deliberate — there's no notification channel
  wired up yet, and picking one (email? Slack webhook? SMS?) and
  provisioning its credentials is a product decision for the owner, not
  something to invent in this pass.
- **No `acknowledged_at` write path.** The column exists; nothing in the
  app sets it yet. Acknowledging an alert today means an admin manually
  running an `UPDATE` in the SQL editor.
- **No uptime/liveness check.** This only looks at `client_errors` volume.
  If the app or its Supabase project goes down entirely, there is no
  client-side error to spike on and nothing here would notice — that needs
  an external uptime checker (e.g. a third-party pinger, or a scheduled
  health-check function hitting the site from outside), not built here.
  Nothing external is called from this migration on the owner's behalf.
- **No server-side/database error monitoring.** This only watches
  `client_errors` (browser-side `window.onerror`/logged errors). A failing
  RPC, a Postgres error, a slow query, disk/connection exhaustion — none of
  that is watched. Supabase's own dashboard (Logs, Advisors) is the only
  current visibility into that, same as before this change.
- **No "money-critical path" tagging.** The task that produced this
  document asked for alerting on "any error tagged as an obvious
  money-critical path if that's inferable from existing error data."
  `client_errors` has no severity/category/tag column at all — only
  `message`, `stack`, `url`, `user_agent`, `user_id`, `branch_id`,
  `created_at`. Inferring "money-critical" from free-text `message`/`url`
  content would mean fragile string-matching heuristics with no real
  signal behind them. Not implemented. A real version of this would need a
  deliberate error-categorization scheme (e.g. a `severity` or `kind`
  column set at the point an error is logged, distinguishing "a checkout
  RPC failed" from "a font failed to preload") added to `client_errors`
  itself first — worth a dedicated pass, not a guess folded into this one.

## Concrete next steps, once the owner picks a notification channel

In rough order of how much they'd each cost to build:

1. **A Supabase Edge Function triggered by a new `system_alerts` row**
   (Database Webhook on `INSERT`), calling whatever endpoint the chosen
   channel needs (a Slack incoming webhook URL, a transactional email API,
   etc.). This is the natural next step — `system_alerts` already exists
   as the trigger source, nothing about it needs to change.
2. **A minimal admin UI** (list of unacknowledged alerts + an "acknowledge"
   button) — needs a real write path for `acknowledged_at` (a small RPC or
   a scoped RLS UPDATE policy, similar to the `A-7` column-lock pattern
   already used elsewhere in this schema) plus, obviously, actual UI code —
   out of scope for this backend-only pass.
3. **A real uptime check**, independent of `client_errors` entirely — either
   a third-party pinger against the production URL, or a second `pg_cron`
   job that calls out to the site/API on a schedule and alerts on failure
   (needs `pg_net` or similar to make an HTTP call from Postgres, not
   currently installed).
4. **Server-side error visibility** — decide whether that means periodically
   scraping Supabase's own logs/advisors into `system_alerts` too, or
   leaving server-side errors to the Supabase dashboard permanently and
   scoping `system_alerts` to client-side-only by design. Not decided here.
5. **A real `severity`/`kind` column on `client_errors`** (or a
   money-critical-path tag set at the logging call site in
   `src/lib/errorLogging.ts`), if "alert louder/faster on checkout failures
   specifically" turns out to matter more than the generic volume spike
   check once there's real usage to observe.
