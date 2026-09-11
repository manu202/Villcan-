-- =============================================================================
-- services_delete_branch_scope
--
-- Restringe el DELETE de servicios al branch propio del admin.
-- La policy anterior "services_admin_delete" usaba is_admin_anywhere() sin
-- filtro de branch, permitiendo a un admin de tenant A borrar servicios de B.
--
-- Nueva policy:
--   - Servicios globales (branch_id IS NULL): sólo admins con is_admin_anywhere()
--     (mantiene simetría con services_admin_insert y services_admin_update).
--   - Servicios de branch (branch_id NOT NULL): sólo el admin de esa branch.
--
-- is_branch_admin(branch uuid) existe desde baseline.sql.
-- =============================================================================

drop policy if exists "services_admin_delete" on public.services;

create policy "services_delete_branch_admin"
  on public.services
  for delete
  to authenticated
  using (
    (branch_id is null and public.is_admin_anywhere())
    or public.is_branch_admin(branch_id)
  );

-- =============================================================================
-- DOWN (manual):
-- =============================================================================
-- drop policy if exists "services_delete_branch_admin" on public.services;
-- create policy "services_admin_delete" on public.services for delete using (public.is_admin_anywhere());
