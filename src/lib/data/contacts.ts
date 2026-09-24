import { createClient } from '@/lib/supabase/client';
import { escapeSearchQuery } from '@/lib/utils';

/**
 * Reported live 2026-09-24: contacts saved after the ContactForm
 * normalization fix (2026-09-23) store phone WITHOUT the local leading 0
 * (e.g. "595994641522"), but a staffer searches the way they'd naturally
 * dial it, WITH the leading 0 ("0994641522") -- a plain ILIKE against the
 * raw typed digits can never match, since the normalized value contains no
 * literal "0" character at all. Returns an extra `phone.ilike` OR-term
 * (escaped, leading 0 stripped) when the query looks phone-shaped and
 * actually starts with 0, empty string otherwise.
 */
function phoneNoLeadingZeroOrTerm(query: string): string {
  const digitsOnly = query.replace(/\D/g, '');
  if (!digitsOnly.startsWith('0') || digitsOnly.length < 2) return '';
  const withoutLeadingZero = escapeSearchQuery(digitsOnly.slice(1));
  return `,phone.ilike.%${withoutLeadingZero}%`;
}

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
    .or(`full_name.ilike.%${escaped}%,phone.ilike.%${escaped}%${phoneNoLeadingZeroOrTerm(query)}`)
    .order('full_name')
    .limit(10);
}

/**
 * Paginated/sorted/filtered contacts list for ContactsPage. Matches the
 * inline query exactly: the `.or()` filter is only added once the user has
 * typed 2+ characters (same threshold, same three-column match).
 */
export async function listContacts(params: {
  search: string;
  sortBy: 'name' | 'date';
  page: number;
  pageSize: number;
}) {
  const supabase = createClient();
  let query = supabase
    .from('contacts')
    .select('id, full_name, ci, phone, comment');

  if (params.search.length >= 2) {
    const escaped = escapeSearchQuery(params.search);
    query = query.or(
      `full_name.ilike.%${escaped}%,ci.ilike.%${escaped}%,phone.ilike.%${escaped}%${phoneNoLeadingZeroOrTerm(params.search)}`
    );
  }

  query = query.order(params.sortBy === 'name' ? 'full_name' : 'created_at', {
    ascending: params.sortBy === 'name',
  });

  query = query.range(params.page * params.pageSize, (params.page + 1) * params.pageSize - 1);

  return query;
}

/**
 * Batched last-visit lookup for ContactsPage — ONE query, not N+1, used to
 * enrich the page of contacts just fetched by `listContacts`.
 */
export async function listLastVisitsForContacts(contactIds: string[]) {
  const supabase = createClient();
  return supabase
    .from('movements')
    .select('contact_id, created_at')
    .in('contact_id', contactIds);
}

/** ContactForm update path (edit). branch_id is intentionally not included
 * — the RLS WITH CHECK already prevents moving a contact to a different
 * branch. */
export async function updateContact(
  contactId: string,
  payload: { full_name: string; ci: string | null; phone: string | null; comment: string | null }
) {
  const supabase = createClient();
  return supabase.from('contacts').update(payload).eq('id', contactId);
}

/** ContactForm create path (new contact). branch_id is required by the RLS
 * INSERT policy. */
export async function createContact(payload: {
  full_name: string;
  ci: string | null;
  phone: string | null;
  comment: string | null;
  branch_id: string;
}) {
  const supabase = createClient();
  return supabase.from('contacts').insert(payload).select().single();
}

/** Single contact with its full detail columns, used by ContactDetailSheet. */
export async function getContactDetail(contactId: string) {
  const supabase = createClient();
  return supabase
    .from('contacts')
    .select('id, full_name, ci, phone, comment, created_at')
    .eq('id', contactId)
    .single();
}

/**
 * Recent (capped at 5) movements for ContactDetailSheet's "Historial
 * reciente" list — NOT the same query as `listAllMovementAmountsForContact`
 * below, which is uncapped and feeds the "Visitas"/"Total" stats instead
 * (C-1).
 */
export async function listRecentMovementsForContact(contactId: string) {
  const supabase = createClient();
  return supabase
    .from('movements')
    .select('id, type, amount_charged, income, expense, created_at, service:services(name)')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(5);
}

/**
 * Full (uncapped) set of a contact's movement amounts, used only to compute
 * the "Visitas"/"Total" stats in ContactDetailSheet (C-1).
 */
export async function listAllMovementAmountsForContact(contactId: string) {
  const supabase = createClient();
  return supabase
    .from('movements')
    .select('amount_charged')
    .eq('contact_id', contactId);
}

/** Single contact's editable fields, used by ContactFormSheet to prefill
 * the edit form. */
export async function getContactById(contactId: string) {
  const supabase = createClient();
  return supabase
    .from('contacts')
    .select('id, full_name, ci, phone, comment')
    .eq('id', contactId)
    .single();
}
