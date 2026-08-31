import { describe, it, expect } from 'vitest';
import { computeLiquidacionByStaff } from './liquidacion';

describe('computeLiquidacionByStaff (REQ-PROFIT-5)', () => {
  it('sums facturado and commission per staff member across multiple movements, commissions enabled', () => {
    const result = computeLiquidacionByStaff([
      { user_id: 'u1', userName: 'Ana', amountCharged: 100000, commissionPct: 10 },
      { user_id: 'u1', userName: 'Ana', amountCharged: 50000, commissionPct: 10 },
      { user_id: 'u2', userName: 'Beto', amountCharged: 200000, commissionPct: 20 },
    ]);

    expect(result).toEqual([
      { userId: 'u2', userName: 'Beto', facturado: 200000, commission: 40000 },
      { userId: 'u1', userName: 'Ana', facturado: 150000, commission: 15000 },
    ]);
  });

  it('null commissionPct on a movement contributes 0 commission but still counts toward facturado', () => {
    const result = computeLiquidacionByStaff([
      { user_id: 'u1', userName: 'Ana', amountCharged: 100000, commissionPct: null },
    ]);

    expect(result).toEqual([
      { userId: 'u1', userName: 'Ana', facturado: 100000, commission: 0 },
    ]);
  });

  it('empty movement list -> empty result', () => {
    expect(computeLiquidacionByStaff([])).toEqual([]);
  });

  it('sorts rows by facturado descending', () => {
    const result = computeLiquidacionByStaff([
      { user_id: 'low', userName: 'Low', amountCharged: 10000, commissionPct: null },
      { user_id: 'high', userName: 'High', amountCharged: 90000, commissionPct: null },
    ]);

    expect(result.map((r) => r.userId)).toEqual(['high', 'low']);
  });
});
