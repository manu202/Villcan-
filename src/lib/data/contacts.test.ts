import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchContacts } from './contacts';

let lastOrFilter: string | null = null;
let lastIlikeArgs: [string, string] | null = null;

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => {
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
      mock.order = chainable;
      mock.limit = () => Promise.resolve({ data: [], error: null });
      return mock;
    },
  }),
}));

beforeEach(() => {
  lastOrFilter = null;
  lastIlikeArgs = null;
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
});
