import { createClient } from '@/lib/supabase/client';

/**
 * SettingsPage (/settings/general) "Guardar" submit: upserts the single
 * business_settings row (id: 1) with the general-settings fields editable on
 * this page (business_name, services_label, staff_label, brand_color).
 */
export async function upsertBusinessSettings(payload: {
  id: number;
  business_name: string;
  services_label: string;
  staff_label: string;
  brand_color: string;
}) {
  const supabase = createClient();
  return supabase.from('business_settings').upsert(payload, { onConflict: 'id' });
}
