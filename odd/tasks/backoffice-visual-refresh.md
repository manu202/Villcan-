# Backoffice visual refresh

## Objective
Replace the generic/flat visual language of the Villcan backoffice with the "brutalist glass" direction approved in the design canvas (https://claude.ai/artifact/RWpdkyzGvjFEj2zy52rs6Y): warm cream surface, saturated orange accent, hard 2px ink borders, hard offset shadows (no blur), glass backdrop-blur on cards, Archivo Black for big numbers, Space Grotesk for UI text.

## Why
Current backoffice reads as generic/"AI slop" (flat hairline lists, no elevation system, huge dead whitespace on desktop). Storefront templates and now the backoffice have an approved direction; this task implements it in real code. Full audit and decision trail: Engram topic `discovery/villcan-visual-refresh-current-state-audit`.

## Scope
- In scope: `globals.css` tokens, `AppSheet.tsx`, `OrderCard`, `MovementCard`, `ContactCard`, `ServiceCard`, the container screens that use them (Caja/`/`, Pedidos, Movimientos, Contactos, Catálogo).
- Out of scope (separate effort): Reportes charts (needs a charting lib, not just reskin), storefront templates (already distinct, not part of the complaint), the Spa Bienestar vertical-mismatch bug (unrelated product bug, logged separately), dark mode (light-first, dark theme follow-up pass later).

## Constraints
- Keep the per-component inline `<style>` convention — no CSS modules, no Tailwind, per AGENTS.md.
- Keep every existing test green (`OrderCard.test.tsx`, `MovementCard.test.tsx`, `ContactCard.test.tsx`, `ServiceCard.test.tsx` already exist). This is a visual reskin, not a behavior change — no new RED tests expected; existing suites are the regression guard.
- TDD mode: Strict TDD is enabled project-wide, but this task changes styling only, not logic/behavior — resolution: run existing test suites after each component change instead of writing new tests, since there's no new behavior to drive with RED/GREEN.
- Branch: `design/visual-refresh` worktree, kept synced to `main` between sessions (last sync: `92fe0d2`).

## Approved token spec (from the canvas, light mode only for now)
```
--accent: #E85D2C
--ink: #241B16
--ink-secondary: #6B5D52
--surface-glass: rgba(255,255,255,0.6)
--border-hard: 2px solid rgba(36,27,22,0.85)
--shadow-hard: 6px 6px 0 rgba(36,27,22,0.85)
--radius-card: 16px
--radius-control: 10px
--font-display: 'Archivo Black' (big numbers only)
--font-sans: 'Space Grotesk' (everything else) — font choice flagged by user as likely to change later, kept as a single token so a swap is one line
```

## Tasks
- [x] T1 — Add the new tokens to `globals.css` (light theme only), load Archivo Black + Space Grotesk via `next/font/google`. Route: direct inline (1 file, already understood).
- [x] T2 — Reskin `AppSheet.tsx` (bottom sheet + desktop modal) with the hard border/shadow/radius system. Route: direct inline (1 file).
- [x] T3 — Reskin `OrderCard`, `MovementCard`, `ContactCard`, `ServiceCard` (4 components). Route: delegated direct (writer trigger: 2+ non-trivial files).
- [x] T4 — Reskin container screens (Caja `/`, `/orders`, `/orders/new`, `/movements`, `/contacts`, `/services`) to the new card/list layout, remove the old flat hairline pattern. Route: delegated direct.
- [ ] T5 — Visual verification pass: run dev server, screenshot each touched screen, compare against the canvas artboards.

## Progress
- 2026-09-24: Task file created. Design direction approved by user (Caja, Pedidos, Catálogo, Reportes artboards). Starting T1.
- 2026-09-24: T1 done — `--refresh-*` tokens added to globals.css, Archivo Black + Space Grotesk loaded via next/font/google in layout.tsx. `npm test` 580/580 green, `tsc --noEmit` shows only pre-existing unrelated errors. Commit `276a0ea`.
- 2026-09-24: T2 done — `AppSheet.tsx` bottom sheet + desktop modal reskinned with `--refresh-*` tokens (hard border, offset shadow, glass close button, handle, dividers). `npm test` 580/580 green, `tsc --noEmit` shows only pre-existing unrelated errors (none touching AppSheet.tsx).
- 2026-09-24: RDD review (native, medium tier) on T2 commit `bd6d12e` came back approved with 3 non-blocking findings. Fixed the real one inline: close button had shrunk to 32x32px, below the 44px touch-target minimum — restored to 44x44px, icon stays visually small (16px, strokeWidth 2.8) inside it. `npm test` 580/580 green. Two findings left as noted follow-ups (out of this task's scope): dark-mode contrast on `--refresh-bg` (dark mode is a separate future pass per task Scope), and `--font-display` not namespaced in `layout.tsx` (storefront-wide exposure risk, cosmetic naming fix).
- 2026-09-24: T3 done (delegated) — `OrderCard`, `MovementCard`, `ContactCard`, `ServiceCard` reskinned with `--refresh-*` tokens (glass background, hard border/shadow-sm, refresh radius/font), following the AppSheet defensive-fallback pattern. Semantic colors (order status badges, action buttons, movement amount sign, WhatsApp brand green) intentionally left untouched — collapsing them to the accent token would destroy their meaning. No touch targets reduced. `npm test` 580/580 green (verified independently, not just from the delegate's report), `tsc --noEmit` no new errors in the 4 files.
- 2026-09-24: RDD review (native, medium tier) on the accumulated T1+T2+T3 candidate came back approved, 7 non-blocking findings, all informational. Real ones worth tracking: (1) dark-mode contrast regressions in `OrderCard.tsx` fee input/notify button/fee-cancel button (out of scope — dark mode is an explicit future pass), (2) `--font-display` un-namespaced in `layout.tsx` (same known follow-up already logged after T2's review), (3) Space Grotesk only loaded at 500/600/700 so default-weight (400) text falls back bolder than intended, (4) ContactCard's new hard border/shadow will visibly overlap between list rows until T4 adds card-gap spacing to the container screens (expected — T4 fixes this), (5) task-file bug: T1's checkbox was unchecked despite being done — fixed inline, now checked.
- 2026-09-24: T4 done (delegated) — reskinned Caja (`/`), Pedidos (`/orders`), new-order flow (`/orders/new`), Movimientos (`/movements`), Contactos (`/contacts`), Catálogo (`/services`): page titles/subtitles, filter tabs, search/action buttons, empty states, and converted the old shared-background hairline dividers (`gap:1px; background:var(--border)`) to gapped card lists (`gap: 8px`) on Movimientos and Contactos, matching the T3 card treatment — resolves review finding (4) from the prior entry. `movements/page.tsx` renders its own inline row markup rather than the reskinned `MovementCard` component (pre-existing gap, unrelated to this task) — restyled the markup in place instead of swapping components, since that would be a structural change out of scope. `orders/new/page.tsx` uses a separate, unreskinned `storefront/ServiceCard.tsx` — left its hairline list untouched since its card has no border/shadow to conflict with. No component files touched, no behavior/markup-structure changes, all touch targets ≥44px. `npm test` 580/580 green (verified independently), `tsc --noEmit` no new errors in the 6 files.

## Checks
- `npm test` (or the project's configured runner) green after each component/screen change.
- Visual comparison against canvas artboards (manual, via Playwright screenshots) before calling the task done.
