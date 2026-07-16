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
  updated_at: '',
  updated_by: null,
};

export async function getBusinessSettings(): Promise<BusinessSettings> {
  const supabase = createClient();

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
