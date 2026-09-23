import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listBranchAccessWithProfiles,
  updateBranchAccessRole,
  deleteBranchAccess,
} from './settings-users';

let lastTable: string | null = null;
let lastSelectArgs: string | null = null;
let lastEqCalls: [string, string][] = [];
let lastUpdateArgs: unknown = null;
let lastDeleteCalled = false;
let resolvedValue: unknown = { data: [], error: null };

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      lastTable = table;
      const mock: Record<string, unknown> = {};
      mock.select = (columns: string) => {
        lastSelectArgs = columns;
        return mock;
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
        lastEqCalls.push([field, value]);
        return mock;
      };
      mock.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolvedValue).then(resolve);
      return mock;
    },
  }),
}));

beforeEach(() => {
  lastTable = null;
  lastSelectArgs = null;
  lastEqCalls = [];
  lastUpdateArgs = null;
  lastDeleteCalled = false;
  resolvedValue = { data: [], error: null };
});

describe('listBranchAccessWithProfiles (UsersPage loadAccess)', () => {
  it('selects user_branch_access joined with profiles, filtered by branch_id', async () => {
    await listBranchAccessWithProfiles('branch-1');
    expect(lastTable).toBe('user_branch_access');
    expect(lastSelectArgs).toBe('user_id, role, profiles(email, full_name)');
    expect(lastEqCalls).toEqual([['branch_id', 'branch-1']]);
  });
});

describe('updateBranchAccessRole (UsersPage handleRoleChange)', () => {
  it('updates the role for the given user within the given branch', async () => {
    await updateBranchAccessRole('user-1', 'branch-1', 'admin');
    expect(lastTable).toBe('user_branch_access');
    expect(lastUpdateArgs).toEqual({ role: 'admin' });
    expect(lastEqCalls).toEqual([
      ['user_id', 'user-1'],
      ['branch_id', 'branch-1'],
    ]);
  });
});

describe('deleteBranchAccess (UsersPage handleRemoveConfirmed)', () => {
  it('deletes the user_branch_access row for the given user and branch', async () => {
    await deleteBranchAccess('user-1', 'branch-1');
    expect(lastTable).toBe('user_branch_access');
    expect(lastDeleteCalled).toBe(true);
    expect(lastEqCalls).toEqual([
      ['user_id', 'user-1'],
      ['branch_id', 'branch-1'],
    ]);
  });
});
