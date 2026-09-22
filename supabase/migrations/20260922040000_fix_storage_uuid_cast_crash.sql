-- =============================================================================
-- fix_storage_uuid_cast_crash
--
-- 20260922030000 cast (storage.foldername(name))[1] directly to uuid inside
-- the branch-scoped storage policies. That's safe for new uploads (their
-- path is always "<branch_id>/..."), but the bucket already contained
-- legacy objects from before this migration existed — found while
-- verifying against production: a real object at
-- "taitashu/menu-bbq.jpg" (folder segment "taitashu", not a UUID) and
-- another with a flat, no-folder filename. Casting "taitashu"::uuid raises
-- a Postgres error, not a graceful RLS denial — any query whose RLS
-- evaluation touches that row (a list, an update/delete check on a
-- different object in the same batch, etc.) would fail outright, not just
-- correctly deny access to it.
--
-- Fix: a small SECURITY INVOKER helper that attempts the cast and returns
-- NULL instead of raising on invalid input, used everywhere the previous
-- migration cast directly.
-- =============================================================================

create or replace function public._safe_branch_uuid(p_text text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p_text::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

drop policy if exists "service_images_branch_insert" on storage.objects;
create policy "service_images_branch_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'service-images'
  and exists (
    select 1 from public.user_branch_access
    where branch_id = public._safe_branch_uuid((storage.foldername(name))[1])
      and user_id = auth.uid()
      and role in ('admin', 'user')
  )
);

drop policy if exists "service_images_branch_update" on storage.objects;
create policy "service_images_branch_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'service-images'
  and exists (
    select 1 from public.user_branch_access
    where branch_id = public._safe_branch_uuid((storage.foldername(name))[1])
      and user_id = auth.uid()
      and role in ('admin', 'user')
  )
)
with check (
  bucket_id = 'service-images'
  and exists (
    select 1 from public.user_branch_access
    where branch_id = public._safe_branch_uuid((storage.foldername(name))[1])
      and user_id = auth.uid()
      and role in ('admin', 'user')
  )
);

drop policy if exists "service_images_branch_delete" on storage.objects;
create policy "service_images_branch_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'service-images'
  and public._safe_branch_uuid((storage.foldername(name))[1]) is not null
  and public.is_branch_admin(public._safe_branch_uuid((storage.foldername(name))[1]))
);

-- =============================================================================
-- DOWN (manual):
-- =============================================================================
-- Recreate the direct-cast policies from 20260922030000, drop
-- public._safe_branch_uuid(text).
