-- Fix urgente: la migracion anterior (20260831120001_user_fixes.sql) intento
-- borrar policies de movements con nombres viejos ("movements_select_authenticated",
-- etc, del supabase-schema.sql local ya borrado) que NO coinciden con los nombres
-- reales en produccion ("movements_insert", "movements_select"). El push mostro
-- "NOTICE ... does not exist, skipping" -- las policies reales viejas quedaron
-- vivas conviviendo con las nuevas. En RLS, policies permisivas se combinan con
-- OR, asi que el bug #6 (un viewer podia insertar movimientos) NO quedaba
-- resuelto: la policy real vieja "movements_insert" seguia permitiendo insertar
-- a cualquiera con has_branch_access, sin filtrar por rol.
--
-- Este fix borra las policies reales viejas y ajusta la nueva de SELECT para
-- no ampliar la visibilidad mas alla de lo que ya habia (admin ve todo, el
-- resto solo sus propios movimientos) -- el objetivo era sacarle el permiso
-- de escritura a viewer, no cambiar que puede leer cada rol.

drop policy if exists "movements_insert" on public.movements;
drop policy if exists "movements_select" on public.movements;

drop policy if exists "movements_select_branch_access" on public.movements;
create policy "movements_select_branch_access" on public.movements
  for select using (
    public.is_branch_admin(branch_id)
    or (user_id = auth.uid() and public.has_branch_access(branch_id))
  );

-- movements_write_admin_or_barber / movements_update_admin_or_barber (creadas
-- en 20260831120001_user_fixes.sql) ya cubren correctamente INSERT/UPDATE
-- restringido a admin/barber -- no hace falta tocarlas.

-- DOWN (manual):
--   drop policy if exists "movements_select_branch_access" on public.movements;
--   drop policy if exists "movements_write_admin_or_barber" on public.movements;
--   drop policy if exists "movements_update_admin_or_barber" on public.movements;
--   create policy "movements_insert" on public.movements for insert with check (
--     (user_id = auth.uid()) and public.has_branch_access(branch_id)
--     and ((type <> all (array['apertura','cierre'])) or public.is_branch_admin(branch_id))
--   );
--   create policy "movements_select" on public.movements for select using (
--     public.is_branch_admin(branch_id) or ((user_id = auth.uid()) and public.has_branch_access(branch_id))
--   );
