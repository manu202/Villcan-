import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateBusinessModulesSettings } from './settings-modules';

let lastTable: string | null = null;
let lastUpdateArgs: unknown = null;
let lastEqArgs: [string, number] | null = null;
let resolvedValue: unknown = { data: [], error: null };

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      lastTable = table;
      const mock: Record<string, unknown> = {};
      mock.update = (payload: unknown) => {
        lastUpdateArgs = payload;
        return mock;
      };
      mock.eq = (field: string, value: number) => {
        lastEqArgs = [field, value];
        return Promise.resolve(resolvedValue);
      };
      return mock;
    },
  }),
}));

beforeEach(() => {
  lastTable = null;
  lastUpdateArgs = null;
  lastEqArgs = null;
  resolvedValue = { data: [], error: null };
});

describe('updateBusinessModulesSettings (ModulesPage handleSubmit)', () => {
  it('updates the business_settings row with id 1', async () => {
    const payload = {
      commissions_enabled: true,
      default_commission_pct: 10.5,
      mandatory_arqueo_enabled: false,
    };
    await updateBusinessModulesSettings(payload);
    expect(lastTable).toBe('business_settings');
    expect(lastUpdateArgs).toEqual(payload);
    expect(lastEqArgs).toEqual(['id', 1]);
  });
});
