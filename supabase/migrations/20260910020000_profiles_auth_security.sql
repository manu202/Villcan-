-- =============================================================================
-- profiles_auth_security
--
-- Elimina la exposición de emails y datos de staff a usuarios anónimos.
-- La policy "profiles_select_all" usaba USING (true) sin restricción de rol,
-- por lo que anon podía leer todos los perfiles incluyendo emails.
--
-- El único lector server-side es src/app/api/users/invite/route.ts:72 que
-- usa el service_role key — no se ve afectado por este cambio.
-- =============================================================================

drop policy if exists "profiles_select_all" on public.profiles;

create policy "profiles_select_authenticated"
  on public.profiles
  for select
  to authenticated
  using (true);

-- =============================================================================
-- DOWN (manual):
-- =============================================================================
-- drop policy if exists "profiles_select_authenticated" on public.profiles;
-- create policy "profiles_select_all" on public.profiles for select using (true);
