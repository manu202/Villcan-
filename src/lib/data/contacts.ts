import { createClient } from '@/lib/supabase/client';
import { escapeSearchQuery } from '@/lib/utils';

/**
 * Contact search by name OR phone (case-insensitive partial match), used
 * by MovementForm's debounced contact-search input. The 300ms debounce
 * lives in the component — this is only the Supabase query itself.
 *
 * Reported live 2026-09-23: this used to match full_name only — a staffer
 * typing a customer's phone number (the most common real-world lookup:
 * they call in, or read it off their own phone) found nothing even for an
 * existing contact.
 *
 * Matches the existing query otherwise: no branch scoping (contacts are
 * not filtered by branch in the original inline query either).
 */
export async function searchContacts(query: string) {
  const supabase = createClient();
  const escaped = escapeSearchQuery(query);
  return supabase
    .from('contacts')
    .select('id, full_name')
    .or(`full_name.ilike.%${escaped}%,phone.ilike.%${escaped}%`)
    .order('full_name')
    .limit(10);
}
