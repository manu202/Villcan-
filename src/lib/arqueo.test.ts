import { describe, it, expect } from 'vitest';
import { computeArqueoDiscrepancy, buildClosingPayload } from './arqueo';

describe('computeArqueoDiscrepancy (REQ-CAJA-5)', () => {
  it('positive discrepancy when counted exceeds calculated (surplus)', () => {
    const calculated = { efectivo: 100000, transferencia: 50000, pos: 20000 };
    const counted = { efectivo: 105000, transferencia: 50000, pos: 20000 };

    expect(computeArqueoDiscrepancy(calculated, counted)).toEqual({
      efectivo: 5000,
      transferencia: 0,
      pos: 0,
    });
  });

  it('negative discrepancy when counted is short of calculated (faltante)', () => {
    const calculated = { efectivo: 100000, transferencia: 50000, pos: 20000 };
    const counted = { efectivo: 90000, transferencia: 48000, pos: 20000 };

    expect(computeArqueoDiscrepancy(calculated, counted)).toEqual({
      efectivo: -10000,
      transferencia: -2000,
      pos: 0,
    });
  });

  it('zero discrepancy across all methods when counted exactly matches calculated', () => {
    const calculated = { efectivo: 0, transferencia: 0, pos: 0 };
    const counted = { efectivo: 0, transferencia: 0, pos: 0 };

    expect(computeArqueoDiscrepancy(calculated, counted)).toEqual({
      efectivo: 0,
      transferencia: 0,
      pos: 0,
    });
  });
});

describe('buildClosingPayload (REQ-CAJA-3, REQ-CAJA-4)', () => {
  const calculated = { efectivo: 100000, transferencia: 50000, pos: 20000 };

  it('toggle OFF passthrough (REQ-CAJA-3/9 regression guard): no counted-amount fields required or sent', () => {
    const payload = buildClosingPayload({
      calculated,
      counted: null,
      arqueoEnabled: false,
      branchId: 'branch-1',
      closedBy: 'user-1',
      periodStart: '2026-07-15T00:00:00.000Z',
    });

    expect(payload.arqueo_enabled).toBe(false);
    expect(payload.counted_efectivo).toBeNull();
    expect(payload.counted_transferencia).toBeNull();
    expect(payload.counted_pos).toBeNull();
    expect(payload.discrepancy_efectivo).toBeNull();
    expect(payload.discrepancy_transferencia).toBeNull();
    expect(payload.discrepancy_pos).toBeNull();
    expect(payload.calculated_efectivo).toBe(100000);
    expect(payload.calculated_total).toBe(170000);
    expect(payload.branch_id).toBe('branch-1');
    expect(payload.closed_by).toBe('user-1');
  });

  it('toggle ON: saves counted amounts and computed discrepancy per method', () => {
    const counted = { efectivo: 105000, transferencia: 50000, pos: 18000 };

    const payload = buildClosingPayload({
      calculated,
      counted,
      arqueoEnabled: true,
      branchId: 'branch-2',
      closedBy: 'user-2',
      periodStart: '2026-07-15T08:00:00.000Z',
    });

    expect(payload.arqueo_enabled).toBe(true);
    expect(payload.counted_efectivo).toBe(105000);
    expect(payload.counted_transferencia).toBe(50000);
    expect(payload.counted_pos).toBe(18000);
    expect(payload.discrepancy_efectivo).toBe(5000);
    expect(payload.discrepancy_transferencia).toBe(0);
    expect(payload.discrepancy_pos).toBe(-2000);
    expect(payload.calculated_total).toBe(170000);
  });

  it('calculated_total is always the sum of the three calculated methods, regardless of toggle', () => {
    const payload = buildClosingPayload({
      calculated: { efectivo: 1, transferencia: 2, pos: 3 },
      counted: null,
      arqueoEnabled: false,
      branchId: 'branch-3',
      closedBy: 'user-3',
      periodStart: '2026-07-15T00:00:00.000Z',
    });

    expect(payload.calculated_total).toBe(6);
  });
});
