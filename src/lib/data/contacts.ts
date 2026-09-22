import { createClient } from '@/lib/supabase/client';
import { escapeSearchQuery } from '@/lib/utils';

/**
 * Contact search by name (case-insensitive partial match), used by
 * MovementForm's debounced contact-search input. The 300ms debounce lives
 * in the component — this is only the Supabase query itself.
 *
 * Matches the existing query exactly: no branch scoping (contacts are not
 * filtered by branch in the original inline query either).
 */
export async function searchContacts(query: string) {
  const supabase = createClient();
  const escaped = escapeSearchQuery(query);
  return supabase
    .from('contacts')
    .select('id, full_name')
    .ilike('full_name', `%${escaped}%`)
    .order('full_name')
    .limit(10);
}
