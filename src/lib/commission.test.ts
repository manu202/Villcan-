import { describe, it, expect } from 'vitest';
import { computeCommissionPct, computeCommissionAmount } from './commission';

describe('computeCommissionPct (REQ-PROFIT-1/2)', () => {
  it('commissions disabled -> null, regardless of configured default_commission_pct', () => {
    expect(computeCommissionPct({ commissions_enabled: false, default_commission_pct: 15 })).toBeNull();
  });

  it('commissions enabled -> returns the global default_commission_pct', () => {
    expect(computeCommissionPct({ commissions_enabled: true, default_commission_pct: 15 })).toBe(15);
  });

  it('commissions enabled with default_commission_pct = 0 -> returns 0, NOT null (explicit zero is a real value)', () => {
    expect(computeCommissionPct({ commissions_enabled: true, default_commission_pct: 0 })).toBe(0);
  });

  it('commissions disabled with default_commission_pct = 0 -> still null (toggle wins)', () => {
    expect(computeCommissionPct({ commissions_enabled: false, default_commission_pct: 0 })).toBeNull();
  });
});

describe('computeCommissionAmount (REQ-PROFIT-1/2)', () => {
  it('pct is null -> amount is 0 (commissions off / not applicable)', () => {
    expect(computeCommissionAmount(100000, null)).toBe(0);
  });

  it('pct is a positive percentage -> amount = amountCharged * pct / 100', () => {
    expect(computeCommissionAmount(100000, 15)).toBe(15000);
  });

  it('pct is exactly 0 -> amount is 0 (explicit zero commission)', () => {
    expect(computeCommissionAmount(100000, 0)).toBe(0);
  });

  it('amountCharged is 0 -> amount is 0 regardless of pct', () => {
    expect(computeCommissionAmount(0, 20)).toBe(0);
  });
});
