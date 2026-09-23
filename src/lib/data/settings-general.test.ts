import { describe, it, expect, vi, beforeEach } from 'vitest';
import { upsertBusinessSettings } from './settings-general';

let lastTable: string | null = null;
let lastUpsertArgs: unknown = null;
let lastUpsertOpts: unknown = null;
let resolvedValue: unknown = { data: null, error: null };

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      lastTable = table;
      return {
        upsert: (payload: unknown, opts: unknown) => {
          lastUpsertArgs = payload;
          lastUpsertOpts = opts;
          return Promise.resolve(resolvedValue);
        },
      };
    },
  }),
}));

beforeEach(() => {
  lastTable = null;
  lastUpsertArgs = null;
  lastUpsertOpts = null;
  resolvedValue = { data: null, error: null };
});

describe('upsertBusinessSettings (SettingsPage /settings/general "Guardar" submit)', () => {
  it('upserts the business_settings row keyed by id with onConflict: "id"', async () => {
    const payload = {
      id: 1,
      business_name: 'Mi Negocio',
      services_label: 'Servicios',
      staff_label: 'Personal',
      brand_color: 'emerald',
    };
    await upsertBusinessSettings(payload);
    expect(lastTable).toBe('business_settings');
    expect(lastUpsertArgs).toEqual(payload);
    expect(lastUpsertOpts).toEqual({ onConflict: 'id' });
  });
});
