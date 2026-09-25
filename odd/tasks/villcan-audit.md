# Villcan audit and hardening backlog

## Maintenance protocol (READ FIRST — binding on me, every session, starting 2026-09-23)

Why this section exists: on 2026-09-23 I answered "what's still pending" from a compacted conversation summary instead of re-reading this file, and gave a materially wrong answer — I claimed several security/order-state-machine items were open when the file itself already showed them closed with real commit hashes. The rule below exists specifically to stop that from happening again.

1. **This file has two parts, and only one of them is authoritative for "what's pending now."** `## Current status` (right below this section) is the single source of truth for open work. Everything under `## History` is an append-only narrative log — evidence, reasoning, dates, commit hashes — useful for "why/how was this decided," never authoritative for "is this still open."
2. **Before answering any question about what's done/pending/left, re-read `## Current status` fresh in this session.** Never answer from conversation memory, a compacted summary, or "I remember fixing that" — those are exactly what caused the 2026-09-23 mistake. If in doubt, `grep`/read this file before speaking.
3. **One item, one place.** When something gets resolved: edit its line in `## Current status` in place (check it off or delete the line), AND append the narrative/evidence to `## History`. Never just append a "RESOLVED" note somewhere in History while leaving the original line unchecked elsewhere — that's the exact contradiction that caused the confusion (T-01-style items sitting unchecked right next to a "Phase X — ALL DONE" note about the same ID).
4. **Keep `## Current status` short.** Checklist/table only, grouped by area, one line per item, each line ending in its ID so it's greppable against History. No narrative there — narrative belongs in History, linked by ID.
5. **New findings go into `## Current status` immediately**, even mid-session, even before they're triaged into a severity table — a real gap sitting only in chat/agent output and not in this file does not exist for the next session.
6. **History is genuinely append-only.** Do not edit or delete past History entries to "clean them up" — if something in History turns out to have been wrong (like a false-positive finding), append a correction note pointing back at it; don't rewrite it silently.

## Current status (reconciled 2026-09-25 — read this, not History, for "what's left")

Legend: unchecked = open, not started or not finished. Each ID is searchable in `## History` for full evidence/reasoning.

### Data access layer — round 2 CLOSED 2026-09-23
8 domains migrated: contacts (`a77d402`), services (`4397b76`), closings (`52f7a7e`), reports (`0aaf800`), settings/branches (`6ed4e69`), settings/general (`562c04e`), settings/users (`23158d9`), settings/modules (`daf6e20`). Each commit ran its own clean build + test file before landing. Independently re-verified after all 8: clean `npm run build`, full suite **562/562**. Pushed to production.

- [ ] **Remaining inline `createClient()` calls found after the sweep, not part of this round's scope, don't silently expand without checking first:** `src/contexts/BranchContext.tsx`, `src/components/MovementDetailSheet.tsx`, `src/app/(app)/page.tsx` (home/dashboard), `src/app/(app)/errors/page.tsx`. Auth (`AuthGuard.tsx`, `AuthButton.tsx`, set-password/forgot-password pages) and storefront (`tienda/[slug]/page.tsx`) remain correctly untouched by design.

### Security / auth — open
- [x] **CLOSED 2026-09-25 (owner confirmed in dashboard)** — A-6: production origin (`https://villcan.vercel.app` — confirmed via Vercel this is the only domain, no custom domain configured) verified present in the redirect allow-list.

*(A-11/A-12/A-13/A-14/H-2 all CLOSED 2026-09-23 — `ed37d0d`, `3031c17` — see History.)*

### Money / orders — open (leftovers from the Phase 5 "swiss watch" pass; the HIGH items from that pass are already closed, see History)
- [x] **CLOSED 2026-09-25** (`design/visual-refresh`, `fcba496`; **in `main`** since `016b773`) — SW-O4: `edit_confirmed_order_delivery_fee` wired for real into `OrderViewPanel.tsx`/`src/lib/data/orders.ts` — the "Próximamente" placeholder is gone. **Note:** the branch's own task doc (`odd/tasks/backoffice-visual-refresh.md`) still had this task's checkbox unchecked when found — code-verified directly (grepped the RPC name into the diff, confirmed no placeholder text remains) rather than trusting the doc.
- [x] **CLOSED 2026-09-25** (`design/visual-refresh`, `fcba496`; **in `main`** since `016b773`) — O-8: `cancel_order` wired the same way, same commit, same caveat (branch's own checkbox drift, code-verified).
- [x] **CLOSED 2026-09-25** (`backend/audit-tickets-batch-2`, `aab7f7d`, merged to `main` `913dff2`; **applied to production** 2026-09-25, see the deployment History entry below) — M-4: real `movements.expense_source` column added (nullable, scoped to `type='gasto'` by CHECK), backfilled from the existing `comment` tag, `cashBalance.ts`'s `isBankTagged` now reads the column first with comment-tag fallback for any row where it's still null. Production backfill verified directly: 4 real `gasto` rows, all classified (1 `cta_bancaria`, 3 `caja`), 0 left null. **Not fully done end-to-end**: `MovementForm.tsx` still isn't wired to WRITE the new column — every row it inserts still only gets classified via the comment-tag fallback until that follow-up lands. `reports/page.tsx` also still reads comment-only — harmless today since `comment` keeps getting the tag from the unchanged UI, but **flagged as a real gotcha for whoever does the UI wiring**: if that pass stops writing the comment tag once it starts writing the column, `reports.ts`/`reports/page.tsx` must be updated in the same pass or Reports' balance will silently go stale.
- [x] **CLOSED 2026-09-25** (`design/visual-refresh`, round 6, `59b0f94`; **in `main`** since `016b773`) — M-8: Reportes' "Por Método" rows link to `/movements?range=&method=`, "Servicios" rows link to `/orders?range=` (date-scoped only, not per-service — an order can contain several services), both reusing Movements/Orders' own filter vocabulary rather than inventing new UI (Orders gained a real date-range filter it didn't have before, Movements gained a method sub-filter with a removable chip). "Exportar CSV" button added to Reports (client-side, no backend call). **Pre-merge review fix (`ad36633`):** both pages only seeded their filter from `useSearchParams()` at first mount (a lazy `useState` initializer) — a second drill-down click while the page stayed mounted (no remount on a same-route, params-only navigation) silently kept the old filter. Fixed with a `useEffect` re-deriving the filter on every `searchParams` change, RED→GREEN verified.
- [x] **CLOSED 2026-09-25** (`design/visual-refresh`, round 6, `f5902fa`; **in `main`** since `016b773`) — SW-K1/K2: dashboard's Balance Global/Efectivo is a running total (since last cash closing, or all-time) and genuinely can't be scoped to the Hoy/Semana/Mes tabs the way `activity` is without answering a different, misleading question ("how much moved this week" ≠ "how much is in the drawer right now"). Resolved by making that explicit instead of faking a range-scoped number: a note under the headline balance ("Total acumulado, no varía por período") and a "Detalle del período" label above the tabs once expanded.
- [x] **CLOSED 2026-09-25** (`design/visual-refresh`, round 6, `f5902fa`; **in `main`** since `016b773`) — SW-K3: negative-amount red/green coding added to dashboard's Balance Global/Efectivo (had none) and Reports' Balance Neto (was ink-tone-only), matching `.movement-amount--positive/--negative`'s existing `#10b981`/`#f43f5e` pair. **Pre-merge review fix (`f032d4a`):** Reports' own `.kpi-badge.up`/`.down` (the ingresosPct ↑/↓ badge) had been silently dropped to a single flat color by the same CSS rewrite that added this K3 fix, undoing the exact distinction K3 was adding elsewhere on the same page. Restored using the same `#10b981`/`#f43f5e` pair.
- [x] **CLOSED 2026-09-25** (`design/visual-refresh`, round 6, `f5902fa`; **in `main`** since `016b773`) — SW-K4: added a "Facturado / Comisión" column-label row above Liquidación's breakdown (only when `commissions_enabled` and there are rows) — the commission figure had no label at all, easy to misread as a second revenue number.
- [x] **CLOSED 2026-09-25** (`design/visual-refresh`, round 6, `f5902fa`; **in `main`** since `016b773`) — SW-K5: dashboard gained a "last updated" relative-time label + manual refresh button in the header (no poll/realtime subscription exists on that page). Reports still has no equivalent — the task's own scope note said "dashboard/Reports" but Reports already re-fetches on every filter change a user makes, which is a materially different staleness story than the dashboard's fully passive load; judged not worth a matching control there without a real report of it mattering.
- [x] **CLOSED 2026-09-25** (`design/visual-refresh`, `6ba02e1`; **in `main`** since `016b773`) — SW-C4: real `/closings/[id]` detail route added (not a placeholder — reused the already-fetched list data), shared per-method breakdown extracted into `ClosingMethodBreakdown.tsx`. A CRITICAL gap was caught by native review mid-task (the fetch/error-handling effect, including an unchecked type cast, shipped with zero test coverage and an unverified populated state) and fixed same-session with 4 new tests (`8864220`) — 9/9 closings tests green.
- [x] **CLOSED 2026-09-25** (`design/visual-refresh`, round 6, `134349d`; **in `main`** since `016b773`) — SW-M5: investigated, closed with **no code change** — the original finding's premise didn't hold. `PaymentStep.tsx` (MovementForm's Venta flow) lets the user *choose* a payment method before an order exists; `OrderPaymentSheet.tsx` *confirms* a payment for an order whose method is already fixed — different steps of one order lifecycle, not duplicate implementations of the same problem. The one real structural duplicate (an icon+label+selected-state button grid) is between `PaymentStep.tsx` and `DetailsStep.tsx` (the gasto Caja/Cta Bancaria "fuente" picker, already flagged as copy-pasted in a QA-5 code comment) — and `DetailsStep.tsx` is exactly the file this round's own instructions protected as adjacent to M-4. Asked the owner directly rather than guess at a workaround; owner chose to close with the finding documented. **If this is ever revisited, scope it as `PaymentStep.tsx` + `DetailsStep.tsx`, not `PaymentStep.tsx` + `OrderPaymentSheet.tsx` as originally written.**
- [ ] **P-1/P-2/P-3** — `delivery_tiers` not applied at order time (fee always "a confirmar"); WhatsApp handoff is a manual `wa.me` tap, no API/webhook; rate limiting is coarse (count-only, no captcha). Deprioritized — low order volume pre-launch.

### Structure / hygiene — open
- [ ] **Q-2** — `GastronomyTheme.tsx`/`GastronomyTemplate.tsx` (~1148 lines) and `reports/page.tsx` (720 lines) still not split; deliberately deferred (visual regression risk without a browser check; Reports is slated to be rebuilt, not restructured).
- [ ] **S-3** — no real PWA offline support; no service worker exists anywhere despite an installable manifest.
- [x] **CLOSED 2026-09-25** (`design/visual-refresh`, `6ba02e1`; **in `main`** since `016b773`) — S-7: real branch/date/text filters added over the already-fetched error list, client-side only, no new query.
- [ ] **Touch targets — storefront** — the 2026-09-23 pass explicitly excluded `src/components/storefront/**` and `/tienda/[slug]` (owner hasn't decided the storefront's visual direction yet). Revisit once that's decided.

### Never addressed at all — real blind spot, not tracked anywhere until now
- [ ] **Backups** — investigated 2026-09-24/25 (`b2ad713`, `docs/backups.md`): production (`villcan`, ref `vjgdtxryudoscumwsjhs`) is confirmed on the Supabase **Free plan**, which has **zero automated backups and no PITR** — there is currently nothing to restore from at all. **Owner decision 2026-09-25: staying on Free for now** — known, accepted risk, not forgotten. Also blocks `auth_leaked_password_protection` below (same plan gate). Revisit before onboarding any real client. See History and `docs/backups.md` for the full finding and the restore procedure to rehearse once backups exist.
- [ ] **Production monitoring/alerting** — minimal scaffold added 2026-09-25 (`backend/audit-tickets-batch-2`, `7e7d1ab`, `docs/monitoring.md`); **applied to production** 2026-09-25, see the deployment History entry below: a `pg_cron` job flags a `client_errors` volume spike (>20/hour/branch) into a new `system_alerts` table. Verified live in production: `cron.job` shows `client-error-spike-check` registered, `active=true`, schedule `*/15 * * * *`. **Still genuinely open**: no notification channel exists (nothing emails/Slacks/pages anyone — `system_alerts` rows are only visible via direct SQL today), no `acknowledged_at` write path, no uptime check, no server-side error monitoring, no money-critical-path tagging (client_errors has no severity/category column to infer that from). See `docs/monitoring.md`'s "What this does NOT cover" section for the full honest list and concrete next steps.

### Contact search still broken for normalized phones (2026-09-24) — CLOSED
Owner reported live: "el buscador de contactos aun no funciona." Verified before acting (house rule) — real bug, not a repeat of the already-fixed gap. Root cause: yesterday's two phone fixes conflicted — `ContactForm.tsx` normalizes on save (strips the leading 0), but `searchContacts`/`listContacts` ILIKE'd the raw typed query, which for a normalized stored value like `595994641522` contains no literal `0` at all. Confirmed against real production data: contact "manuel" (`595994641522`) was unfindable by searching `0994641522`, the natural way anyone would type it. Fixed in `2bd9f69` — an extra `phone.ilike` OR-term (leading 0 stripped) added to both `searchContacts` and `listContacts`. RED→GREEN, 580/580, re-verified live: the same query now finds "manuel".

### RDD (native review) of today's security batch (2026-09-24) — CLOSED
Ran `gentle-ai review` for real on the security-hardening commits (`6b97f49`..`e9c8bd5`, 23 files, 753 lines — the full session's accumulated diff was too large, `lens_context_budget_exceeded`, sliced to this candidate). Risk `high`, 4 lenses (risk/resilience/readability/reliability), **approved**. 12 raw findings, all advisory/non-blocking, deduplicated to 2 real corroborated-by-3-lenses issues + 5 single-lens reliability/readability items. All fixed in `66a3e18`: client_errors constraints made genuinely idempotent + `NOT VALID` (were validating every existing row and would fail on re-run), `getPendingOrdersCount` no longer conflates a failed query with "zero pending orders" (returns `null`, logs, distinct UI message), `/login`'s unhandled promise rejection on `getUser()` failure, O-6/A-7 integration-test gaps (missing setup assertions, a misleadingly-named test), AuthGuard's magic retry-delay number. One cosmetic finding (a stale comment in an already-applied migration) deliberately left alone. Authority acknowledged and burned (`review-6470625f28b41495`).

### Supabase security skill + `db advisors` sweep (2026-09-23) — new findings
Installed `supabase/agent-skills` (security checklist) and `supabase-postgres-best-practices`. Applying the checklist against real migrations + a live `db advisors` run surfaced items not previously in this document.

- [x] **CLOSED 2026-09-23** (`54af46c`) — `update_order`/`create_branch_with_admin` still carried the implicit PUBLIC EXECUTE grant Postgres adds by default; `complete_order_payment`'s own migration revoked from PUBLIC but never from `anon` specifically (Supabase grants anon EXECUTE separately by default), so **anon could call it directly in production**. None were exploitable (each checks `auth.uid()` against `user_branch_access` and rejects a null caller), but this closes the gap properly instead of relying on the internal check alone. Verified live via `has_function_privilege` before/after.
- [x] **CLOSED 2026-09-23** (`e796ebb`) — `function_search_path_mutable`: `format_gs`, `_guard_order_financial_fields`, `_safe_branch_uuid`, `_prevent_overlapping_closing` confirmed `SECURITY INVOKER` (not DEFINER — lower severity), pinned via `ALTER FUNCTION ... SET search_path`.
- [x] **CLOSED 2026-09-23** (`e796ebb`) — `anon_security_definer_function_executable`: `compute_branch_slug`/`fn_order_completed_to_movement`/`prevent_last_admin_removal`/`recompute_all_branch_slugs` are trigger functions (Postgres refuses direct calls anyway) and `_find_or_create_contact` is an internal-only helper — all 5 revoked from `PUBLIC` (not just anon/authenticated — first attempt at revoking from the roles directly was silently a no-op, see commit message). `_latest_closing_at`'s anon grant closed too, `authenticated` kept (used inside an RLS policy). `has_branch_access`/`is_branch_admin`/`is_admin_anywhere`/`create_storefront_order` deliberately left untouched — legitimately need anon/authenticated access. Verified via local integration suite (32/32, both before and after fixing the PUBLIC-grant gap) and `has_function_privilege` against production.
- [x] **CLOSED 2026-09-24/25** (`ce05faa`) — `extension_in_public`: `citext` moved from `public` to a dedicated `extensions` schema (`alter extension citext set schema extensions`). Checked every reference first (the risk that blocked it before): used only as a column type (`profiles.email`, `branches.slug`), no function/query anywhere calls `citext(...)`/casts `::citext` by name. Verified locally: full migration set applies clean, integration suite 46/46 including `create_storefront_order`'s `where slug = p_slug` lookup (citext) inside a `SECURITY DEFINER` function with a restricted `search_path`, under both sequential and concurrent access.
- [ ] **`auth_leaked_password_protection`** (advisor WARN) — **blocked, not just pending**: this toggle is a Supabase **Pro-plan-and-above** feature (confirmed via docs, `supabase.com/docs/guides/auth/password-security`), invisible on Free. Owner confirmed 2026-09-25 staying on Free for now (same decision as the Backups item below) — revisit together if/when the plan is upgraded.

### Explicitly deferred by owner decision (not forgotten, don't re-raise without new info)
- Storefront visual redesign — separate track, owner deciding design direction (Figma/Pinterest reference) in another session.
- Kapso (WhatsApp AI bot) integration — Package 3, not started.

### Fully closed — verified via commit hashes in History, do not re-open without new evidence
Security Phase 1 (A-1/A-3/A-4/O-1/O-2/O-3/M-1/M-2, all deployed to production 2026-09-22), Phase 2 reliability (M-3 unified balance formula, O-4 atomic payment RPC, C-1 contact-aggregate cap, A-5/A-8 invite/forgot-password flow), Phase 3 hygiene (H-1 CSV/py untracked, S-1/S-4 storage activated+branch-scoped, dead toggles removed, `mandatory_arqueo_enabled` copy fixed), Phase 5 swiss-watch HIGH items (SW-O1/O2/O3/O5/O6/O9/O10, SW-M1/M2/M3/M4/M7, SW-C1/C2/C3, GuaraniesInput everywhere), the full QA-1 through QA-8 backlog, contact search-by-phone, phone normalization (5 independent occurrences, all fixed), the catálogo edit-form unification (`9add8f8`), the 16-item touch-target pass (`790209d`), the WhatsApp-message dead-code unification (Q-3), the two file splits (`MovementForm.tsx`, `orders/[id]/page.tsx`), `ClosingForm.tsx` dead-code removal (S-6), the stray PUBLIC/anon EXECUTE grants on 3 SECURITY DEFINER RPCs (`54af46c`), **T-01** (see correction note below — the two-user RLS/RPC test already existed, this status was wrong), **A-7** profiles email lockdown (`0d3804a`), **A-9** AuthGuard retry-on-network-error (`d568887`), **A-10** invite-route input validation (`672676e`), the `function_search_path_mutable` + remaining `anon_security_definer_function_executable` advisor findings (`e796ebb`), **A-11/A-12/A-13/A-14** LOW-severity auth cleanup (`ed37d0d`), **H-2** (`3031c17`), **O-6** negative delivery fee (`df53493`), **M-6** commission rounding (`e5c07ba`), **S-5** pending-orders warning before closing (`a0b1fc7`), and **O-7/P-4** per-branch order numbering (`cbfb060`).

### Package 2 (backoffice) completion, backend-only track (2026-09-24)
**Superseded 2026-09-25, see the reconciliation History entry below for the full story.** This section originally described a strict UI-vs-backend split (owner redesigning the backoffice in `design/visual-refresh`, this thread staying backend-only to avoid colliding with it). That split no longer holds: the owner explicitly authorized this session to also do UI work, and every item once deferred here (SW-O4/O-8/M-4/M-8/SW-K1-K5/SW-C4/SW-M5) is now closed — see each one's own line in the sections above. **`design/visual-refresh` merged into `main` (`016b773`) later the same day — `main` and the redesign are the same codebase again, see the unification History entry below.** Backend-only queue that was done under the original split, for the record: O-7/P-4 (`cbfb060`), O-5 (`aea3c20`), SW-O4/O-8 RPC scaffolding (`a221389`).

**T-01 correction, 2026-09-23:** this document previously said "no automated two-user integration test proves A-1/A-3/A-4" and listed T-01 as open. That was wrong — `tests/integration/rls-authorization.test.ts` already covers exactly this (items 1, 3, 4: profiles branch-scoping, self-admin-escalation blocked, direct branch insert blocked, `create_branch_with_admin` RPC atomicity) and has since 2026-09-22. The error came from trusting an old History note instead of checking whether the file already existed. **Verified today by actually running it**, not just reading it: local Supabase stack started (`npx supabase start`), full suite run with `npm run test:integration` → **29/29 passed** against real Postgres RLS, including the A-1/A-3/A-4 cases. T-01 closed for real as of this run.

### Backend-only batch, branch `backend/audit-tickets-batch-1` (2026-09-24/25)

Four items from Current status, worked one commit each, off `main` at `92fe0d2`. Full local verification throughout: `npx supabase start` (Docker daemon needed a manual `dockerd` start in this container — `service docker start` fails on `ulimit -Hn`, not permitted in this sandbox; running `dockerd` directly in the background works), `npm run test:integration` against real Postgres, `npm run test`, and `rm -f tsconfig.tsbuildinfo && rm -rf .next && npm run build` per the established standard. Not merged into `main` — left for the owner to review, per instruction.

1. **SW-O4/O-8 RPC scaffolding — `a221389`.** Two new SECURITY DEFINER RPCs, backend-only, nothing calls them yet:
   - `edit_confirmed_order_delivery_fee(p_order_id, p_delivery_fee)` — edits the fee of an already-**confirmed** order (VC409 if still pending or already completed/cancelled), reuses the O-6 non-negative-fee guard (VC400), recomputes `total` from the fee delta, uses the existing `app.bypass_order_guard` pattern to pass the O-1/M-2 financial-fields trigger.
   - `cancel_order(p_order_id, p_reason)` — requires a non-blank reason (VC400 otherwise), rejects an order already completed/cancelled (VC409) — relies on the existing O-1/M-2 status-freeze trigger to make re-cancelling/un-cancelling impossible through this or any path, doesn't duplicate that check beyond raising an earlier, clearer error. Adds `orders.cancellation_reason`/`cancelled_at`/`cancelled_by` (nullable, no `NOT NULL`/`CHECK` tying them to `status='cancelled'` — that would also apply to the pre-existing direct-`.update()` cancel path, which this backend-only change must not affect).
   - RED→GREEN against real local Postgres: 10 new tests (happy path / wrong state / negative fee / missing-blank reason / unauthorized caller, for both RPCs), appended to `tests/integration/rls-authorization.test.ts` matching its existing per-item `describe` style. Full integration suite 46/46 after.
   - **Update 2026-09-25 (see the reconciliation History entry below):** both RPCs are now wired for real in `design/visual-refresh` (`fcba496`), not yet merged to `main`. Noted here rather than edited into a fiction of having been true at the time this entry was written.

2. **S-9 Playwright e2e — `d023a29`.** Three new spec files (`tests/e2e/closings.spec.ts`, `errors.spec.ts`, `storage.spec.ts`), matching the existing files' style (skip-guards, `data-testid` where available, Spanish test names). No UI code touched. Run against a local Supabase stack + local `npm run dev` (not production) — seeded a branch/admin/service/completed-order/client_error row via the service-role client for fixtures, same pattern as the integration suite's `createTestUser`/`seedService`. `storage.spec.ts` exercises a real end-to-end Storage round trip (upload → public URL → `<img>` preview → the URL actually fetched and confirmed `200`), not a mock. `closings.spec.ts` deliberately stops short of completing the hold-to-confirm step (a real, irreversible write), matching the caution the 2026-09-22 QA sweep already established for this exact flow. 18/18 new tests pass; 2 pre-existing failures elsewhere in the suite (`movements.spec.ts`, `settings.spec.ts`) are unrelated and were already present before this branch existed.
   - **Real (minor) finding, documented not fixed, per instruction:** `ClosingWizard`'s `/closings/new` page and `/errors` both gate their content on `currentBranch`/`isAdminAnywhere` without waiting for `BranchContext`'s async load to settle, unlike `AuthGuard` (which explicitly shows a spinner until its own session check resolves — see `AuthGuard.tsx`). Result: a legitimate admin can see a fleeting "Acceso restringido" flash before the real content renders. Confirmed via repeated local runs (a 2-3s fixed wait reliably avoids the race; an immediate check reliably hits it) — this is very likely the same root cause behind the two pre-existing failing tests above (`movements.spec.ts`'s "redirige a /login" and `settings.spec.ts`'s "muestra el formulario" both race the same kind of async-context-not-ready window, though those two check different, currently-unresolved symptoms and weren't investigated further here since they predate this branch). Not fixed — this session's scope is backend-only, and both are page files (`closings/new/page.tsx`, `errors/page.tsx`). Worth a real UI fix (gate the render on `initialized`/`branches` loading the way `AuthGuard` does) whenever backoffice UI work is back in scope.

3. **`extension_in_public` — `ce05faa`.** Closed, see the line in Current status above for the detail. The risk that blocked this before (moving an extension already in use, per the earlier note in the "Supabase security skill" section) was checked directly: grepped every migration for `citext(...)`/`::citext` (none outside the two column-type declarations), then verified empirically rather than just by inspection — reset the full local migration set with the move applied, ran the full integration suite (46/46, including the citext-typed `branches.slug` equality lookup inside a `SECURITY DEFINER` function with `search_path = public, pg_temp`, both sequentially and under the O-5 concurrent-call test), and spot-checked `slug = '...'` directly via `psql` post-move. No regression.

4. **Backups — `b2ad713`.** See the line in Current status above and `docs/backups.md` for the full writeup. Checked read-only via the `Supabase` MCP tools available in this session (`list_projects`, `get_organization` — no write/destructive call made): production org `jhmbbnxjfvdbnifglizy` is on **`tier_free`**. Free-tier Supabase projects have no automated backups and no PITR at all — this is a harder blocker than the original "never verified" framing suggested, since there is currently nothing to restore from. No restore was attempted (nothing to restore from pre-upgrade; a real restore is destructive against production and out of scope to run unprompted; no Supabase access token was available in this session for even a manual `pg_dump`). `docs/backups.md` has the standard restore procedure written out for this project, explicitly marked as not yet exercised, plus the recommendation to upgrade to at least Pro before onboarding any real client.

**Verification after all 4 commits:** `npm run test:integration` → 46/46. `npm run test` → 577/580 (same 3 pre-existing failures as on `main` before this branch — `OrderCard.test.tsx` ×2, `ServiceCard.test.tsx` ×1, all a currency-formatting/locale assertion issue unrelated to any change here, confirmed present via `git stash` against `main`). `npx playwright test` (local stack + local dev server) → 20 passed / 2 pre-existing-and-unrelated failed / 7 skipped-as-designed. Clean `rm -f tsconfig.tsbuildinfo && rm -rf .next && npm run build`. `tsc --noEmit` has a pre-existing set of type errors in test files (`ClosingWizard.test.tsx`, `MovementForm.test.tsx`, `OrderDetailSheet.test.tsx`, `services.test.ts`) confirmed identical on `main` via `git stash` — not introduced by this branch, and the project's own standard is the build + test suite over bare `tsc --noEmit` for exactly this reason (stale/pre-existing test-file type errors that don't fail the actual build).

**Not done, explicitly out of scope for this batch:** no UI wiring for SW-O4/O-8 (by instruction). A-6/`auth_leaked_password_protection` (owner-dashboard-only, unchanged, still open above). M-4/M-8/SW-K1-K5/SW-C4/SW-M5 (still need UI, on hold for the design branch per the existing note).

**Merged and deployed to production, 2026-09-25 (`be100da` merge, `main`).** Before pushing, `supabase db push --dry-run` failed: remote had 10 migration-history rows with real wall-clock timestamps not present locally at all (e.g. `20260923231953`). Root cause found by querying `supabase_migrations.schema_migrations` directly: a past session pattern of `supabase migration new` (auto timestamp) → push → rename the local file to this repo's round-hour convention before committing, without ever telling Supabase's tracked history about the rename — so the live schema already had 9 of these changes applied, just tracked under different, uncommitted IDs. Verified 1:1 by matching migration `name` values against local filenames (one remote entry, `revoke_anon_execute_complete_order_payment`, was folded into local `20260923000000`'s broader fix). Reconciled via `supabase migration repair --status reverted <10 phantom ids>` then `--status applied <9 local round-hour ids>` — metadata-only, no schema/data touched, confirmed clean via `migration list` after. Only then pushed the 3 genuinely-new migrations; confirmed live via direct SQL query (`cancel_order`/`edit_confirmed_order_delivery_fee` exist as `SECURITY DEFINER`, `citext` in `extensions` schema). **Gotcha for future sessions:** never rename a migration file after it's been pushed to production without also repairing the remote history — this exact drift can silently abort a future `db push` partway through if a renamed file happens to be non-idempotent on its own (as `20260923040000` was, see its own history entry above).

### `design/visual-refresh` closes SW-C4/S-7, adds SW-O4/O-8 UI placeholders, re-scopes M-4 (2026-09-25)

Checked in via that worktree, independently verified from `main`'s session (read the actual diff, re-ran the full local test suite — `588/588` matched what the branch's own task doc reported). Commit `6ba02e1`: (1) `SW-C4` closed for real — a genuine `/closings/[id]` detail route, not a placeholder, plus `ClosingMethodBreakdown.tsx` extracted so list/detail share rendering; a native review mid-task caught a real CRITICAL gap (untested fetch/error effect with an unchecked cast, unverified populated state) which got its own follow-up commit (`8864220`, 4 new tests) before landing. (2) `S-7` closed — real branch/date/text filters over the already-fetched errors list. (3) `SW-O4`/`O-8` got disabled, visually-distinct ("Próximamente") entry points in `OrderViewPanel.tsx`, deliberately not wired to the RPCs that shipped from the backend batch above — both items stay open until an actual wiring pass. (4) `M-4` re-scoped: the branch confirmed `MovementForm.tsx`'s bank/cash control was already a real UI widget all along, the free-text tag was purely a missing-column problem — flips `M-4` from "needs UI" to backend-only.

### Backend-only batch 2, branch `backend/audit-tickets-batch-2` (2026-09-25)

Two items from Current status, worked one commit each, off `main` at `fb487eb` (post batch-1 merge + `design/visual-refresh`'s SW-C4/S-7/M-4-rescope). Same local verification discipline as batch 1: `npx supabase start` (again needed a manual `dockerd` start — `service docker start` still fails on `ulimit -Hn` in this sandbox), `npm run test:integration` against real Postgres, `npm run test`, `rm -f tsconfig.tsbuildinfo && rm -rf .next && npm run build`. Not merged into `main` — left for the owner to review, per instruction.

1. **M-4 — `aab7f7d`.** Traced the actual current implementation first (per instruction) before changing anything: the task description's file/line pointers (`src/lib/data/closings.ts`/`kpis.ts` doing `comment.includes(...)`) were stale — since the M-3 unification, BOTH `src/lib/closings.ts` and `src/lib/kpis.ts` delegate all balance math to one shared pure function, `computeCashBalance` in `src/lib/cashBalance.ts`, whose `isBankTagged` closure is the actual (and only) place the `[Cta Bancaria]` tag gets parsed. Good news: only one function's logic needed to change, not two call sites.
   - New nullable `movements.expense_source` (`'caja' | 'cta_bancaria'`), scoped to `type='gasto'` by a same-row CHECK (`expense_source is null or (type='gasto' and expense_source in (...))`) — a real DB-level guarantee, not just documentation.
   - Idempotent backfill function `_backfill_movements_expense_source()` (service_role-only), run once at migration apply time, classifies every existing `gasto` row from the exact same substring check `isBankTagged` already used (`comment LIKE '%Cta Bancaria%'` → `cta_bancaria`, else → `caja`), without touching `comment`. Exposed as a callable function (not just an inline `UPDATE`) so it's both testable directly and re-runnable later as a maintenance step.
   - `cashBalance.ts`'s `isBankTagged` now checks `expense_source` first, falling back to the comment tag only when the column is null. `expense_source` added as an *optional* field on `CashBalanceMovement`/`KpiMovement` — deliberately optional so `reports/page.tsx` (a page file, out of scope) keeps compiling unchanged and simply keeps using its existing comment-only path; verified via a clean `npm run build` that this doesn't force any page/component edit.
   - RED→GREEN against real local Postgres (temporarily moved the migration file out, reset, confirmed 7/8 new tests failed on "column not found", restored, reset, confirmed all green): 8 new integration tests (`tests/integration/movements-expense-source.test.ts`) — backfill classifies `[Cta Bancaria]`-tagged/`[Caja]`-tagged/untagged rows correctly, never touches non-`gasto` rows, is idempotent (won't clobber an already-set value), the CHECK rejects setting the column on a non-`gasto` row, and balance parity between a backfilled comment-tagged row and a directly column-set row via the real `computeCashBalance` formula. Plus 3 new unit tests in `cashBalance.test.ts` for the fallback logic itself (column wins over a disagreeing comment tag; falls back only when null). Full integration suite **54/54** after. Unit suite **580/583** (3 pre-existing failures, confirmed present on `main` before this branch — the same `OrderCard.test.tsx`×2/`ServiceCard.test.tsx`×1 currency-formatting issue from batch 1, still unrelated and still un-investigated further, out of scope for a backend-only pass).
   - **Real gotcha found and documented, not fixed**: once a future session wires `MovementForm.tsx` to write `expense_source` directly, if that pass also stops writing the `comment` tag (the likely point of the change), `reports/page.tsx`/`reports.ts` — never updated to read the new column — would silently start computing its balance from a permanently-null/absent `comment` tag. Flagged explicitly in both the migration's own comment and the Current status line above so it isn't rediscovered the hard way.

2. **Production monitoring/alerting — `7e7d1ab`.** Checked first (per instruction) whether `pg_cron` had an established pattern anywhere in this project's migrations to match — it did not; grepped the full `supabase/` tree, zero hits. This is a fresh setup, not a pattern being followed.
   - New `public.system_alerts` table (`branch_id`, `kind`, `detail` jsonb, `created_at`, `acknowledged_at` nullable). RLS: admin-only `SELECT` (same shape as `client_errors_select_admin`), deliberately no `INSERT`/`UPDATE` policy for `anon`/`authenticated` — only the cron job (running as its scheduling role, which bypasses RLS) writes rows; proven directly in the integration suite (an authenticated admin's own client cannot `INSERT` into it either).
   - `public._check_client_error_spikes()`, scheduled via `cron.schedule('client-error-spike-check', '*/15 * * * *', ...)`: flags any branch with **more than 20** `client_errors` rows in the trailing 1 hour, writing a `system_alerts` row (`kind='client_error_spike'`, `detail` carries the count/threshold/window). Threshold reasoning documented inline and in `docs/monitoring.md` (pre-launch, near-zero legitimate volume expected, not yet tuned against real traffic since there isn't any). Deduplicates against an already-unacknowledged alert for the same branch within the window, re-fires once that alert is acknowledged — both directions proven in the integration suite.
   - "Money-critical path" tagging (asked for in the task, conditional on being inferable) — checked `client_errors`'s actual columns (`message`/`stack`/`url`/`user_agent`/`user_id`/`branch_id`/`created_at` only, no severity/category) and concluded it is **not** reliably inferable without fragile free-text string-matching. Not implemented; documented as a real, named limitation in `docs/monitoring.md` rather than silently dropped or faked with a heuristic.
   - `docs/monitoring.md`: what's covered, an explicit "What this does NOT cover" section (no notification channel of any kind — `system_alerts` rows are only visible via direct SQL today; no `acknowledged_at` write path; no uptime check; no server-side/DB error monitoring), and concrete prioritized next steps (a Supabase Edge Function on a `system_alerts` INSERT webhook is the natural first one, since the trigger source already exists).
   - RED→GREEN against real local Postgres (same move-file-out/reset/confirm-fail/restore/reset/confirm-pass discipline as item 1): 8 new integration tests (`tests/integration/system-alerts-spike-check.test.ts`) — a synthetic 21-error spike fires exactly one alert with the right `detail`, 5 errors (normal volume) does not false-positive, errors outside the 1-hour window are ignored, a second run while unacknowledged does not duplicate, acknowledging then re-running fires a new one, plus the three RLS cases above. Full integration suite **62/62** after (54 + 8). Also confirmed the job is actually registered and active via a direct `select * from cron.job` (not just that the function logic is correct in isolation).

**Verification after both commits:** `npm run test:integration` → 62/62. `npm run test` → 580/583 (same 3 pre-existing, unrelated failures as batch 1 and as `main` before this branch). Clean `rm -f tsconfig.tsbuildinfo && rm -rf .next && npm run build`. `tsc --noEmit` shows no new errors in any file this branch touched (spot-checked via grep against the file list; the same pre-existing test-file type errors noted in batch 1's history entry are untouched and irrelevant here, same reasoning as there).

**Not done, explicitly out of scope for this batch:** no `MovementForm.tsx` UI wiring for the new `expense_source` column (by instruction — flagged as a real follow-up gotcha above). No notification channel for `system_alerts` (by instruction — no credentials to invent). `SW-O4`/`O-8`/`M-8`/`SW-K1-K5`/`SW-M5`/`A-6`/`auth_leaked_password_protection` untouched, unrelated to this batch's two items.

---

## History (append-only — narrative, evidence, and reasoning; do NOT treat anything here as the current pending list — see `## Current status` above)

Status: **DISCOVERY PHASE. No source change is authorized yet.** The owner wants to keep exploring what is wrong first, then move to execution in an ordered way. Nothing below is checked off because nothing has been implemented.

Created: 2026-09-21. Feature id: `villcan-audit`. Engram mirror topic: `odd/villcan-audit/tasks`.

### Objective

Understand what the Villcan codebase really is, find what is technically wrong (the owner suspects it is largely AI-generated without technical review), and turn the findings into an ordered backlog to execute later.

### Context and decisions so far

- Owner concern: code was generated by AI with no technical background behind it; things work on the surface but hidden technical problems are likely. The owner also reports bad experiences with login/users and doubts that everything user-related works.
- Stage: still in development. **Tatapiriri (a pizzeria branch, Paraguay, `gastronomy` vertical) is a demo, not a live business.** **Confirmed 2026-09-21: there is no client, no deployment and nothing live yet at all** — Villcan is pre-launch. Full freedom to fix the architecture now, no migration of real data or live client needed. No fixed date for the first real client (confirmed 2026-09-21) — timeline is open.
- **Business model (owner-defined, 2026-09-21): NOT a SaaS.** Villcan ships as **separate implementations, one deployment per client business**, sold as three packages:
  1. **Package 1 — Store only.** Public storefront + WhatsApp links, no admin app. The owner still wants a minimal way to add/remove products, which implies *some* lightweight auth (not necessarily the full multi-role system audited below) is needed even in this package.
     **Confirmed 2026-09-21: login is required in Package 1 too** (the branch owner, not Villcan staff, adds/removes products). Same auth system as Packages 2-3, not a separate lighter one — so the A-1/A-3/A-4 auth findings below apply to all three packages, not just 2-3.
  2. **Package 2 — Store + app.** Adds the internal management app (cash register, orders, closings) already built.
  3. **Package 3 — Everything else + Kapso AI bot.** Kapso is a **third-party product to integrate**, not something to build.
  - Deployment model (confirmed 2026-09-21): **one codebase, config-driven per client** (not a per-client fork) — a fix applies once across all deployments. Each client gets their **own Supabase project and own Vercel project/deployment** (confirmed 2026-09-21) — no shared database between businesses.
  - Consequence: single-tenant-per-deployment is the correct model, not a bug to fix. Cross-business isolation inside one shared DB is NOT required, because there is no shared DB between businesses at all.
  - Consequence: the A-1 RLS hole (any authenticated user can self-admin any branch) does NOT need multi-tenant isolation to matter — it still matters **within one client's own deployment**, which can have multiple branches (e.g. Tatapiriri-style setups). Severity stays HIGH/CRITICAL per client deployment, just re-scoped from "cross-tenant" to "cross-branch within a tenant".
  - Consequence: package boundaries are mostly a **build/deploy composition question** (which code and routes ship in each package), not a permissions-matrix question inside a single codebase.
- What Villcan actually is (verified by code reading): a lightweight POS / cash register plus order operations for one owner with one or more branches, and a public storefront per branch (`/tienda/[slug]`). Orders are saved by an RPC and the customer is handed a `wa.me` link. It is single-tenant (one `business_settings` row per deploy). It is NOT an ERP (inventory is only a toggle) and NOT a full CRM (contacts are a customer list).
- **Recommended core (proposed by assistant, not yet formally confirmed by owner):** the order loop. Storefront order, then WhatsApp handoff, then owner manages it, then completion creates the cash movement. ERP and full CRM are out of scope for now.
- **Recommended auth model (proposed, pending owner confirmation):** admin-invite-only user creation, with public signup disabled.
- Resolved TDD mode: strict TDD is enabled by the orchestrator configuration. Exact test runner still to confirm (Vitest for unit/component, Playwright for e2e per the audit). Re-confirm before any implementation.

### Open questions for the owner

- [x] Is "Allow new users to sign up" enabled in the production Supabase dashboard (Authentication, Sign In / Providers)? **RESOLVED 2026-09-22: confirmed ON, so A-2 was live** — the app has no signup page/code anywhere (verified: no `signUp`/`signup` reference in `src`), so nothing in Villcan itself relied on it, but the Auth REST endpoint is reachable directly with the public anon key regardless of the app UI. Matches the already-recommended invite-only model. **Owner disabled it directly in the dashboard 2026-09-22.** A-2 closed.
- [ ] Confirm the core focus (order loop) and the invite-only user model.
- [ ] Which migrations are actually applied in production? Some headers say "NOT APPLIED YET" / "NO fue aplicada".

**Found in Engram (2026-09-21): an earlier proposal `sdd/security-rls-fixes/proposal` (2026-09-10) already targeted some of the same ground.** It planned to fix the contacts cross-branch leak (done — `20260910010000_contacts_branch_isolation.sql`, confirmed solid in this audit) and to narrow `profiles_select_all` away from anon access. That second part shipped only partially: the resulting policy (`20260910020000_profiles_auth_security.sql`) is scoped to `authenticated` but still `USING (true)` — exactly today's A-4. Two other items from that proposal (branch-restricting `services_admin_delete`, and `handleStatusChange` rollback in `orders/[id]/page.tsx`) were not re-checked in this pass; worth confirming their current state before T-03/T-11.

### Findings

Legend: **[V]** verified by reading the code (the assistant re-read it), **[A]** reported by an exploration agent with file evidence, not re-read by the assistant, **[I]** inferred, needs a runtime test.

#### Authentication, users and access control

| ID | Severity | Finding | Evidence | Status |
|----|----------|---------|----------|--------|
| A-1 | CRITICAL | Any authenticated user can make themselves admin of any branch. Policy `uba_insert` allows an admin row when "no admin exists yet", but the subquery on the same table is filtered by `uba_select`, so a non-member never sees existing admins and the check always passes. No later migration replaces it. The UI depends on this loophole for branch bootstrap (`settings/branches/page.tsx:128-130`), so the fix needs a security-definer RPC. | `supabase/migrations/20260831120000_baseline.sql:516-518`, `:522` | **CLOSED 2026-09-22** — see History "Production drift discovery" + "RESOLVED 2026-09-22" sections below |
| A-2 | CRITICAL (conditional) | Open signup makes A-1 reachable by anyone with the public anon key. Local config has `enable_signup = true`, `enable_confirmations = false`. Production unknown. | `supabase/config.toml:171,216` | **CLOSED 2026-09-22** — disabled in production dashboard |
| A-3 | HIGH | Any authenticated user can insert branches. Branch creation is not atomic, so a failed access insert leaves an admin-less branch that anyone can claim via A-1. | `baseline.sql:407` [V]; `settings/branches/page.tsx:114-132` [A] | **CLOSED 2026-09-22** |
| A-4 | HIGH | Every authenticated user can read every profile (email, name) across branches (`USING (true)`). | `20260910020000_profiles_auth_security.sql:14-18` | **CLOSED 2026-09-22** |
| A-5 | HIGH | Set-password page hangs on "Verificando invitación..." for an expired or used invite link; the `error` state exists but is never set. | `src/app/auth/set-password/page.tsx:9-34,127-131` | **CLOSED 2026-09-22** |
| A-6 | HIGH | Invite `redirectTo` is built from `request.url`; depends on a Supabase redirect allow-list that could not be verified. If the prod origin is not listed, the invitee may land signed in without setting a password. | `src/app/api/users/invite/route.ts:59`, `supabase/config.toml:158` | **OPEN — needs owner dashboard action, see Current status** |
| A-7 | MEDIUM | `profiles_update_own` has no column restriction and no `WITH CHECK`; a user can rewrite their own `profiles.email`, which the invite route uses to look up accounts. | `baseline.sql:489`, `route.ts:71-75` | **CLOSED 2026-09-23** (`0d3804a`) — column-level grant restricts UPDATE to `full_name`; policy rebuilt with `to authenticated` + `WITH CHECK`. RED→GREEN, 32/32 integration tests, verified live in production. |
| A-8 | MEDIUM | No password reset, forgot-password or email-confirmation flow. Re-inviting an existing user sends no email. | `route.ts:65-84` | **CLOSED 2026-09-22** — `forgot-password` page added |
| A-9 | MEDIUM | `AuthGuard` treats any `getUser` error, including a network failure, as logged out and redirects to /login (PWA offline/flaky network). | `src/components/.../AuthGuard.tsx:40-43` | **CLOSED 2026-09-23** (`d568887`) — retries once on `AuthRetryableFetchError` before falling back to redirect. RED→GREEN, 564/564. |
| A-10 | MEDIUM | Invite route input handling is thin: unguarded `request.json()` (500 on bad JSON), `role` and email not validated, raw DB error returned. | `route.ts:20-29` | **CLOSED 2026-09-23** (`672676e`) — guarded JSON parse, email/role/branch_id shape validation, generic error messages (raw errors logged server-side only). RED→GREEN via `git stash`, 568/568. |
| A-11 | LOW | Auth is enforced only in the browser (`AuthGuard`). `src/middleware.ts` is a deliberate no-op. In Next 16 `middleware` is deprecated in favour of `proxy`; docs say proxy checks are optimistic and real checks belong at the data layer (which is why A-1 matters). | `src/middleware.ts`, `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md:625-638` | **CLOSED 2026-09-23** (`ed37d0d`) — documented in-place why it's deliberate, not fixed |
| A-12 | LOW | `/login` does not redirect an already-authenticated user. | - | **CLOSED 2026-09-23** (`ed37d0d`) — redirects to `/` on mount if a session exists. RED→GREEN via `git stash`. |
| A-13 | LOW | `signOut()` default scope may sign out all devices; `/logout` is GET-navigable. | `src/lib/auth.ts:18` | **CLOSED 2026-09-23** (`ed37d0d`) — `{ scope: 'local' }` explicit. RED→GREEN via `git stash`. GET-navigability is inherent to Next.js page routing, not fixed (not a real vulnerability — logging yourself out isn't a privilege escalation). |
| A-14 | LOW | `client_errors_insert_any` is `WITH CHECK (true)`; anyone, including anon, can spam that table. | `baseline.sql:444` | **CLOSED 2026-09-23** (`ed37d0d`) — anon-writable stays correct (pre-session crashes need reporting), added CHECK constraints bounding message/stack/url/user_agent length instead of restricting who can write. |

Correct and worth keeping: `AuthGuard` has no content flash and no redirect loop; session in cookies via `@supabase/ssr` 0.10.3; invite route checks caller (`is_branch_admin`) before using the service-role client, which is `server-only`; `prevent_last_admin_removal` trigger; `has_branch_access` / `is_branch_admin` are security-definer with fixed `search_path`; single-source role model (`user_branch_access.role`).

#### Repository hygiene and data exposure

| ID | Severity | Finding | Evidence | Status |
|----|----------|---------|----------|--------|
| H-1 | HIGH | Real customer/business data committed to git: `contacts*.csv`, `movements*.csv`, `services*.csv` (including `_backup` and `_orig`) plus Python migration scripts (`clean_excel.py`, `migrate_excel.py`, `regenerate_csv.py`). Removing them from the tree does not remove them from history. | `git ls-files` | **CLOSED 2026-09-22** — untracked, `.gitignore`'d, history not rewritten (owner's explicit choice) |
| H-2 | LOW | Supabase project ref appears in a seed header comment (and reportedly a migration comment). Not a secret, but it identifies the production project. | `supabase/seeds/tatapiriri_products.sql:2` | **CLOSED 2026-09-23** (`3031c17`) — removed from the seed file; left in 8 already-applied migration files' comments untouched (same no-history-rewrite reasoning as H-1). |

#### Order loop and product

| ID | Severity | Finding | Evidence | Status |
|----|----------|---------|----------|--------|
| P-1 | MEDIUM | Delivery fee is always stored as `null` and the WhatsApp message says "a confirmar por el local"; the fee is set manually later. Direct pain point for a pizzeria (Tatapiriri). `delivery_tiers` table exists but is not applied at order time. | `20260911010000_fix_double_price_order_items.sql`, `20260910000000_storefront_delivery_v2.sql` | **OPEN, deprioritized — see Current status** |
| P-2 | MEDIUM | WhatsApp is a manual handoff: the customer must tap a `wa.me` link. No API, webhook or push. | `useStorefrontCart.ts:134` | **OPEN, deprioritized — see Current status** |
| P-3 | MEDIUM | Rate limiting in `create_storefront_order` counts orders only (5/min/branch, 3/10min/phone), no captcha; a flood can block legitimate orders. | `20260911010000...sql:86-101` | **OPEN, deprioritized — see Current status** |
| P-4 | LOW | Order codes come from one global sequence shared across branches (gaps, leaks volume). | `order_number_seq` | **CLOSED 2026-09-24** (`cbfb060`) — same fix as O-7, see below |
| P-5 | LOW | Inventory is a stub: only an `inventory_enabled` toggle, no stock table or logic. Decide: remove the toggle or scope a real module later. | `settings/modules/page.tsx`, `lib/settings.ts` | **CLOSED** — toggle removed, genuinely dead |
| P-6 | LOW | Pending-orders badge polls every 30s (no Realtime). Acceptable for now. | `usePendingOrdersCount.ts` | Accepted, not a bug |

#### Money: movements, closings, commissions, liquidation, reports

| ID | Severity | Finding | Evidence | Status |
|----|----------|---------|----------|--------|
| M-1 | CRITICAL | `movements_update_admin_or_barber` RLS policy allows any admin/user to UPDATE any movement in their branch with no time or closed-period restriction. `cash_closings` has no UPDATE/DELETE policy (good), but closings recompute from live `movements`, so editing a past movement after it was counted lets someone rewrite history to match the drawer. | `20260831120001_user_fixes.sql:81-89` | **CLOSED 2026-09-22** |
| M-2 | CRITICAL | Completing/editing/cancelling an order after it reached `completed` does not reconcile the linked movement. Trigger `fn_order_completed_to_movement` only fires when status changes TO `completed`, never on exit from it, and has no reversal path. | `20260909000000_orders_movements_link.sql:82-83` | **CLOSED 2026-09-22** |
| M-3 | HIGH | Three independent, inconsistent "cash balance" formulas across `closings.ts`, `kpis.ts`, `reports/page.tsx`. | `closings.ts:21-79`, `kpis.ts:44-84`, `reports/page.tsx:225` | **CLOSED 2026-09-22** — unified in `src/lib/cashBalance.ts` |
| M-4 | MEDIUM | Cash-vs-bank split for expenses is encoded as free text `"[Cta Bancaria]"` appended to `comment`, parsed via `comment.includes(...)` in two different files. | `MovementForm.tsx:59-64`, `closings.ts:72`, `kpis.ts:77` | **OPEN — see Current status** |
| M-5 | MEDIUM | `split_payment_enabled` toggle exists in settings but is never read by any money logic. | `src/lib/settings.ts:10` | **CLOSED** — genuinely dead, removed |
| M-6 | LOW | `computeCommissionAmount` does plain float division with no rounding. | `commission.ts:24-27` | **CLOSED 2026-09-23** (`e5c07ba`) — `Math.round` per line. RED→GREEN, 572/572. |
| M-7 | LOW | No DB-level duplicate-submission protection for manually-created movements. | - | **CLOSED** — client-side ref-lock added (Phase 5 R2-E) |
| M-8 (Reports) | — | No export, no drill-down, "Balance Neto" used its own divergent formula (see M-3). | `reports/*` | **PARTIALLY CLOSED** — formula unified (M-3); export/drill-down still open, see Current status |

Solid: amounts are `integer` columns, no floats stored; `arqueo.ts`/`commission.ts`/`liquidacion.ts` are pure and tested for their stated formulas; `cash_closings` genuinely has no UPDATE/DELETE policy; the order-to-movement trigger is correctly idempotent for the create/complete-once path.

#### Orders lifecycle

| ID | Severity | Finding | Evidence | Status |
|----|----------|---------|----------|--------|
| O-1 | CRITICAL | `update_order` has no state-machine enforcement: never compares `p_status` against the order's *current* status. | `20260911010000_fix_double_price_order_items.sql:286-289` | **CLOSED 2026-09-22** |
| O-2 | CRITICAL | `orders_update_admin_or_user` RLS policy has no `WITH CHECK`; a direct `.update()` can bypass `update_order`'s repricing/guards entirely. | `20260901040000_rename_role_barber_to_user.sql:104-108` | **CLOSED 2026-09-22** |
| O-3 | HIGH | `update_order`'s own authorization check used the dead role value `'barber'`. | `20260911010000...:251-256` | **CLOSED 2026-09-22** |
| O-4 | HIGH | Marking an order paid/completed was two separate, non-atomic, non-idempotent writes. | `src/components/OrderPaymentSheet.tsx:36-49` | **CLOSED 2026-09-22** — atomic `complete_order_payment` RPC |
| O-5 | MEDIUM | No duplicate-order protection beyond coarse rate limits — no unique constraint/advisory lock/idempotency key. | `20260911010000...:86-101` | **CLOSED 2026-09-24** (`aea3c20`) — `pg_advisory_xact_lock` keyed on (branch, phone) around `create_storefront_order`'s rate-limit checks. Backend-only. RED→GREEN with real concurrency (6 simultaneous calls: old code let all 6 through, fixed code lets exactly 3), 36/36 integration tests, verified live. |
| O-6 | MEDIUM | `update_order` accepts `p_delivery_fee` with no range check; a negative fee can reduce a completed order's total. | `20260911010000...:222,343-349` | **CLOSED 2026-09-23** (`df53493`) — rejects `p_delivery_fee < 0` with VC400, matching `confirm_order_delivery_fee`'s existing check. RED→GREEN against real Postgres, 33/33 integration tests. |
| O-7 | MEDIUM | Global `order_number_seq` shared across all branches. | `20260909020000_sequential_order_codes.sql:17,140` | **CLOSED 2026-09-24** (`cbfb060`) — `branches.next_order_number` per-branch counter, atomic `_next_order_code()` helper. Backend-only, no `src/` touched. RED→GREEN, 35/35 integration tests, backfilled and verified live in production. |
| O-8 | LOW | No dedicated cancellation flow/RPC, no reason/audit field. | - | **OPEN — see Current status** |

Solid: server-side repricing via the shared `_price_order_items` helper is used consistently by all three entry points; `order_items` has no direct RLS write policy at all; anon has zero SELECT/UPDATE on `orders`/`order_items`/`contacts`.

Not verified for either area: nothing was run against a live DB in the original discovery pass; the O-5 race specifically still needs an actual two-session concurrency test.

#### Contacts

| ID | Severity | Finding | Evidence | Status |
|----|----------|---------|----------|--------|
| C-1 | HIGH | Contact detail view computed visit count/total spent over a `.limit(5)` result — understated for any contact with 5+ movements. | `src/components/ContactDetailSheet.tsx:29-41` | **CLOSED 2026-09-22** |
| C-2 | MEDIUM | No phone normalization anywhere. | `ContactForm.tsx`, `_find_or_create_contact` | **CLOSED 2026-09-23** — fixed independently in 5 locations (storefront checkout ×2, staff order form, contact search, `ContactForm.tsx`), see the 2026-09-22/23 QA entries below |
| C-3 | LOW | No duplicate-contact warning before insert. | `ContactForm.tsx:99` | Open, LOW, not tracked as a priority item |
| C-4 | LOW | `contactAggregates.ts` "frequent visitor" heuristic never wired into `ContactDetailSheet` — dead/duplicated logic. | `contactAggregates.ts` | Open, LOW, not tracked as a priority item |

Solid: `20260910010000_contacts_branch_isolation.sql` is confirmed the final word on contacts RLS; orders store `customer_name`/`customer_phone` as independent snapshots so editing a contact never rewrites historical order data; auto-create-on-order is atomic and correctly branch-scoped.

#### Rest of the app sweep (cash-session UX, storefront templates, storage, PWA, settings, errors, tests)

| ID | Severity | Finding | Evidence | Status |
|----|----------|---------|----------|--------|
| S-1 | CRITICAL | `service-images` Storage bucket migration header said "NOT APPLIED" — turned out to be stale/wrong, bucket was actually live unscoped. | `20260831170000_service_images_storage.sql:1-3` | **CLOSED 2026-09-22** — re-scoped by branch |
| S-2 | HIGH | "Arqueo obligatorio" toggle described a gating flow that doesn't exist. | `settings/modules/page.tsx:148` | **CLOSED 2026-09-22** — kept the toggle (it's real, gates real logic), fixed the misleading hint text |
| S-3 | HIGH | No service worker exists anywhere; "PWA" is not backed by real offline capability. | `public/manifest.json`, `src/app/layout.tsx:36` | **OPEN — see Current status** |
| S-4 | MEDIUM | Storage policies for `service-images` gave no branch isolation. | `20260831170000...sql:54-68` | **CLOSED 2026-09-22** — same fix as S-1 |
| S-5 | MEDIUM | `ClosingWizard` never checks for pending/unconfirmed orders before closing a day. | `src/components/ClosingWizard.tsx:60-98` | **CLOSED 2026-09-23** (`a0b1fc7`) — non-blocking warning banner on the summary step when orders are still pending. RED→GREEN, 574/574. |
| S-6 | LOW | `ClosingForm.tsx` is dead code, unsynced with the real `ClosingWizard.tsx`. | `src/components/ClosingForm.tsx` | **CLOSED** — deleted |
| S-7 | LOW | Errors log has no filters at all. | `errors/page.tsx` | **OPEN — see Current status** |
| S-8 | — | Reconfirms A-14 (`client_errors_insert_any` anon-writable). | `baseline.sql:444` | Same as A-14 |
| S-9 | — | ~1/3 of source files untested; no e2e for closings/arqueo, errors, storage/image upload. | `tests/e2e/*.spec.ts` | **OPEN — see Current status** |

Solid: `RetailTemplate`/`ServicesTemplate` are fully built, share cart/checkout state correctly, no logic duplication vs Gastronomy; Errors page correctly restricts read access to admins.

#### Code quality

| ID | Severity | Finding | Evidence | Status |
|----|----------|---------|----------|--------|
| Q-1 | MEDIUM | No server layer: components call `createClient()` directly, business logic lives in components. | `src/**` | **IN PROGRESS** — see Current status, data-access-layer extension |
| Q-2 | MEDIUM | Very large files: `MovementForm.tsx` (1065), `GastronomyTheme.tsx`/`GastronomyTemplate.tsx` (1148 each), `reports/page.tsx` (720), `orders/[id]/page.tsx` (695). | - | **PARTIALLY CLOSED** — `MovementForm.tsx` and `orders/[id]/page.tsx` split; the two storefront files and `reports/page.tsx` deliberately deferred, see Current status |
| Q-3 | MEDIUM | WhatsApp message logic duplicated in SQL and TypeScript, already diverging. | `src/lib/storefront.ts` vs the RPC | **CLOSED** — the TS copy (`formatOrderMessage`) was dead code, removed; one live source of truth remains |
| Q-4 | LOW | No automated tests for RLS policies or a second user in a second branch. | `tests/e2e/*`, `*.test.ts(x)` | **OPEN — see Current status (same as T-01)** |

Positive: prices are recomputed server-side in the order RPC; service-role key is not exposed client-side.

### Not verified (as of original 2026-09-21 discovery — see "Production drift discovery" below for what got checked against real production afterward)

- Which migrations are applied in production; some headers say "NOT APPLIED YET" / "NO fue aplicada".
- Production Supabase Auth settings: signup enabled, confirmations, Site URL, redirect allow-list, SMTP, invite email template.
- Whether the `auth.users` to `handle_new_user` trigger exists.
- The A-1 exploit itself (needs a two-user runtime test).
- Whether the tests pass (not run).
- Completeness of the Services and Retail templates; PWA offline.

### Execution order (APPROVED 2026-09-21 — this was the active plan, now fully executed through Phase 5; see Current status for what's left)

Phased by severity and dependency, not by discovery order. Each numbered item is its own work unit: RED test first (against a real Supabase instance where the bug is in SQL/RLS — mocked Vitest does not count for those), fix, GREEN, commit on the feature branch.

**Phase 1 — Security/money blockers (must be done before any real client):**
1. ✅ **DONE 2026-09-22 (deployed to production).** Recurring stale `'barber'` role regression in `update_order` — fixed and confirmed live.
2. ✅ **DONE 2026-09-22 (deployed to production).** A-1/A-3 — self-admin RLS hole closed (`uba_insert_existing_admin`), open branch creation closed (moved to `create_branch_with_admin` RPC, wired into `settings/branches/page.tsx`).
3. ✅ **DONE 2026-09-22 (deployed to production).** O-1/O-2 — completed/cancelled orders are now immutable (status guard in `update_order`), direct-table-update bypass closed (`orders_update_admin_or_user` now has `WITH CHECK` + a financial-fields trigger).
4. ✅ **M-1 DONE 2026-09-22 (deployed to production)** — movements can no longer be edited past their branch's latest closing. ✅ **M-2 DONE 2026-09-22 (deployed to production, real RED-then-GREEN confirmed).** Root cause: `orders/[id]/page.tsx`'s `handleStatusChange` did a raw `.update({status})` for any non-`'completed'` target status, bypassing `update_order`'s own guard entirely. Fixed at the DB level by extending the financial-fields trigger to also block any status change once an order is `completed`/`cancelled`, unconditionally. Migration `20260922010000_freeze_completed_orders_and_grant_cleanup.sql`.

**Local Docker stabilized 2026-09-22**: the `analytics`/`vector` containers (Logflare) were failing their health check every time, blocking `supabase start` entirely. Fixed by setting `enabled = false` under `[analytics]` in `supabase/config.toml` (local dev only). With that, `npm run test:integration` finally ran for real: all 12 previously-written tests pass, and the new M-2 test was proven RED then GREEN — the first genuine RED→GREEN cycle completed in this session.
5. **Also fixed as part of the same deployment:** A-4 residual (profiles now branch-scoped, not just authenticated-scoped).

**Phase 2 — Reliability of daily-use features. ✅ ALL DONE 2026-09-22 (deployed where applicable, real RED-then-GREEN confirmed for every item).**

Done in parallel via 3 independent agents (no file overlap) plus one done directly (O-4, needing exclusive local-Supabase-stack access):

5. ✅ **M-3** — new shared `src/lib/cashBalance.ts` (`computeCashBalance`), documented invariant: `efectivo = apertura + servicio.efectivo − gasto.nonBank − cierre`; `global = efectivo + transferencia + pos − gasto.bank`. `reports/page.tsx`'s inline `balanceNeto` was the actual divergent one — fixed, with a regression test proving the old formula would show ₲50.000 for a scenario where the correct number is ₲200.000.
6. ✅ **O-4** — new RPC `complete_order_payment` (migration `20260922020000_atomic_order_payment_completion.sql`), atomic and idempotent (rejects with VC409 if already completed/cancelled). `OrderPaymentSheet.tsx` now calls it instead of two separate writes.
7. ✅ **C-1** — `ContactDetailSheet.tsx` now runs a second, uncapped query for the total-spent/visit-count stats.
8. ✅ **A-5/A-8** — root cause of A-5: an expired/used invite/recovery link redirects back with the failure encoded in the URL hash, and the component only ever listened for `SIGNED_IN`. Fixed by parsing the hash for an error on mount. New `forgot-password/page.tsx` (A-8) calls `resetPasswordForEmail`, always shows a generic message.

**Full-suite check after all 4 items merged (2026-09-22):** `npm run test` → 467/468 pass (1 pre-existing unrelated flake).

**Committed 2026-09-22:** commit `871134d` ("fix(reliability): close Phase 2 audit gaps (M-3, O-4, C-1, A-5, A-8)"). Pushed to GitHub.

**Parallelization note:** 3 independent writers ran concurrently with zero file overlap by design, each forbidden from touching `supabase start/reset/db push`/`test:integration`. One parallel agent appeared to hang waiting on its own backgrounded `npm run test`; a replacement was spawned, but the original actually finished correctly — no work lost, but the pattern of subagents mis-handling their own backgrounded long commands recurred and should be watched for.

**Phase 3 — Hygiene and coherence before selling packages. ✅ ALL DONE 2026-09-22.**

Owner made 5 explicit product decisions before any work started: (1) H-1 — stop tracking only, no git history rewrite; (2) storage — activate it, fixed, not remove; (3) `split_payment_enabled` — remove; (4) "Arqueo obligatorio" — **corrected mid-task** to keep, fix copy only; (5) `inventory_enabled` — remove.

9. ✅ **H-1** — 12 files removed from git tracking via `git rm --cached`, added to `.gitignore`. History NOT rewritten. Committed `9267a01`.
10. ✅ **S-1/S-4** — activated and fixed. The `service-images` bucket was NOT actually pending (already live unscoped since 2026-09-01, the migration's header was stale). New migration re-scopes by branch folder. A second bug (unsafe `uuid` cast erroring on the legacy `taitashu/menu-bbq.jpg` object) was caught only by verifying real production data, fixed with a safe-cast helper. Committed `ab45aa0`.
11. Toggles: ✅ `split_payment_enabled` (M-5) removed, genuinely dead. ✅ `inventory_enabled` (P-5) removed, genuinely dead. **`mandatory_arqueo_enabled` (S-2) — original finding was WRONG**, the writer agent verified in code it's actually live and gates real logic, refused to delete it, flagged the discrepancy. Re-asked owner, decision changed to keep + fix misleading hint text. Committed `4203bb1`.

**Full-suite check after Phase 3:** `npm run test` → 467/468 pass (1 different pre-existing flake, isolated-run confirmed unrelated).

### Phase 5 — Deep money/UX/UI audit of orders, movements, closings ("swiss watch" pass)

Requested 2026-09-22: owner asked for a thorough pass on everything money-related. Four parallel read-only agents, one per area.

#### Orders (list, detail, new, payment)

| ID | Severity | Finding | Evidence | Status |
|----|----------|---------|----------|--------|
| SW-O1 | HIGH | Two separate "complete an order" paths existed; the list/sheet quick-action bypassed the atomic RPC and could complete without delivery_fee. | `orders/page.tsx:68-78`, `20260909000000...sql:134-136` | **CLOSED** — R2-D |
| SW-O2 | HIGH | Order total shown on list/detail cards never included delivery fee. | `orders/[id]/page.tsx:475`, `OrderCard.tsx:85` | **CLOSED** — R2-D |
| SW-O3 | HIGH | `OrderPaymentSheet`/`OrderCard` used `parseInt`, not `parseGuaranies` — undercharge risk. | `OrderPaymentSheet.tsx:26`, `OrderCard.tsx:56` | **CLOSED** — GuaraniesInput everywhere (R1-A, R2-F, R2-D) |
| SW-O4 | MEDIUM | Delivery fee has no edit path after initial entry. | `OrderCard.tsx:117-141` | **OPEN — see Current status** |
| SW-O5 | HIGH | `OrderPaymentSheet.tsx:46` showed raw Postgres error text to the cashier. | `OrderPaymentSheet.tsx:46` | **CLOSED** — R2-F, Spanish `ERROR_COPY` |
| SW-O6 | MEDIUM | `handleStatusChange` optimistically updated UI before awaiting the DB write, no error check. | `orders/page.tsx:72-77` | **CLOSED** — R2-D |
| SW-O7 | MEDIUM | Cancelling an order required no confirmation despite being effectively irreversible. | `orders/[id]/page.tsx:401-411` | **CLOSED** — R2-D, `window.confirm` added |
| SW-O8 | MEDIUM | Small/inconsistent touch targets on repeated-tap order controls. | `CartSheet.tsx:77-84`, `OrderCard.tsx` | **CLOSED** — R2-D |
| SW-O9 | MEDIUM | Two different visual implementations of the order status control. | `orders/[id]/page.tsx` vs `OrderDetailSheet.tsx` | **CLOSED** — R2-D, color parity |
| SW-O10 | LOW | No submitting/disabled guard on status-change actions. | - | **CLOSED** — R2-D |

#### Movements (MovementForm — the highest-traffic screen)

| ID | Severity | Finding | Evidence | Status |
|----|----------|---------|----------|--------|
| SW-M1 | HIGH | POS payment silently coerced to `'efectivo'` for reconciliation. | `MovementForm.tsx:244-245` | **CLOSED** — R-DB (DB-side) + follow-up (UI-side coercion line) |
| SW-M2 | HIGH | No guard against double-submission — reactive `disabled` prop only. | `MovementForm.tsx:218-231` | **CLOSED** — R2-E, ref-lock |
| SW-M3 | MEDIUM | No monto-recibido/vuelto capture in the Venta flow; dead CSS for a change display existed. | `MovementForm.tsx:556-699` | **CLOSED** — R2-E, dead code removed |
| SW-M4 | MEDIUM | Raw Postgres error text shown to the cashier. | `MovementForm.tsx:258,302` | **CLOSED** — R2-E, Spanish copy |
| SW-M5 | MEDIUM | `MovementForm` and `OrderPaymentSheet` are two structurally separate implementations of the same pattern. | both files | **OPEN — see Current status** (styling/input unified, structure not merged) |
| SW-M6 | LOW | `parseGuaranies` treats `,` as decimal, doesn't reject negatives at the parse layer. | `src/lib/utils.ts:15-18` | Open, LOW, not tracked as a priority item |
| SW-M7 | LOW | Dead no-op code from a refactor. | `MovementForm.tsx:203-209` | **CLOSED** — R2-E |
| SW-M8 | LOW | Payment-method badge on movements list is an unstyled raw string. | `movements/page.tsx:177` | Open, LOW, not tracked as a priority item |

#### Closings/arqueo (ClosingWizard, arqueo.ts, closings.ts)

| ID | Severity | Finding | Evidence | Status |
|----|----------|---------|----------|--------|
| SW-C1 | HIGH | Discrepancy color applied alarm-red to both surplus and shortage at the confirm step. | `ClosingWizard.tsx:258,264,270,324` | **CLOSED** — R2-G |
| SW-C2 | HIGH | No DB constraint preventing two overlapping closings for the same branch+period. | `baseline.sql:126-149` | **CLOSED** — R-DB, per-branch advisory-locked trigger |
| SW-C3 | MEDIUM | `notes` column existed in schema/payload but `ClosingWizard.tsx` never rendered an input for it. | `arqueo.ts:26,42` | **CLOSED** — R2-G |
| SW-C4 | MEDIUM | No detail/permalink route for a single past closing. | `closings/page.tsx` | **OPEN — see Current status** |
| SW-C5 | LOW | `ClosingWizard` alone uses a hold-to-confirm button. | `HoldButton.tsx` usage | Accepted, deliberate friction for an irreversible action, not a bug |
| SW-C6 | LOW | `parseGuaranies` comma-as-decimal parsing (see SW-M6), low real-world risk. | `utils.ts:15-18` | Open, LOW, not tracked as a priority item |

#### Cross-screen money coherence (dashboard, Reports, Liquidación, KPIs)

| ID | Severity | Finding | Evidence | Status |
|----|----------|---------|----------|--------|
| SW-K1 | HIGH | Dashboard balance and Reports' Balance Neto use different time-scope boundaries, nothing explains the difference. | `page.tsx:111-116` vs `reports/page.tsx:442-449` | **OPEN — see Current status** |
| SW-K2 | MEDIUM | Dashboard's date filter visually implies it controls the balance cards; it doesn't. | `page.tsx:110-139` | **OPEN — see Current status** |
| SW-K3 | MEDIUM | No negative-amount color coding on dashboard KPI/Reports Balance Neto. | `KPICard.tsx`, `reports/page.tsx:443-448` | **OPEN — see Current status** |
| SW-K4 | LOW | Liquidación's per-row commission figure has no label. | `reports/liquidacion/page.tsx:158` | **OPEN — see Current status** |
| SW-K5 | LOW | No stale-data indicator/manual refresh on dashboard/Reports. | - | **OPEN — see Current status** |

**Owner decision 2026-09-22 (SW-O3/SW-M6 fix scope):** presented minimal-swap vs. a shared live-formatting money input; **owner chose the shared component.** Result: new `GuaraniesInput` (live thousands-separator, cursor-preserving), wired into every money field across MovementForm, OrderPaymentSheet, OrderCard, ClosingWizard.

**Phase 5 execution, all committed 2026-09-22:**
- **R1-A** `8b3f52b` — `GuaraniesInput` component, 9/9 new tests.
- **R-DB** `79ba6a0` — SW-M1 (DB-side) + SW-C2, deployed to production.
- **R2-F** `5796ae4` — OrderPaymentSheet: SW-O5 + GuaraniesInput.
- **R2-G** `c6a1640` — ClosingWizard: SW-C1 + SW-C3 + GuaraniesInput.
- **R2-E** `fb30f70` — MovementForm: SW-M2 + SW-M4 + SW-M3/M7 + GuaraniesInput.
- **R2-D** `e0551f2` — orders list/detail/OrderCard/OrderDetailSheet: SW-O1/O2/O6/O7/O8/O9/O10 + GuaraniesInput.

**Verification after all merged:** `npm run test` → 510/510. `npm run test:integration` → 24/24 (one test-isolation fixture bug found and fixed, not a product bug).

**First RDD-reviewed candidate this session:** 6 commits, 18 files, 1760 lines. `review_due: true` (slice budget). Owner granted consent. `review-reliability` lens: **approved**, 3 non-blocking advisory findings — all 3 later closed (see below), full suite 512/512.

**Phase 5 residual, closed same day:** MovementForm's client-side POS→efectivo coercion — the R-DB fix only unblocked the database; the UI still forced the old default. Fixed with real RED-then-GREEN.

**RDD advisory findings — all 3 closed, 2026-09-22:** GuaraniesInput caret-position test now uses real keystrokes (`user-event`, not `fireEvent`); `OrderDetailSheet`'s payment refetch now shows a toast on silent failure instead of leaving stale status; manually diffed `update_order`/`create_manual_order` between migration versions to confirm no unintended divergence.

**Not in scope for Phase 5, logged as still open:** SW-O4, SW-K1–K5, SW-M5/M6/C4/C6, SW-M8 (all reflected in Current status above).

### Data access layer — history

Owner decision after investigation: thin shared query/RPC functions (`src/lib/data/*`), NOT Server Actions/Server Components. Rationale: security already lives entirely in RLS, not in which layer calls Supabase; the app's imperative-state wizard UIs (MovementForm, OrderPaymentSheet, ClosingWizard) would be high risk to rewrite into `<form action>`/`useActionState` for zero benefit.

**First slice (orders + movements — done 2026-09-22).** New `src/lib/data/{orders,movements,services,contacts}.ts`. Commit `4cedc6b`. 67 tests across 7 files matched before/after exactly.

**Fourth RDD review** (`4cedc6b`+`0339121`): approved, 4 findings, all fixed — unified `refetchOrderAfterWrite` helper covering order/items refetch failure in both `OrderDetailSheet` and `orders/[id]/page.tsx`; a TS-narrowing cleanup in `MovementForm.tsx`.

**Third RDD review** (file splits, `6ad5dd2`): approved, 2 non-blocking findings, 1 fixed for real (a dead `contact` prop/fetch in `OrderViewPanel`, pre-existing before the split, not a regression).

**Second RDD review** (Q-3/S-6 cleanup, `f3d3b4d`→`01e3e31`→`749e6e3`): approved, 3 findings, 1 fixed for real (a silent `data:null/error:null` gap in `handlePaymentCompleted`).

**File splits, 2 of 4 planned, done 2026-09-22:** `MovementForm.tsx` (1072→441 lines, split into `src/components/movement-form/*`), `orders/[id]/page.tsx` (711→373, split into `OrderViewPanel.tsx`+`OrderEditForm.tsx`). Both are pure structural refactors, same test counts before/after. **Not done, deliberately deferred:** the two storefront template files (visual regression risk without a browser check) and `reports/page.tsx` (slated for a rebuild, not a restructure).

**2026-09-23: second slice started.** Scope confirmed at task start: **~36 files** still call `createClient()` directly outside the first slice. Delegated to a background agent, one domain per commit, same discipline (clean build + full suite before each commit). Storefront and auth explicitly out of scope for this round (owner hasn't decided storefront's direction; auth is security-sensitive, handled separately). **Progress as of this writing: contacts (`a77d402`), services (`4397b76`), closings (`52f7a7e`), reports (`0aaf800`), settings/branches (`6ed4e69`), settings/general (`562c04e`) — done. settings/users in progress.** See Current status for what's left; update this line and the Current status entry together once the agent reports fully done.

### Active work unit (2026-09-21): fix the recurring `'barber'` role regression — superseded, see "Production drift discovery" below

**Corrected finding:** only ONE function was actually live-broken — `public.update_order`, regressed back to `role in ('admin', 'barber')` three separate times across rewrites.

**Root cause of the audit gap:** this repo had **no test that exercises SQL/RLS/RPC authorization against a real Postgres instance** — every Vitest spec mocks the Supabase client, so a bug living entirely in a SQL function's body was invisible to the whole suite. This is exactly why **T-01 (a real two-user RLS/RPC integration test) is still listed as open in Current status** — the infrastructure to write it exists now (`tests/integration/`, local Docker confirmed working), but the specific two-user test proving A-1/A-3/A-4 hold was never written; only a manual production-dump re-verification was done.

### Production drift discovery (2026-09-22, CRITICAL, changed the plan)

While preparing the RED test, verified local migrations against real production first (`vjgdtxryudoscumwsjhs`). Read-only: `npx supabase migration list`, `npx supabase db dump --linked`.

**Finding 1 — Production was 6 migrations behind local**, missing the contacts branch-isolation fix and the profiles-narrowing fix among others.

**Finding 2 — Production had one migration (`20260915120218`) that exists NOWHERE in git** — a schema change made directly against production, outside version control. Content recovered from `supabase_migrations.schema_migrations`'s `statements` column: added catalog columns and re-seeded a burger-restaurant prototype (`taitashu`). **Owner confirmed: not a real/active business**, lowering urgency from "active breach" to "pre-launch hygiene."

**Finding 3 — The migration-tracking table itself couldn't be trusted**: a migration marked "applied" had in fact been silently overwritten in production by something (most likely the untracked migration), leaving `update_order` OLDER and MORE broken than any version analyzed from local files (still `'barber'`, still double-pricing, no status guard).

**Finding 4 — directly confirmed live in the production dump** (worse than the local-file analysis assumed): `profiles_select_all` had NO `authenticated` restriction at all (anon could read it); `contacts_*_authenticated` policies had zero branch scoping; `uba_insert`/`branches_insert_authenticated`/`movements_update_admin_or_user`/`orders_update_admin_or_user` all confirmed live with their vulnerable text; `update_order` confirmed as the oldest, most-broken version seen anywhere.

### RESOLVED 2026-09-22: all 7 confirmed-live production issues fixed and deployed

Local Docker proved unreliable for the planned RED/GREEN ceremony (two parallel subagents ended up racing the same stack). Owner explicitly redirected: skip local ceremony, push the correct fix straight to production after a careful manual read of the migration.

1. Manually read `20260922000000_fix_confirmed_prod_and_local_gaps.sql` end to end before touching production.
2. Checked the one real data-risk (`contacts.branch_id` addition) — nullable, fail-closed, safe to apply.
3. `supabase migration repair --status reverted 20260915120218` — metadata-only, doesn't touch the Taitashu schema/data.
4. `supabase db push --include-all` — applied all 8 pending migrations to production in one shot, zero errors.
5. Re-dumped production and read it back to independently confirm every fix landed: `profiles_select_branch_scoped`, `uba_insert_existing_admin`, `orders_update_admin_or_user` `WITH CHECK`, `movements_update_admin_or_user` closing-date restriction, `update_order`'s status guard + role fix, `create_branch_with_admin` + financial-fields trigger all present.

**Minor follow-up noted, not blocking:** both `update_order` and `create_branch_with_admin` carry a leftover `GRANT ... TO anon` (schema-level default, not exploitable since both check `auth.uid() IS NULL` first) — worth revoking explicitly in a future defense-in-depth pass. Not currently tracked as a priority item.

**Committed 2026-09-22:** branch `fix/confirmed-rls-and-order-security-gaps`, commit `a0f9404`. History rewritten same day to remove a hardcoded local Supabase dev secret key GitHub's push protection caught (moved to gitignored `.env.test.local`). Current SHAs `a0f9404`/`881733c`/`871134d`. Pushed to GitHub.

**Second pass, same day:** integration-test suite runs GREEN for real (13/13) after stabilizing local Docker (disabled `analytics` in config). Anon grant cleanup done and verified live.

### Vercel build failure — history

**2026-09-22, after `d4f658c`:** Vercel build failed with a type error even though `tsc --noEmit` had reported clean locally throughout. Root cause: a stale `tsconfig.tsbuildinfo` let TS's incremental cache skip re-checking files whose errors predated the cache. **New local verification standard, still in effect: `rm -f tsconfig.tsbuildinfo && rm -rf .next && npm run build`, never `tsc --noEmit` alone.** Three cascading type errors found and fixed (an explicit-generic workaround for a non-literal `.select()` string, `PaymentMethod` widened in 3 places to include `'pos'`, a real narrowing bug in `MovementForm.tsx`'s `handleSubmit` given a defensive guard). Verified clean, 505/505 tests. Commit `d680a04`, deployment `dpl_8QZ8BDdab3EUJPLrk5V1TWRBKGV9` confirmed READY.

### Production bug — delivery-order confirm 400 (real user report), history

**2026-09-22:** owner reported a 400 + console error confirming a delivery order. Root cause: `OrderCard.tsx`'s confirm-with-fee flow did a direct `.update()` that the O-2 financial-fields guard (correctly) blocked, with no legitimate bypass for this one real caller. Fixed with a new narrowly-scoped RPC (`confirm_order_delivery_fee`), same auth+bypass pattern as `update_order`. RED→GREEN against local Postgres (this is a trigger-level bug a mocked unit test can't catch). Migration `20260922060000_confirm_order_delivery_fee.sql`, `src/lib/data/orders.ts`'s `confirmOrderDeliveryFee`, `orders/page.tsx`'s `handleStatusChange` updated. 506/506 tests, clean build, pushed to production (`f250b9d`, deployment `dpl_ArsqZf51pgVuXJY1e412s2C2RzRA` confirmed READY).

**Live QA verification (Playwright MCP against the real running app + real production Supabase):** created a real delivery order end to end, confirmed with a fee, network trace showed `200`, total correct, zero console errors.

**New finding from that QA pass, since closed as QA-4:** `/orders/new`'s payment-method select was missing POS.

**Environment note, still true:** the local dev server's `.env.local` points at **production** Supabase, not a local stack. Test data created during manual QA lands in real production data. Acceptable pre-launch (no live client), worth remembering before a real launch.

### Senior QA sweep (2026-09-22, live, Playwright MCP against real production) — full backlog, history

Owner instruction: build the list first, don't fix anything yet. Tested orders creation (both paths), payment completion (all 3 methods), the movements catalog/cart flow with a realistic multi-item sale, and the Tatapiriri public storefront end to end.

**Bugs found and their resolution (all closed via the QA-1 through QA-8 checklist below):**
1. Phone number malformed on every order-creation path (duplicated in `CheckoutStep.tsx` and `CheckoutForm.tsx`) — **QA-2**.
2. Reportes "Servicios" breakdown showed "Sin servicio" instead of real names — **QA-3**.
3. `/orders/new` missing POS payment option — **QA-4**.
7. Recurring `Cannot read properties of undefined (reading 'M_ID')` client error — **QA-1**.
4. Movements payment-method selector had no selected-state styling — **QA-5**.
5. CartSheet became unusable with a realistic multi-item sale — **QA-6**.
6. Storefront two-dialogs-stacked bug — **QA-7** (mostly a false positive in the primary flow, but a real edge case in the nav-trigger/mobile-FAB path was found and fixed).
Backoffice (`AppSheet`) had zero desktop layout — **QA-8**.

**Verified correct, NOT bugs:** order payment already asked for "monto recibido" only for Efectivo (not Transferencia/POS); storefront payment-method select correctly stays narrow (no POS offered to customers).

**Minor, noticed in passing, not tracked as priority:** product-detail modal shows a placeholder icon with no images loaded for at least one product; two font-preload warnings + one manifest icon-size warning in console.

**Execution checklist — all 8 closed 2026-09-22:**
- ✅ **QA-1** — root cause was a third-party browser extension's own injected script throwing, unrelated to Villcan; `window.onerror` was logging it unfiltered. Fixed by filtering any error whose stack matches a browser-extension URL pattern before logging (`src/lib/errorLogging.ts`).
- ✅ **QA-2** — fixed in both `CheckoutStep.tsx` (the real storefront path) and `CheckoutForm.tsx` (staff `/orders/new`), same `.replace(/^0/, '')` strip before prepending `+595`.
- ✅ **QA-3** — root cause was `movements.service_id` always NULL for order-derived sales; fixed by aggregating from `order_items` instead.
- ✅ **QA-4** — widened `CheckoutFormValues.paymentMethod`, added the POS option (same commit as QA-2).
- ✅ **QA-5** — root cause: `PaymentStep.tsx` used the `.method-grid`/`.method-btn` classes but never defined their CSS (only sibling `DetailsStep.tsx` did, and it never mounts during a Venta). Copied the CSS block verbatim into `PaymentStep.tsx`.
- ✅ **QA-6** — gave `.cart-lines` (the inner scrollable list, not the whole panel) `max-height: 33vh` + `overflow-y: auto`.
- ✅ **QA-7** — the nav-trigger and mobile FAB in `GastronomyTemplate.tsx` didn't call `closeSheet()` before `goToCart()`, unlike the in-sheet CTA which already did both correctly. Fixed both call sites.
- ✅ **QA-8** — owner decision: mobile-first intent, but "es standard que sea responsive." Added a `@media (min-width: 768px)` block to the single shared `AppSheet.tsx` turning the bottom sheet into a centered modal card on desktop — every screen using `AppSheet` gets this in one place.

**Second wave covered (same pass):** Cierres de Caja (full flow through confirm, not submitted for real to avoid mutating production), Contactos (list view), Settings general/módulos/usuarios (clean), Catálogo (list view), Reportes, Errores/Soporte, TAITASHU storefront (owner said not to bother), one mobile-viewport screenshot confirming storefront is responsive and backoffice wasn't (that's QA-8).

**Environment note (2026-09-22, late session), still relevant:** running the full 511-test suite concurrently with a live dev server + Playwright produced escalating non-reproducible failures (classic resource contention, not real regressions — confirmed by re-running every "failing" file in isolation, 100% pass every time). **Standing practice since: close the Playwright browser before running the full suite when possible, and don't insist on a full clean run under load — verify via isolated targeted runs instead, noted honestly.**

### Contact search was broken — real bug, reported by owner, fixed (2026-09-23)

Owner reported live: "los buscadores de contactos... están todos rotos y no sirven de nada." Verified before agreeing (house rule: never just agree, check first). Confirmed live: a contact created with an exact phone number returned zero results searching that same phone. Root cause: `/contacts`' search only OR'd `full_name`/`ci`, never `phone`; `searchContacts()` (used by MovementForm's contact autocomplete) had the same gap independently. Fixed both — RED→GREEN, 514/514, clean build, verified live against real production data.

**Follow-up found same pass, fixed 2026-09-23:** `ContactForm.tsx` (shared by create+edit via `ContactFormSheet.tsx`) stored the phone exactly as typed, zero normalization — a 4th independent occurrence of the QA-2 phone-formatting gap. Fixed by reusing `normalizeWhatsAppNumber` from `src/lib/storefront.ts`. RED→GREEN, 515/515.

### Contactos/Sucursales/Catálogo QA pass (2026-09-23) — 1 real finding, since resolved

- **Contactos, Sucursales:** all clean, no new bugs beyond the phone-normalization gap already covered above.
- **Catálogo — real finding, closed same day (`9add8f8`):** two parallel duplicated "edit service" implementations existed with different field sets — `ServiceEditSheet.tsx` (the modal actually reached from the list, missing Imagen/Global) vs. `services/[id]/edit/page.tsx` (a full page with the complete field set, reachable only via a detail-page button the list never navigated through). **Resolved:** decided in favor of the sheet — it matches the app-wide standard (Contactos/Órdenes/Movimientos are all sheet-based). `ServiceEditSheet.tsx` already had the `imageUrl`/`isGlobal` state wired, only the UI inputs were missing; added them (image upload + URL fallback, copied from `ServiceForm.tsx`'s working pattern, plus the Global toggle). Deleted the duplicate full-page route entirely; the detail page's Editar button now opens the same sheet inline. New tests in `ServiceEditSheet.test.tsx`. Build+513/513 clean.

### Touch-target pass (44×44px rule), non-storefront screens (2026-09-23) — closed

Delegated a read-only sweep across `src/`, excluding storefront (owner hasn't decided its design direction yet). 17 real violations found; one more (`Toggle.tsx`'s 44×24 switch) is a documented intentional exception per `REQ-THEME-6`, left as-is. **All 16 fixed** (`790209d`), build clean, 513/513 tests green: `AppSheet.tsx`'s shared close button, `HamburgerMenu.tsx`'s drawer close button, `orders/page.tsx`'s status tabs, `movements/page.tsx`+`reports/page.tsx`'s filter buttons, `orders/[id]/page.tsx`'s back/edit buttons, `settings/branches/page.tsx`'s back button + row actions, `ContactCard.tsx`'s WhatsApp icon-link, `contacts/page.tsx`'s sort toggle, `OrderDetailSheet.tsx`'s notify/link/select controls, `movement-form/DetailsStep.tsx`'s clear button, `ClosingWizard.tsx`'s back button, `settings/general/page.tsx`'s color swatches. No RED possible (pure CSS sizing) — verified via clean build + full suite, per this session's established practice for visual-only changes.

### Data access layer extension, round 2 (2026-09-23) — in progress, see Current status

Started after the touch-target pass and the catálogo unification. Scope, method, and live progress are tracked in "Data access layer — history" above and in `## Current status`; update both together as domains complete.

### 2026-09-25 reconciliation + merge: batch-2 into `main`, round 6 into `design/visual-refresh`

**Attribution, explicit per request:** everything in this entry — batch 1, batch 2, and round 6 (the UI work below), plus this reconciliation and both merges — was done by **Claude Code, web session** (claude.ai/code), continuing the same conversation across all three. It was **not** done by the CLI agent this project's History elsewhere calls "gentle-ai" / "gentleman ai" (see e.g. the "RDD (native review)" entries above) — that tool was never invoked on any of this session's own work. Noted here specifically so the two can be told apart later.

**How this session ended up doing UI work at all.** It started strictly backend-only, by instruction: batch 1 (SW-O4/O-8 RPCs, S-9 e2e, `extension_in_public`, backups doc) and batch 2 (M-4 column, monitoring scaffold) were both explicitly scoped to avoid `src/components/`, `src/app/(app)/**/page.tsx`, and any other UI file, specifically to not collide with the `design/visual-refresh` session actively working the backoffice redesign in parallel — see both batches' own History entries above for the full detail of that work. After batch 2 landed, the owner asked this session directly whether the design branch's own queued tasks (T15 "M-8 CSV export + drill-down", T16 "SW-K1 through K5 money coherence", T17 "SW-M5 unify MovementForm/OrderPaymentSheet" — all three written into `odd/tasks/backoffice-visual-refresh.md` by the design-branch session itself, none started) should also be picked up by this session. The owner confirmed explicitly (asked directly, not assumed) that UI work was now in scope and that the result should land on a new branch off `design/visual-refresh` rather than directly on it, to avoid colliding with any work still in flight there.

**Round 6, `design/visual-refresh-round6` off `design/visual-refresh` at `fcba496`:**
- **T15/M-8** (`59b0f94`) — Reports' "Por Método" rows now link to `/movements?range=&method=`, "Servicios" rows to `/orders?range=` (date-scoped only, not per-service — an order can contain several services, no clean single-service filter exists to add). Both required adding a real date-range filter to `/orders` (had none) and a method sub-filter to `/movements` (shown as a removable chip) — extending each page's own existing filter vocabulary rather than inventing new UI, per the task's own instruction. Added an "Exportar CSV" button to Reports (client-side `Blob` download, no backend call). 13 new tests, RED→GREEN (verified by stashing each implementation file, confirming the new tests failed, restoring).
- **T16/SW-K1-K5** (`f5902fa`) — K1/K2: made explicit (a note under the balance, a label above the period tabs) that the dashboard's Balance Global/Efectivo is a running total independent of the Hoy/Semana/Mes tabs, rather than rescoping it to a period — recomputing "balance since Monday" would answer a different, misleading question than "how much is in the drawer right now." K3: real green/red negative-amount coding added to the dashboard balance and Reports' Balance Neto (previously none / ink-tone-only), matching `.movement-amount--positive/--negative`. K4: labeled Liquidación's Facturado/Comisión columns (the commission figure had no label, easy to misread as revenue). K5: last-updated label + manual refresh button on the dashboard (Reports itself already re-fetches on every filter change, judged not to need a matching static-staleness indicator without a concrete report that it's confusing). 9 new tests, RED→GREEN, same stash-and-confirm discipline.
- **T17/SW-M5** (`134349d`) — investigated first, found the original finding's premise didn't hold (`PaymentStep.tsx` *chooses* a payment method before an order exists; `OrderPaymentSheet.tsx` *confirms* payment for an order whose method is already fixed — different steps of one lifecycle, not duplicate implementations). The one real structural duplicate is between `PaymentStep.tsx` and `DetailsStep.tsx` (the gasto Caja/Cta Bancaria picker) — exactly the file this task's own instruction protected as adjacent to M-4. Per that instruction's own "stop and ask rather than guess" clause, asked the owner directly; owner chose to close with the finding documented, no code touched.
- Verified live, not just via jsdom: seeded a real branch/admin/service/order/movement against the local stack, logged in through the actual dev server with Playwright (local chromium), clicked a real drill-down link end to end (landed on `/movements?range=today&method=transferencia` with the chip showing), confirmed the CSV button/dashboard note/refresh button/Liquidación labels all render with real data (toggled `commissions_enabled` live to confirm K4's conditional render), zero console/page errors.
- Full suite on `design/visual-refresh-round6` alone: **616/619** (3 pre-existing unrelated failures, same ones present on `main` since batch 1). Clean build.

**The two merges, both by this session, both pushed:**
1. `backend/audit-tickets-batch-2` → `main` (merge commit `913dff2`). One conflict, in this file's "Never addressed at all" section (both branches had touched it) — resolved by keeping `main`'s newer Backups line (the owner's 2026-09-25 decision to stay on the Free plan) together with batch 2's Production monitoring/alerting line; nothing else conflicted. Re-verified on the merged `main`: `npm run test:integration` **62/62**, `npm run test` **580/583** (3 pre-existing), clean build.
2. `design/visual-refresh-round6` → `design/visual-refresh` (merge commit `1c20087`). Clean, no conflicts (round 6 branched from `design/visual-refresh`'s exact tip and nothing else moved it meanwhile). Re-verified on the merged branch: `npm run test` **616/619**, clean build.

**What merging did and did NOT do, to be precise:**
- `main` now has M-4's migration and the monitoring scaffold's migration **in git**. Neither has been applied to the live production Supabase database — that's a separate, higher-stakes action (matching how batch 1's migrations needed their own explicit `supabase db push` pass, documented in that entry above) not taken here without it being asked for specifically.
- `design/visual-refresh` (the whole backoffice redesign) is **still not merged to `main`** — only round 6's 3 commits landed on top of the design branch's own existing tip. Whether/when the full redesign goes to `main` is a separate decision, not made here.
- This reconciliation pass (the Current status edits above this entry) covers what round 6 and batch 2 closed. It does **not** re-verify every other still-open Current status line — those stand as they were.

**Left explicitly for review, not resolved here — flagging deliberately rather than declaring this batch of work fully validated:**
- **No native/CLI-agent review** ("gentle-ai review", the RDD process this document's own History shows being run on essentially every other multi-commit batch — see the "RDD (native review)" entries throughout) has been run on batch 2, round 6, or either merge. Everything here was verified by this session's own means (RED→GREEN tests, `tsc --noEmit`, clean builds, and for round 6 a live Playwright smoke pass) — real verification, but not the same independent second look the project's own established practice calls for on work of this size. Worth a `gentle-ai review` pass on the accumulated diff before treating any of this as fully settled, same as prior batches got.
- Whether `design/visual-refresh` should now merge to `main` — not this session's call. **Update: the owner made this call the same day, see the unification entry below.**
- Whether/when to run M-4 and monitoring's migrations against production.
- SW-M5's re-scoping (`DetailsStep.tsx`, not `OrderPaymentSheet.tsx`) if the owner ever wants it revisited for real.

### 2026-09-25 (later the same day): `design/visual-refresh` unified into `main`

**Attribution, explicit per request, same as the entry above:** this entry — the pre-merge cleanup, the review pass, its 3 fixes, and the merge itself — was done by **Claude Code, web session**, continuing the same conversation. Not "gentle-ai"/"gentleman ai".

**Why now:** immediately after the reconciliation above, the owner asked directly whether to unify `design/visual-refresh` into `main`. Rather than merge on request alone, first ran a real dry-run (`git merge --no-commit --no-ff origin/design/visual-refresh` on a local `main`, then `git merge --abort`) to check for actual conflicts before recommending anything. It was clean (one trivial auto-merge in `closings.ts`), but the dry-run surfaced a real hygiene problem: 5 Playwright MCP debug artifacts (`.playwright-mcp/*.log`, `*.yml` — session output from a live smoke test, not source) were committed on `design/visual-refresh`, ungitignored. Reported both findings to the owner plus the still-open "no native review pass on this branch's own 19 commits" gap from the entry above, and proposed: clean the artifacts, run a real review pass, fix what it finds, then merge for real. Owner confirmed ("dale dale").

**1. Cleanup (`2f144d0`, `bb6c5c4`, on `design/visual-refresh`):** removed the 5 debug files via `git rm --cached` + local delete, added `.playwright-mcp/` to `.gitignore`.

**2. Review pass (this session's own `/code-review`, high effort, since the native "gentle-ai" tool was not invoked on any of this session's work per the attribution note above):** ran against the full `main..design/visual-refresh` diff (19 commits, the entire redesign). 4 findings, 3 real and fixed, 1 judgment call resolved without a functional change:
   - **Real bug (`ad36633`):** `orders/page.tsx` and `movements/page.tsx` seeded their drill-down filter state (`dateFilter`/`filter`/`methodFilter`) from `useSearchParams()` only inside a lazy `useState` initializer — which runs once at mount and never again. Next.js App Router updates `searchParams` in place without remounting when a `Link` navigates to an already-mounted route with only the query changed — exactly M-8's own drill-down pattern. A second Reports drill-down click while `/orders` or `/movements` was already open would silently keep the stale filter. Fixed with a `useEffect` re-deriving the filter from `searchParams` on every change; RED-verified (both new tests failed against the actual pre-fix code) before the fix, GREEN after.
   - **Real regression (`f032d4a`):** Reports' `.kpi-badge.up`/`.down` (green/red on the ingresosPct ↑/↓ badge) had been silently collapsed to one flat neutral color by the brutalist-glass CSS rewrite — a revenue gain and a revenue drop rendered identically. Restored using the same `#10b981`/`#f43f5e` pair SW-K3 already established elsewhere on the same page.
   - **Judgment call, no functional change (`8dd7119`):** the K1/K2 comment on the dashboard claimed the period tabs scope "ONLY the breakdown rows," but `loadRecentMovements` reads the same `view` state, so "Movimientos recientes" silently changes with the tabs too. Not changed — tying "recent" to the selected period is a reasonable, already-shipped-since-T8-T10 choice, not a bug — just corrected the comment to stop misrepresenting it.
   - All 3 fix commits pushed to `design/visual-refresh` (`bb6c5c4`..`8dd7119`) before merging.

**3. The merge (`016b773`, `design/visual-refresh` → `main`, `--no-ff`):** clean, no conflicts (confirmed identical to the earlier dry-run). Full verification on the merged `main`: `npm run test` → 621/624 (same 3 pre-existing unrelated failures tracked since batch 1 — `OrderCard.test.tsx`×2/`ServiceCard.test.tsx`×1, currency-formatting/locale). `npm run test:integration` → 62/62 (one run hit 4 failures in `rls-authorization.test.ts`'s storage cases with `502`s from an `unhealthy` `supabase_storage_villcan` container mid-suite — restarted the container, re-ran the same file in isolation, 46/46; re-ran the full integration suite clean after, 62/62 — infra flakiness under this sandbox's resource contention, the same class of issue this document's History already notes from 2026-09-22, not a regression). Clean `rm -f tsconfig.tsbuildinfo && rm -rf .next && npm run build`.

**What this does and does NOT mean:** `main` is now the single codebase — every Current status line above marked "in `main` since `016b773`" is accurate as of this commit, no exceptions. It does **not** mean a native "gentle-ai" review pass has run on this merge (this session's own `/code-review` pass is real verification but not the same second-model independent look the project's established practice uses elsewhere — still worth doing before treating the full redesign as fully validated). **Update, same day:** the M-4/monitoring migrations were applied to production shortly after this entry — see the deployment History entry below; that specific gap is closed.

### 2026-09-25 (same day, after unification): M-4 + monitoring migrations applied to production

**Attribution, same as the two entries above:** done by **Claude Code, web session**, on the owner's explicit instruction ("aplicalas") after being asked directly whether Vercel/Supabase were in sync and confirming they were not — production was still on the last batch-1 migration (`20260924050000_move_citext_to_extensions_schema`), two behind `main`.

Applied via the `Supabase` MCP tools against the `villcan` project (`vjgdtxryudoscumwsjhs`) — the CLI-based `supabase db push` used for batch 1 wasn't available this session (no `SUPABASE_ACCESS_TOKEN`/CLI login in this container). Checked `pg_cron` was actually available on this project first (`list_extensions`: present, not yet installed) before assuming the migration would even apply on a Free-plan project.

1. **`movements_expense_source_column`** (M-4): applied via `apply_migration`, exact SQL as the local migration file. Verified directly against production data, not just "no error returned": `expense_source` column + `movements_expense_source_scope` CHECK both exist; of the 4 real `gasto` rows in production, all 4 are backfilled (0 `null`), split 1 `cta_bancaria` / 3 `caja` — matching what the comment-tag substring check would have classified them as.
2. **`system_alerts_and_client_error_spike_check`** (monitoring): same method. Verified: `system_alerts` table exists with RLS enabled and the `system_alerts_select_admin` policy present; `cron.job` shows `client-error-spike-check` registered, `active=true`, schedule `*/15 * * * *`.
3. **Migration-history drift, same class of gotcha batch 1's own History entry warned about:** the MCP `apply_migration` tool auto-timestamps by wall-clock apply time, not the local repo's round-hour filename convention — it recorded these as `20260925192433`/`20260925192522` instead of `20260925000000`/`20260925010000`. Without a CLI session to run `supabase migration repair`, fixed it the equivalent way directly via SQL: `update supabase_migrations.schema_migrations set version = '<local id>' where version = '<phantom id>'` for both rows (metadata-only, `name` already matched, no schema/data touched). Verified after: `supabase_migrations.schema_migrations` now has exactly `20260925000000`/`20260925010000` with the matching names, no trace of the phantom timestamps — a future `supabase db push` from a properly authenticated session will see production and `main` as in sync, not attempt to reapply or conflict on these two.

**What this does NOT mean:** no notification channel exists for `system_alerts` yet (same limitation as always — nothing emails/Slacks/pages anyone off a spike, only direct SQL shows it); `MovementForm.tsx` still doesn't write `expense_source` (every new `gasto` row keeps landing via the comment-tag fallback until that UI pass happens); still no native "gentle-ai" review pass on any of today's work. Vercel's own deploy status for `main` (currently at `72b6f42`, on top of the unification merge `016b773`) could not be checked from this session (no Vercel token/connector) — the owner should confirm in the Vercel dashboard.
