-- A-7: profiles_update_own had no column restriction and no WITH CHECK -- a
-- user could rewrite their own profiles.email, which the invite route
-- (src/app/api/users/invite/route.ts) uses to look up accounts by email.
-- No app UI updates profiles today (confirmed via grep), so this closes a
-- latent RLS surface, not a currently-used one.
--
-- Fix: restrict the UPDATE grant to full_name only (column-level privilege,
-- Postgres-native), and rebuild the policy with an explicit `to authenticated`
-- + matching WITH CHECK (defense-in-depth per the Supabase security skill --
-- USING alone lets a row through on read of the OLD row; WITH CHECK re-checks
-- the NEW row, which matters here even though `id` can't practically be
-- reassigned to another real profiles.id due to the primary key).
--
-- Idempotent: safe to run against production regardless of prior state.

revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update
  to authenticated
  using ( (select auth.uid()) = id )
  with check ( (select auth.uid()) = id );
