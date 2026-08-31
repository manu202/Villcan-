-- REQUIERE: aplicar sobre el baseline real (supabase db pull -> 0001_baseline.sql)
-- antes de correr esta migracion. NO fue aplicada contra el remoto todavia.
-- Ver: sdd/baseline-schema-and-user-fixes/design (Engram, project villcan).
--
-- Fixes:
--   Bug #4 - profiles.role era una segunda fuente de verdad de autorizacion,
--            muerta en el codigo (la real es user_branch_access.role).
--   Bug #6 - movements/services solo chequeaban auth.role()='authenticated',
--            sin distinguir viewer de admin/barber -> un viewer podia escribir.
--   Bug #7 - busqueda de email case-sensitive (profiles.email como text plano).
--   Bug #8 - nada a nivel DB impedia dejar una sucursal sin administradores.
--
-- Rollback (manual, comentado abajo de cada seccion) si algo sale mal en prod.

-- ============================================================================
-- Bug #4: profiles.role deja de existir. handle_new_user (definida en el
-- baseline) todavia insertaba 'role' en cada alta nueva -- se redefine ANTES
-- de dropear la columna para no romper el signup.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  );
  return new;
end;
$$;

alter table public.profiles drop column if exists role;

-- DOWN (manual):
--   alter table public.profiles add column role text check (role in ('admin','barber')) default 'barber';
--   create or replace function public.handle_new_user() returns trigger language plpgsql
--     security definer set search_path to 'public' as $$
--     begin
--       insert into public.profiles (id, email, full_name, role)
--       values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'barber');
--       return new;
--     end;
--     $$;

-- ============================================================================
-- Bug #7: email case-insensitive via citext.
-- ============================================================================
create extension if not exists citext;
alter table public.profiles alter column email type citext;

-- DOWN (manual): alter table public.profiles alter column email type text;

-- ============================================================================
-- Bug #6: RLS de movements/services por rol de sucursal, usando
-- is_branch_admin()/user_branch_access en lugar de auth.role()='authenticated'.
-- Asume que has_branch_access(uuid) e is_branch_admin(uuid) ya existen
-- (definidas en 0001_baseline.sql, SECURITY DEFINER).
-- ============================================================================
drop policy if exists "movements_select_authenticated" on public.movements;
drop policy if exists "movements_insert_authenticated" on public.movements;
drop policy if exists "movements_update_authenticated" on public.movements;

create policy "movements_select_branch_access" on public.movements
  for select using (public.has_branch_access(branch_id));

create policy "movements_write_admin_or_barber" on public.movements
  for insert with check (
    exists (
      select 1 from public.user_branch_access
      where branch_id = movements.branch_id
        and user_id = auth.uid()
        and role in ('admin', 'barber')
    )
  );

create policy "movements_update_admin_or_barber" on public.movements
  for update using (
    exists (
      select 1 from public.user_branch_access
      where branch_id = movements.branch_id
        and user_id = auth.uid()
        and role in ('admin', 'barber')
    )
  );

drop policy if exists "services_select_all" on public.services;
drop policy if exists "services_admin_insert" on public.services;
drop policy if exists "services_admin_update" on public.services;

create policy "services_select_branch_access" on public.services
  for select using (branch_id is null or public.has_branch_access(branch_id));

create policy "services_write_admin_or_barber" on public.services
  for insert with check (
    branch_id is null
    or exists (
      select 1 from public.user_branch_access
      where branch_id = services.branch_id
        and user_id = auth.uid()
        and role in ('admin', 'barber')
    )
  );

create policy "services_update_admin_or_barber" on public.services
  for update using (
    branch_id is null
    or exists (
      select 1 from public.user_branch_access
      where branch_id = services.branch_id
        and user_id = auth.uid()
        and role in ('admin', 'barber')
    )
  );

-- DOWN (manual): recrear las policies "*_authenticated" originales de supabase-schema.sql (ya borrado, ver git history).

-- ============================================================================
-- Bug #8: trigger que impide dejar una sucursal sin administradores.
-- FOR UPDATE sobre las filas admin restantes serializa el chequeo frente a
-- borrados/downgrades concurrentes (cierra la race condition).
-- ============================================================================
create or replace function public.prevent_last_admin_removal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (tg_op = 'DELETE' and old.role = 'admin')
     or (tg_op = 'UPDATE' and old.role = 'admin' and new.role <> 'admin') then
    perform 1 from public.user_branch_access
      where branch_id = old.branch_id
        and role = 'admin'
        and user_id <> old.user_id
      for update;
    if not found then
      raise exception 'La sucursal quedaria sin administrador'
        using errcode = 'VC423';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_prevent_last_admin on public.user_branch_access;
create trigger trg_prevent_last_admin
  before delete or update on public.user_branch_access
  for each row execute function public.prevent_last_admin_removal();

-- DOWN (manual):
--   drop trigger if exists trg_prevent_last_admin on public.user_branch_access;
--   drop function if exists public.prevent_last_admin_removal();
