import { describe, it, expect } from 'vitest';
import { computeMargin } from './margin';

describe('computeMargin (REQ-PROFIT-3/4)', () => {
  it('cost is null (not tracked) -> margin equals full price (cost treated as 0)', () => {
    expect(computeMargin(50000, null)).toBe(50000);
  });

  it('cost is a positive integer -> margin = price - cost', () => {
    expect(computeMargin(50000, 20000)).toBe(30000);
  });

  it('cost equals price -> margin is 0 (break-even)', () => {
    expect(computeMargin(50000, 50000)).toBe(0);
  });

  it('cost exceeds price -> margin is negative (loss)', () => {
    expect(computeMargin(50000, 60000)).toBe(-10000);
  });
});
