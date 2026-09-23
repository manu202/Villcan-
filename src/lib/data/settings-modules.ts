import { createClient } from '@/lib/supabase/client';

/** ModulesPage's handleSubmit: updates the business_settings modules toggles/fields. */
export async function updateBusinessModulesSettings(payload: {
  commissions_enabled: boolean;
  default_commission_pct: number;
  mandatory_arqueo_enabled: boolean;
}) {
  const supabase = createClient();
  return supabase.from('business_settings').update(payload).eq('id', 1);
}
