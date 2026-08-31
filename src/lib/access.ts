// Pure last-admin safety-guard helpers (REQ-SETTINGSREORG-8).
// Prevents a branch from ever ending up with zero administrators by
// disabling removal/downgrade of the sole remaining admin in the UI.
// Operates entirely on the already-loaded user_branch_access list for the
// current branch — no extra query needed.

import type { UserBranchAccess } from '@/types';

type AccessRow = Pick<UserBranchAccess, 'user_id' | 'role'>;

/** Counts how many rows in the list currently have role === 'admin'. */
export function countAdmins(rows: AccessRow[]): number {
  return rows.filter((row) => row.role === 'admin').length;
}

/**
 * True when `userId` is the ONLY admin left in `rows`. Callers use this to
 * disable both "remove access" and "downgrade from admin" for that row —
 * removing or downgrading the last admin would orphan branch management
 * (nobody left able to satisfy is_branch_admin() for further changes).
 */
export function isLastAdmin(rows: AccessRow[], userId: string): boolean {
  const target = rows.find((row) => row.user_id === userId);
  if (!target || target.role !== 'admin') return false;
  return countAdmins(rows) === 1;
}

// Case-insensitive email lookup (bug #7). Server-side code uses these before
// querying/inviting so `Juan@Example.com` and `juan@example.com` resolve to
// the same user, instead of the exact-match `.eq('email', ...)` that used to
// silently fail to find an existing account.

/** Normalizes an email for case-insensitive comparison/lookup (trim + lowercase). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** True when two emails refer to the same user, ignoring case and surrounding whitespace. */
export function emailsMatch(a: string, b: string): boolean {
  return normalizeEmail(a) === normalizeEmail(b);
}
