import { describe, it, expect } from 'vitest';
import { countAdmins, isLastAdmin, normalizeEmail, emailsMatch } from './access';
import type { UserBranchAccess } from '@/types';

type Row = Pick<UserBranchAccess, 'user_id' | 'role'>;

describe('countAdmins (REQ-SETTINGSREORG-8)', () => {
  it('zero admins -> 0', () => {
    const rows: Row[] = [
      { user_id: 'u1', role: 'barber' },
      { user_id: 'u2', role: 'viewer' },
    ];
    expect(countAdmins(rows)).toBe(0);
  });

  it('one admin -> 1', () => {
    const rows: Row[] = [
      { user_id: 'u1', role: 'admin' },
      { user_id: 'u2', role: 'barber' },
    ];
    expect(countAdmins(rows)).toBe(1);
  });

  it('two or more admins -> counts all of them', () => {
    const rows: Row[] = [
      { user_id: 'u1', role: 'admin' },
      { user_id: 'u2', role: 'admin' },
      { user_id: 'u3', role: 'barber' },
    ];
    expect(countAdmins(rows)).toBe(2);
  });

  it('empty list -> 0', () => {
    expect(countAdmins([])).toBe(0);
  });
});

describe('isLastAdmin (REQ-SETTINGSREORG-8)', () => {
  it('zero admins in the branch -> false for anyone (nothing to protect)', () => {
    const rows: Row[] = [
      { user_id: 'u1', role: 'barber' },
      { user_id: 'u2', role: 'viewer' },
    ];
    expect(isLastAdmin(rows, 'u1')).toBe(false);
  });

  it('exactly one admin, target IS that admin -> true (must be protected)', () => {
    const rows: Row[] = [
      { user_id: 'u1', role: 'admin' },
      { user_id: 'u2', role: 'barber' },
    ];
    expect(isLastAdmin(rows, 'u1')).toBe(true);
  });

  it('exactly one admin, target is someone else (a non-admin row) -> false', () => {
    const rows: Row[] = [
      { user_id: 'u1', role: 'admin' },
      { user_id: 'u2', role: 'barber' },
    ];
    expect(isLastAdmin(rows, 'u2')).toBe(false);
  });

  it('two or more admins, target is one of them -> false (safe to change)', () => {
    const rows: Row[] = [
      { user_id: 'u1', role: 'admin' },
      { user_id: 'u2', role: 'admin' },
    ];
    expect(isLastAdmin(rows, 'u1')).toBe(false);
    expect(isLastAdmin(rows, 'u2')).toBe(false);
  });

  it('target user_id not present in the list -> false', () => {
    const rows: Row[] = [{ user_id: 'u1', role: 'admin' }];
    expect(isLastAdmin(rows, 'u-not-in-list')).toBe(false);
  });
});

describe('normalizeEmail (bug #7 - case-insensitive email lookup)', () => {
  it('lowercases the email', () => {
    expect(normalizeEmail('Juan@Example.com')).toBe('juan@example.com');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeEmail('  juan@example.com  ')).toBe('juan@example.com');
  });

  it('trims and lowercases together', () => {
    expect(normalizeEmail('  Juan@EXAMPLE.com ')).toBe('juan@example.com');
  });
});

describe('emailsMatch (bug #7 - case-insensitive email lookup)', () => {
  it('same email, different case -> true', () => {
    expect(emailsMatch('Juan@Example.com', 'juan@example.com')).toBe(true);
  });

  it('same email with extra whitespace -> true', () => {
    expect(emailsMatch(' juan@example.com', 'juan@example.com ')).toBe(true);
  });

  it('different emails -> false', () => {
    expect(emailsMatch('juan@example.com', 'pedro@example.com')).toBe(false);
  });
});
