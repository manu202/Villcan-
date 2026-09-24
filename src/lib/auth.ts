'use client';

import { createClient } from '@/lib/supabase/client';

export async function getUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function signInWithPassword(email: string, password: string) {
  const supabase = createClient();
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  const supabase = createClient();
  // A-13: the default scope is 'global' (signs out every session on every
  // device). A staff member tapping "cerrar sesión" on their own phone does
  // not expect that to also kick out the register terminal at the counter.
  return supabase.auth.signOut({ scope: 'local' });
}

export async function getCurrentUserId(): Promise<string | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}