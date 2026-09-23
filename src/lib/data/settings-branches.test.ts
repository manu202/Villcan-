import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listBranchStorefrontData,
  updateBranch,
  createBranchWithAdmin,
  deleteBranch,
} from './settings-branches';

let lastTable: string | null = null;
let lastSelectArgs: string | null = null;
let lastEqArgs: [string, string] | null = null;
let lastUpdateArgs: unknown = null;
let lastDeleteCalled = false;
let lastRpcName: string | null = null;
let lastRpcArgs: unknown = null;
let resolvedValue: unknown = { data: [], error: null };

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      lastTable = table;
      const mock: Record<string, unknown> = {};
      mock.select = (columns: string) => {
        lastSelectArgs = columns;
        return Promise.resolve(resolvedValue);
      };
      mock.update = (payload: unknown) => {
        lastUpdateArgs = payload;
        return mock;
      };
      mock.delete = () => {
        lastDeleteCalled = true;
        return mock;
      };
      mock.eq = (field: string, value: string) => {
        lastEqArgs = [field, value];
        return Promise.resolve(resolvedValue);
      };
      return mock;
    },
    rpc: (name: string, args: unknown) => {
      lastRpcName = name;
      lastRpcArgs = args;
      return Promise.resolve(resolvedValue);
    },
  }),
}));

beforeEach(() => {
  lastTable = null;
  lastSelectArgs = null;
  lastEqArgs = null;
  lastUpdateArgs = null;
  lastDeleteCalled = false;
  lastRpcName = null;
  lastRpcArgs = null;
  resolvedValue = { data: [], error: null };
});

describe('listBranchStorefrontData (BranchesPage storefront preview)', () => {
  it('selects storefront columns from branches', async () => {
    await listBranchStorefrontData();
    expect(lastTable).toBe('branches');
    expect(lastSelectArgs).toBe('id, whatsapp_number, slug, storefront_enabled');
  });
});

describe('updateBranch (BranchesPage edit-branch form submit)', () => {
  it('updates the branches row by id', async () => {
    const payload = {
      name: 'Sucursal Centro',
      address: 'Calle 1',
      vertical: 'generic' as const,
      whatsapp_number: '+595981234567',
    };
    await updateBranch('branch-1', payload);
    expect(lastTable).toBe('branches');
    expect(lastUpdateArgs).toEqual(payload);
    expect(lastEqArgs).toEqual(['id', 'branch-1']);
  });
});

describe('createBranchWithAdmin (BranchesPage new-branch form submit)', () => {
  it('calls the create_branch_with_admin RPC with the given params', async () => {
    const params = {
      p_name: 'Sucursal Norte',
      p_address: 'Calle 2',
      p_vertical: 'retail' as const,
      p_whatsapp: '+595981234568',
    };
    await createBranchWithAdmin(params);
    expect(lastRpcName).toBe('create_branch_with_admin');
    expect(lastRpcArgs).toEqual(params);
  });
});

describe('deleteBranch (BranchesPage delete confirmation)', () => {
  it('deletes the branches row by id', async () => {
    await deleteBranch('branch-1');
    expect(lastTable).toBe('branches');
    expect(lastDeleteCalled).toBe(true);
    expect(lastEqArgs).toEqual(['id', 'branch-1']);
  });
});
