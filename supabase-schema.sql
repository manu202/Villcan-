-- Villcan Database Schema
-- Run this in Supabase SQL Editor to set up the database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (extends Supabase Auth users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT CHECK (role IN ('admin', 'barber')) DEFAULT 'barber',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Services table
CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  price INTEGER NOT NULL, -- stored in guaranies (no decimals)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

-- Contacts table
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  ci TEXT, -- cédula de identidad
  phone TEXT,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Movements table
CREATE TABLE IF NOT EXISTS public.movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT CHECK (type IN ('servicio', 'gasto', 'apertura', 'cierre')) NOT NULL,
  amount_charged INTEGER, -- price of service (only for tipo=servicio)
  income INTEGER DEFAULT 0, -- money coming in
  expense INTEGER DEFAULT 0, -- money going out (change, expenses, etc.)
  payment_method TEXT CHECK (payment_method IN ('efectivo', 'transferencia', 'pos')),
  contact_id UUID REFERENCES public.contacts(id),
  service_id UUID REFERENCES public.services(id),
  user_id UUID REFERENCES public.profiles(id) NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_movements_created_at ON public.movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_type ON public.movements(type);
CREATE INDEX IF NOT EXISTS idx_movements_payment_method ON public.movements(payment_method);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON public.contacts(full_name);

-- Row Level Security (RLS) - Enable for security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movements ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Profiles: users can read all profiles, but only update their own
CREATE POLICY "profiles_select_all" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Services: everyone can read, only admin can modify
CREATE POLICY "services_select_all" ON public.services
  FOR SELECT USING (true);

CREATE POLICY "services_admin_insert" ON public.services
  FOR INSERT WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

CREATE POLICY "services_admin_update" ON public.services
  FOR UPDATE USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- Contacts: authenticated users can read and write
CREATE POLICY "contacts_select_authenticated" ON public.contacts
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "contacts_insert_authenticated" ON public.contacts
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "contacts_update_authenticated" ON public.contacts
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "contacts_delete_authenticated" ON public.contacts
  FOR DELETE USING (auth.role() = 'authenticated');

-- Movements: authenticated users can read all and insert
CREATE POLICY "movements_select_authenticated" ON public.movements
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "movements_insert_authenticated" ON public.movements
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "movements_update_authenticated" ON public.movements
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'barber'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Insert default services
INSERT INTO public.services (name, price) VALUES
  ('Corte clásico', 40000),
  ('Degradado', 45000),
  ('Corte niño', 35000),
  ('Barba', 30000),
  ('Combo c,b,c', 70000),
  ('Corte y ceja', 55000),
  ('Corte y barba', 60000),
  ('Corte clásico y barba', 60000)
ON CONFLICT DO NOTHING;