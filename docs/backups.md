# Backups and restore procedure

Status: investigated 2026-09-24. **No restore has ever been tested against
production** — this document explains why, what was actually verified, and
what to do once the plan question below is resolved. Do not read the
presence of this document as "backups are handled."

## What was actually checked

`supabase/config.toml` has no backup-related settings — backup schedule,
retention, and PITR are project/plan-level settings in the Supabase
dashboard, not something version-controlled in this repo.

This session had read-only access to the Supabase Management API (via the
`Supabase` MCP tools) and used it to check the production project's plan —
no destructive or write call was made:

- `list_projects` → the production project is `villcan`
  (ref `vjgdtxryudoscumwsjhs`, org `jhmbbnxjfvdbnifglizy`, region
  `sa-east-1`, Postgres 17, status `ACTIVE_HEALTHY`).
- `get_organization` on that org → **`"plan": "free", "tier": "tier_free"`**.

## The finding: production has zero automated backup coverage

Per Supabase's own plan documentation (public, not project-specific —
worth re-confirming on [supabase.com/pricing](https://supabase.com/pricing)
before acting, since plans/limits change):

| Plan | Automated daily backups | Point-in-Time Recovery (PITR) |
|------|--------------------------|-------------------------------|
| **Free** (villcan is on this plan) | **None** | Not available |
| Pro ($25/mo base) | Daily, 7-day retention | Paid add-on |
| Team / Enterprise | Daily, longer retention | Available, finer RPO |

**Villcan's production database currently has no backup of any kind.** If
the database were lost, corrupted, or a bad migration/manual change
destroyed data, there is nothing on Supabase's side to restore from. This
is a materially worse situation than "backups exist but are unverified" —
there is no backup to verify. Free-tier projects are also auto-paused
after a week of inactivity, which is a separate (lower-severity, easily
fixed by logging into the dashboard) risk, not covered further here.

This closes the "not verified" framing in the audit's Current status entry
with a concrete answer: it was never verified because there was never
anything to verify. See the updated entry in
`odd/tasks/villcan-audit.md`.

## Why no restore was tested

1. There is nothing to restore *from* on the current (Free) plan — the
   dashboard's backup/restore UI has no snapshots listed for a Free
   project.
2. Even after upgrading to a plan with backups, this session's Supabase
   access is scoped to the Management API tools available here (project
   metadata, SQL execution, migrations, advisors). Actually exercising a
   restore is a dashboard action (or a Management API call that reverts
   the live database in place) that mutates production irreversibly for
   the window it takes to restore — not something to do unprompted or
   without the owner watching. **This was not attempted, and this document
   does not claim it was.**
3. Villcan is pre-launch (no live client, no real customer data yet per
   the audit's History section), which is exactly the right time to fix
   the plan gap and rehearse a restore once — before there is real data
   whose loss would matter.

## Recommendation (before onboarding the first real client)

1. **Upgrade the production project to at least the Pro plan** before any
   real client's data lives in it. This is a plan/billing decision for the
   owner, not something this session can do.
2. Once upgraded, **enable and confirm daily backups are running**
   (Dashboard → Database → Backups) and consider the PITR add-on if the
   acceptable data-loss window (RPO) needs to be smaller than "up to 24h".
3. **Rehearse one real restore** on a non-production branch/project once
   backups exist (see procedure below), so the first real restore isn't
   also the first time anyone has done one.
4. Until the plan is upgraded, as a low-effort interim mitigation, take
   manual logical backups periodically:
   ```bash
   npx supabase link --project-ref vjgdtxryudoscumwsjhs
   npx supabase db dump --linked -f backup-$(date +%Y%m%d).sql
   ```
   This requires a Supabase access token (`supabase login` first) and is
   read-only against production — safe to run, but it's a manual habit,
   not a substitute for automated backups, and was not itself run as part
   of this task (no access token available in this session — see
   `## What was not possible` below).

## Restore procedure (once backups exist — Pro plan or above)

This is the standard Supabase-documented procedure, written out for this
project. **Not yet tested against this project** — treat step timings and
exact UI labels as approximate until someone runs it for real.

### A. Restoring from a daily backup (dashboard)

1. Log into the Supabase dashboard → the `villcan` project → **Database →
   Backups**.
2. Pick the backup snapshot to restore (daily backups, 7-day retention on
   Pro). Note the timestamp — everything written after it will be lost.
3. Click **Restore**. Supabase provisions a new database from that
   snapshot and switches the project to it. This is **destructive**: it
   replaces the live database. The project is unavailable for the
   duration of the restore.
4. After the restore completes, verify before declaring it done:
   - `npx supabase migration list --linked` — confirm the migration
     history matches what's expected as of the restored point (a restore
     that lands between two migrations needs the newer ones re-applied
     via `supabase db push`).
   - Spot-check a few tables (`branches`, `orders`, `movements`) for
     expected row counts / most recent timestamps.
   - Run `npm run test:integration` against a branch pointed at the
     restored project if there's any doubt about RLS/RPC integrity.
5. Communicate the data-loss window to the owner (everything written
   between the backup timestamp and the restore is gone) so they can
   manually re-enter anything critical that happened in that window.

### B. Restoring to a point in time (PITR, if enabled)

1. Dashboard → **Database → Backups → Point in Time Recovery**.
2. Pick the exact timestamp to restore to (much finer-grained than a daily
   snapshot — this is the main reason to pay for the add-on).
3. Same destructive-replace behavior and same post-restore verification
   as section A.

### C. Restoring from a manual `supabase db dump` (interim mitigation, any plan)

If only a manual logical dump exists (see the interim mitigation above),
restoring means replaying it into a fresh/emptied database, not an
in-place Supabase-managed restore:

```bash
# Against a NEW project or a deliberately emptied one -- never against
# a database you still need the current contents of.
psql "$DATABASE_URL" -f backup-YYYYMMDD.sql
```

Then re-apply any migrations newer than the dump's timestamp with
`supabase db push`, and run the same verification steps as section A.4.

## What was not possible in this session

- **No Supabase access token was available** (`supabase login` / CLI auth,
  `SUPABASE_ACCESS_TOKEN`), so nothing beyond the read-only Management API
  calls listed above (`list_projects`, `get_organization`) was run against
  the real production project, and no manual dump was taken as part of
  this task.
- **No restore was performed or simulated against production**, for the
  reasons in the section above. Nothing in this document should be read
  as "verified working" for the restore procedures — they are the
  documented, standard Supabase procedure, written out for this project's
  specifics, not something this session has exercised end to end.
- If the owner wants an actual rehearsed restore, that needs: (1) the plan
  upgraded first (there's nothing to restore from otherwise), and (2) a
  session with real dashboard/CLI access and explicit authorization to run
  a destructive restore, ideally against a branch/duplicate project rather
  than production directly.
