-- NOT APPLIED YET. Reviewed by the orchestrator by hand before running against
-- remote (project vjgdtxryudoscumwsjhs) — do NOT `supabase db push` this from
-- an agent session.
--
-- Adds a Supabase Storage bucket so admins can upload a service image file
-- directly (from ServiceForm / services/[id]/edit) instead of only being able
-- to paste a link to an image already hosted elsewhere.
--
-- Bucket is PUBLIC FOR READ (storage.buckets.public = true) so the storefront
-- can render images via a plain public URL (getPublicUrl), with no signed
-- URLs / auth round-trip needed on the public catalog page.
--
-- IMPORTANT — read this before touching storage policies again in this repo:
-- 20260831160000_fix_anon_execute_grants.sql documents a REAL incident where a
-- policy that looked correct (relying on a SECURITY DEFINER function with an
-- implicit `TO public` grant) silently broke 100% of anonymous storefront
-- access, and it went unnoticed because every verification pass was done
-- while authenticated (authenticated sessions have EXECUTE on the helper
-- functions; anon did not). The SELECT policy below intentionally avoids that
-- whole class of bug: it does NOT call any helper function — it only compares
-- `bucket_id` to a literal, a plain column comparison anon can always
-- evaluate. Still, the orchestrator MUST verify this with a real anon-key
-- curl request (no session cookie) against the storage REST endpoint before
-- trusting it — an authenticated/service-role test would mask a broken
-- policy exactly like it did last time.

-- 1) Bucket. `id` and `name` both set to the same slug per Supabase convention;
--    `public = true` is what makes storage.objects readable via a plain
--    public URL (https://<project>.supabase.co/storage/v1/object/public/...)
--    without needing a signed URL.
insert into storage.buckets (id, name, public)
values ('service-images', 'service-images', true)
on conflict (id) do nothing;

-- 2) Policies on storage.objects, scoped to this bucket only via `bucket_id`.
--    storage.objects already has RLS enabled by Supabase's storage extension
--    itself (not something this migration needs to turn on).

-- Anyone (including anon, i.e. the public storefront with no session) can
-- read files in this bucket. This mirrors `services_public_select` /
-- `branches_public_select_storefront` from earlier migrations: no helper
-- function call, so there's no EXECUTE-grant trap like the one in
-- 20260831160000_fix_anon_execute_grants.sql.
create policy "service_images_public_select"
on storage.objects for select
to public
using (bucket_id = 'service-images');

-- Only logged-in users can upload/replace/delete. Deliberately NOT scoped by
-- branch/role — services are mostly global in this business and this is an
-- accepted simplification (per product decision), same trust level as
-- `services_admin_insert`/`_update` today effectively require being logged
-- in as an admin from the app's own UI gating.
create policy "service_images_authenticated_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'service-images');

create policy "service_images_authenticated_update"
on storage.objects for update
to authenticated
using (bucket_id = 'service-images')
with check (bucket_id = 'service-images');

create policy "service_images_authenticated_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'service-images');

-- Rollback (manual):
--   drop policy if exists "service_images_authenticated_delete" on storage.objects;
--   drop policy if exists "service_images_authenticated_update" on storage.objects;
--   drop policy if exists "service_images_authenticated_insert" on storage.objects;
--   drop policy if exists "service_images_public_select" on storage.objects;
--   delete from storage.buckets where id = 'service-images';
