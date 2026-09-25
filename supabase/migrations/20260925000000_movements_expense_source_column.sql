-- M-4: cash/bank split for gasto (expense) movements was only ever encoded
-- as a free-text tag inside `comment` (MovementForm.buildFinalComment
-- appends "[Cta Bancaria]" or "[Caja]"), parsed via a single shared
-- isBankTagged() substring check in src/lib/cashBalance.ts. The button-group
-- UI control for this already exists (fuentes = ['Caja', 'Cta Bancaria'] in
-- movement-form/shared.ts) -- the gap was purely a missing column, not a UI
-- gap (confirmed by design/visual-refresh, 6ba02e1, which re-scoped M-4 to
-- backend-only for exactly this reason).
--
-- Adds a nullable `expense_source` column, scoped to `gasto` movements only
-- via a same-row CHECK, and backfills it for every existing gasto row from
-- the same comment tag isBankTagged() already parses. `comment` itself is
-- left untouched.
--
-- This migration does NOT wire MovementForm.tsx to write the new column --
-- that's a UI change, out of scope here (see odd/tasks/villcan-audit.md).
-- Until that lands, every NEW gasto row will still have expense_source =
-- NULL and keep being classified from its comment tag by the
-- application-level fallback (src/lib/cashBalance.ts's isBankTagged: column
-- first, comment tag second -- see that file for the updated logic).

alter table public.movements
  add column expense_source text;

alter table public.movements
  add constraint movements_expense_source_scope
  check (
    expense_source is null
    or (type = 'gasto' and expense_source in ('caja', 'cta_bancaria'))
  );

-- Idempotent, re-runnable backfill: classifies every gasto row whose
-- expense_source is still unset, from the exact same substring check
-- isBankTagged() uses (comment LIKE '%Cta Bancaria%'), so historical rows
-- classify identically to how the app already reads them today. Exposed as
-- a function (not just an inline UPDATE) so it can be re-run later as a
-- maintenance step against any row the not-yet-wired UI keeps inserting
-- with expense_source unset, and so tests can exercise it directly against
-- synthetic rows without needing a fresh migration/reset each time.
create or replace function public._backfill_movements_expense_source()
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.movements
    set expense_source = case
      when comment like '%Cta Bancaria%' then 'cta_bancaria'
      else 'caja'
    end
    where type = 'gasto'
      and expense_source is null;
end;
$$;

revoke execute on function public._backfill_movements_expense_source() from public;

select public._backfill_movements_expense_source();

-- DOWN (manual):
--   drop function if exists public._backfill_movements_expense_source();
--   alter table public.movements drop constraint if exists movements_expense_source_scope;
--   alter table public.movements drop column if exists expense_source;
