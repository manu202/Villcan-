-- Ensures the singleton business_settings row always exists after all prior
-- migrations (which add business_name and staff_label) have been applied.
-- ON CONFLICT DO NOTHING makes this idempotent — safe to run against a DB
-- that already has the row.

insert into public.business_settings (id, brand_color, services_label, staff_label, business_name)
values (1, 'slate', 'Servicios', 'Personal', '')
on conflict (id) do nothing;

-- Allow admins to INSERT (needed for upsert when no row exists yet; the seed
-- above covers normal flow but the policy is required for the upsert to work
-- safely in any environment where the seed hasn't run).
create policy "business_settings_insert_admin"
  on public.business_settings
  for insert
  with check (public.is_admin_anywhere());
