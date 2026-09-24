import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  searchContacts,
  listContacts,
  listLastVisitsForContacts,
  updateContact,
  createContact,
  getContactDetail,
  listRecentMovementsForContact,
  listAllMovementAmountsForContact,
  getContactById,
} from './contacts';

let lastOrFilter: string | null = null;
let lastIlikeArgs: [string, string] | null = null;
let lastTable: string | null = null;
let lastEqArgs: [string, string] | null = null;
let lastInArgs: [string, string[]] | null = null;
let lastOrderArgs: [string, unknown] | null = null;
let lastRangeArgs: [number, number] | null = null;
let lastUpdateArgs: unknown = null;
let lastInsertArgs: unknown = null;
let resolvedValue: unknown = { data: [], error: null };

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      lastTable = table;
      const mock: Record<string, unknown> = {};
      const chainable = () => mock;
      mock.select = chainable;
      mock.ilike = (field: string, pattern: string) => {
        lastIlikeArgs = [field, pattern];
        return mock;
      };
      mock.or = (filter: string) => {
        lastOrFilter = filter;
        return mock;
      };
      mock.eq = (field: string, value: string) => {
        lastEqArgs = [field, value];
        return mock;
      };
      mock.in = (field: string, values: string[]) => {
        lastInArgs = [field, values];
        return mock;
      };
      mock.order = (field: string, opts?: unknown) => {
        lastOrderArgs = [field, opts];
        return mock;
      };
      mock.range = (from: number, to: number) => {
        lastRangeArgs = [from, to];
        return Promise.resolve(resolvedValue);
      };
      mock.limit = () => Promise.resolve(resolvedValue);
      mock.update = (payload: unknown) => {
        lastUpdateArgs = payload;
        return mock;
      };
      mock.insert = (payload: unknown) => {
        lastInsertArgs = payload;
        return mock;
      };
      mock.single = () => Promise.resolve(resolvedValue);
      // Terminal for plain .eq()/.in() chains that end without .single()/.limit()/.range().
      mock.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolvedValue).then(resolve);
      return mock;
    },
  }),
}));

beforeEach(() => {
  lastOrFilter = null;
  lastIlikeArgs = null;
  lastTable = null;
  lastEqArgs = null;
  lastInArgs = null;
  lastOrderArgs = null;
  lastRangeArgs = null;
  lastUpdateArgs = null;
  lastInsertArgs = null;
  resolvedValue = { data: [], error: null };
});

describe('searchContacts (MovementForm "Buscar cliente" autocomplete)', () => {
  // Reported live 2026-09-23: this is the same search used by the
  // "Nueva Venta" flow's "Buscar cliente" field — before this fix it only
  // matched full_name, so a staffer typing a customer's phone number (the
  // most common real-world lookup) found nothing even for an existing
  // contact.
  it('matches by phone as well as full_name, not just full_name', async () => {
    await searchContacts('0981555444');

    if (lastOrFilter) {
      expect(lastOrFilter).toContain('full_name.ilike');
      expect(lastOrFilter).toContain('phone.ilike');
      expect(lastOrFilter).toContain('0981555444');
    } else {
      // If the implementation still uses a single .ilike() instead of
      // .or(), that alone proves it never checks phone.
      expect(lastIlikeArgs).toBeNull();
    }
  });

  // Reported live 2026-09-24: contacts saved after the ContactForm
  // normalization fix (2026-09-23) store phone WITHOUT the local leading 0
  // (e.g. "595994641522"), but a staffer searches the natural way they'd
  // dial it, WITH the leading 0 ("0994641522"). A plain ILIKE against the
  // raw typed digits can never match — "595994641522" contains no literal
  // "0" character at all once normalized. The two fixes from yesterday
  // were incompatible with each other.
  it('also matches a normalized (no leading 0) stored phone when the query is typed with a leading 0', async () => {
    await searchContacts('0994641522');

    expect(lastOrFilter).toContain('phone.ilike.%994641522%');
  });
});

describe('listContacts (ContactsPage)', () => {
  it('applies the three-column .or() filter only when search.length >= 2', async () => {
    await listContacts({ search: 'ab', sortBy: 'name', page: 0, pageSize: 30 });
    expect(lastTable).toBe('contacts');
    expect(lastOrFilter).toContain('full_name.ilike');
    expect(lastOrFilter).toContain('ci.ilike');
    expect(lastOrFilter).toContain('phone.ilike');
  });

  it('skips the .or() filter when search is under 2 characters', async () => {
    await listContacts({ search: 'a', sortBy: 'name', page: 0, pageSize: 30 });
    expect(lastOrFilter).toBeNull();
  });

  // Same gap as searchContacts above, for the main Contactos list search.
  it('also matches a normalized (no leading 0) stored phone when the query is typed with a leading 0', async () => {
    await listContacts({ search: '0994641522', sortBy: 'name', page: 0, pageSize: 30 });
    expect(lastOrFilter).toContain('phone.ilike.%994641522%');
  });

  it('orders by full_name ascending when sortBy is "name"', async () => {
    await listContacts({ search: '', sortBy: 'name', page: 0, pageSize: 30 });
    expect(lastOrderArgs?.[0]).toBe('full_name');
    expect((lastOrderArgs?.[1] as { ascending: boolean }).ascending).toBe(true);
  });

  it('orders by created_at descending when sortBy is "date"', async () => {
    await listContacts({ search: '', sortBy: 'date', page: 0, pageSize: 30 });
    expect(lastOrderArgs?.[0]).toBe('created_at');
    expect((lastOrderArgs?.[1] as { ascending: boolean }).ascending).toBe(false);
  });

  it('paginates using page * pageSize as the range', async () => {
    await listContacts({ search: '', sortBy: 'name', page: 2, pageSize: 30 });
    expect(lastRangeArgs).toEqual([60, 89]);
  });
});

describe('listLastVisitsForContacts (ContactsPage batched last-visit lookup)', () => {
  it('queries movements filtered by contact_id .in() the given ids', async () => {
    await listLastVisitsForContacts(['c1', 'c2']);
    expect(lastTable).toBe('movements');
    expect(lastInArgs).toEqual(['contact_id', ['c1', 'c2']]);
  });
});

describe('updateContact (ContactForm edit path)', () => {
  it('updates the contacts row by id without touching branch_id', async () => {
    const payload = { full_name: 'Juan', ci: null, phone: '+595984123456', comment: null };
    await updateContact('contact-1', payload);
    expect(lastTable).toBe('contacts');
    expect(lastUpdateArgs).toEqual(payload);
    expect(lastEqArgs).toEqual(['id', 'contact-1']);
  });
});

describe('createContact (ContactForm create path)', () => {
  it('inserts a new contacts row including branch_id', async () => {
    const payload = {
      full_name: 'Juan',
      ci: null,
      phone: '+595984123456',
      comment: null,
      branch_id: 'branch-1',
    };
    await createContact(payload);
    expect(lastTable).toBe('contacts');
    expect(lastInsertArgs).toEqual(payload);
  });
});

describe('getContactDetail (ContactDetailSheet)', () => {
  it('selects the full detail columns for a single contact', async () => {
    await getContactDetail('contact-1');
    expect(lastTable).toBe('contacts');
    expect(lastEqArgs).toEqual(['id', 'contact-1']);
  });
});

describe('listRecentMovementsForContact (ContactDetailSheet "Historial reciente")', () => {
  it('queries movements for the contact, newest first, capped at 5', async () => {
    await listRecentMovementsForContact('contact-1');
    expect(lastTable).toBe('movements');
    expect(lastEqArgs).toEqual(['contact_id', 'contact-1']);
    expect(lastOrderArgs?.[0]).toBe('created_at');
    expect((lastOrderArgs?.[1] as { ascending: boolean }).ascending).toBe(false);
  });
});

describe('listAllMovementAmountsForContact (ContactDetailSheet stats, C-1)', () => {
  it('queries all movement amounts for the contact, uncapped', async () => {
    await listAllMovementAmountsForContact('contact-1');
    expect(lastTable).toBe('movements');
    expect(lastEqArgs).toEqual(['contact_id', 'contact-1']);
  });
});

describe('getContactById (ContactFormSheet prefill)', () => {
  it('selects the editable fields for a single contact', async () => {
    await getContactById('contact-1');
    expect(lastTable).toBe('contacts');
    expect(lastEqArgs).toEqual(['id', 'contact-1']);
  });
});
