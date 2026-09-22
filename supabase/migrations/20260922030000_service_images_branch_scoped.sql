-- =============================================================================
-- service_images_branch_scoped
--
-- Applies and fixes the service-images Storage feature (audit findings S-1,
-- S-4). S-1: the original migration (20260831170000) was written but never
-- applied to production. S-4: as written, its insert/update/delete policies
-- only checked `bucket_id = 'service-images'`, with no branch scoping at
-- all — any authenticated user from any branch could overwrite or delete
-- any other branch's image files (explicitly called out as an "accepted
-- simplification" in that migration, written when services were assumed to
-- be mostly global; the app has since consistently moved to per-branch
-- isolation everywhere else — see 20260910030000_services_delete_branch_scope.sql,
-- 20260910010000_contacts_branch_isolation.sql — so that assumption no
-- longer holds and images should match).
--
-- Owner decision 2026-09-22: activate this feature now, fixed.
--
-- Approach: scope objects by folder-per-branch (Supabase's standard
-- multi-tenant Storage pattern). Object paths become
-- "<branch_id>/<uuid>-<filename>" instead of a flat "<uuid>-<filename>";
-- storage.foldername(name) splits the path, so (storage.foldername(name))[1]
-- is the branch_id segment. Mirrors the same role checks services itself
-- uses: insert/update require admin-or-user of that branch
-- (services_update_admin_or_user), delete requires branch admin
-- (services_delete_branch_admin).
--
-- Public SELECT stays unscoped (bucket_id only) — images are meant to be
-- publicly visible on the storefront regardless of branch, same as
-- service_images_public_select already was; no helper-function call in
-- that policy, so it isn't affected by the anon EXECUTE-grant trap
-- documented in 20260831160000_fix_anon_execute_grants.sql.
-- =============================================================================

-- 1) Bucket (idempotent — the ON CONFLICT DO NOTHING means this is a no-op
--    if 20260831170000 already ran; safe either way).
insert into storage.buckets (id, name, public)
values ('service-images', 'service-images', true)
on conflict (id) do nothing;

-- 2) Replace the unscoped write policies with branch-scoped ones.
drop policy if exists "service_images_authenticated_insert" on storage.objects;
drop policy if exists "service_images_authenticated_update" on storage.objects;
drop policy if exists "service_images_authenticated_delete" on storage.objects;

-- SELECT policy is unchanged/idempotent to (re)create in case this runs on
-- a database where 20260831170000 never applied at all.
drop policy if exists "service_images_public_select" on storage.objects;
create policy "service_images_public_select"
on storage.objects for select
to public
using (bucket_id = 'service-images');

create policy "service_images_branch_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'service-images'
  and exists (
    select 1 from public.user_branch_access
    where branch_id = ((storage.foldername(name))[1])::uuid
      and user_id = auth.uid()
      and role in ('admin', 'user')
  )
);

create policy "service_images_branch_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'service-images'
  and exists (
    select 1 from public.user_branch_access
    where branch_id = ((storage.foldername(name))[1])::uuid
      and user_id = auth.uid()
      and role in ('admin', 'user')
  )
)
with check (
  bucket_id = 'service-images'
  and exists (
    select 1 from public.user_branch_access
    where branch_id = ((storage.foldername(name))[1])::uuid
      and user_id = auth.uid()
      and role in ('admin', 'user')
  )
);

create policy "service_images_branch_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'service-images'
  and public.is_branch_admin(((storage.foldername(name))[1])::uuid)
);

-- =============================================================================
-- DOWN (manual):
-- =============================================================================
-- drop policy if exists "service_images_branch_delete" on storage.objects;
-- drop policy if exists "service_images_branch_update" on storage.objects;
-- drop policy if exists "service_images_branch_insert" on storage.objects;
-- (recreate the unscoped 20260831170000 policies if truly needed)
