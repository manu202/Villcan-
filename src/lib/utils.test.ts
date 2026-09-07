import { describe, it, expect } from 'vitest';
import { formatRelativeTime, isOlderThan } from './utils';

const BASE = new Date('2026-09-07T12:00:00Z').getTime();

describe('formatRelativeTime', () => {
  it('returns "Ahora mismo" for a date less than 60 seconds ago', () => {
    const date = new Date(BASE - 30 * 1000).toISOString();
    expect(formatRelativeTime(date, BASE)).toBe('Ahora mismo');
  });

  it('returns "Hace X min" for a date 7 minutes ago', () => {
    const date = new Date(BASE - 7 * 60 * 1000).toISOString();
    expect(formatRelativeTime(date, BASE)).toBe('Hace 7 min');
  });

  it('returns "Hace 59 min" at the boundary just under 1 hour', () => {
    const date = new Date(BASE - 59 * 60 * 1000).toISOString();
    expect(formatRelativeTime(date, BASE)).toBe('Hace 59 min');
  });

  it('returns "Hace X h" for a date 2 hours ago', () => {
    const date = new Date(BASE - 2 * 3600 * 1000).toISOString();
    expect(formatRelativeTime(date, BASE)).toBe('Hace 2 h');
  });

  it('accepts a Date object as input', () => {
    const date = new Date(BASE - 15 * 60 * 1000);
    expect(formatRelativeTime(date, BASE)).toBe('Hace 15 min');
  });
});

describe('isOlderThan', () => {
  it('returns true when the date is older than the threshold', () => {
    const date = new Date(BASE - 11 * 60 * 1000).toISOString();
    expect(isOlderThan(date, 10, BASE)).toBe(true);
  });

  it('returns false when the date is within the threshold', () => {
    const date = new Date(BASE - 5 * 60 * 1000).toISOString();
    expect(isOlderThan(date, 10, BASE)).toBe(false);
  });

  it('returns false at exactly the threshold boundary (not strictly older)', () => {
    const date = new Date(BASE - 10 * 60 * 1000).toISOString();
    expect(isOlderThan(date, 10, BASE)).toBe(false);
  });
});
