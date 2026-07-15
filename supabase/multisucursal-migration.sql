-- ============================================
-- Villcan Multisucursal Migration
-- ============================================

-- 1. Create branches table
CREATE TABLE IF NOT EXISTS public.branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default branch
INSERT INTO public.branches (id, name, address) 
VALUES ('00000000-0000-0000-0000-000000000001', 'Sucursal Central', 'Asunción')
ON CONFLICT DO NOTHING;

-- 2. Create user_branch_access table
CREATE TABLE IF NOT EXISTS public.user_branch_access (
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('admin', 'barber', 'viewer')) DEFAULT 'barber',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, branch_id)
);

-- 3. Add branch_id to services
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);
UPDATE public.services SET branch_id = NULL WHERE branch_id IS NULL;

-- 4. Add branch_id to movements
ALTER TABLE public.movements ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);
UPDATE public.movements SET branch_id = '00000000-0000-0000-0000-000000000001' WHERE branch_id IS NULL;

-- 5. Create indexes
CREATE INDEX IF NOT EXISTS idx_movements_branch_id ON public.movements(branch_id);
CREATE INDEX IF NOT EXISTS idx_services_branch_id ON public.services(branch_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_access_user ON public.user_branch_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_access_branch ON public.user_branch_access(branch_id);

-- 6. Insert initial access for current user (will be replaced by trigger later)
-- This is a placeholder - in real app, admin creates branches first

-- 7. Update RLS policies

-- Drop old policies
DROP POLICY IF EXISTS movements_select_authenticated ON public.movements;
DROP POLICY IF EXISTS movements_insert_authenticated ON public.movements;
DROP POLICY IF EXISTS services_select_all ON public.services;
DROP POLICY IF EXISTS services_admin_insert ON public.services;
DROP POLICY IF EXISTS services_admin_update ON public.services;

-- Movements: users see only movements from branches they have access to
CREATE POLICY "movements_select_branch" ON public.movements
  FOR SELECT USING (
    branch_id IN (
      SELECT branch_id FROM public.user_branch_access
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "movements_insert_branch" ON public.movements
  FOR INSERT WITH CHECK (
    branch_id IN (
      SELECT branch_id FROM public.user_branch_access
      WHERE user_id = auth.uid()
    )
  );

-- Services: users see global services OR services from their branches
CREATE POLICY "services_select_branch" ON public.services
  FOR SELECT USING (
    branch_id IS NULL OR
    branch_id IN (
      SELECT branch_id FROM public.user_branch_access
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "services_insert_branch" ON public.services
  FOR INSERT WITH CHECK (
    branch_id IS NULL OR
    branch_id IN (
      SELECT branch_id FROM public.user_branch_access
      WHERE user_id = auth.uid()
    )
  );

-- Branches: users can see branches they have access to
CREATE POLICY "branches_select" ON public.branches
  FOR SELECT USING (
    id IN (
      SELECT branch_id FROM public.user_branch_access
      WHERE user_id = auth.uid()
    )
  );

-- User branch access: users can see their own access
CREATE POLICY "user_branch_access_select" ON public.user_branch_access
  FOR SELECT USING (user_id = auth.uid());
