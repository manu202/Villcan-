import { createClient } from '@/lib/supabase/client';
import type { BusinessSettings } from '@/types';

// Safe, current-behavior-preserving defaults. Used as fallback by SettingsContext
// whenever the fetch hasn't resolved yet or fails, so nothing ever breaks.
export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  id: 1,
  commissions_enabled: false,
  default_commission_pct: 0,
  split_payment_enabled: false,
  mandatory_arqueo_enabled: false,
  inventory_enabled: false,
  services_label: 'Servicios',
  brand_color: 'slate',
  updated_at: '',
  updated_by: null,
};

export async function getBusinessSettings(): Promise<BusinessSettings> {
  const supabase = createClient();

  // Skip the request entirely when there's no session (e.g. on /login before
  // signing in, or right after logout) — RLS would reject it as anon anyway,
  // and doing so avoids a noisy, expected 406/PGRST116 on every public-page
  // load. SettingsContext's caller already falls back to DEFAULT_BUSINESS_SETTINGS.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('No session — skipping business_settings fetch');
  }

  const { data, error } = await supabase
    .from('business_settings')
    .select('*')
    .eq('id', 1)
    .single();

  if (error || !data) {
    throw error || new Error('business_settings row not found');
  }

  return data as BusinessSettings;
}
