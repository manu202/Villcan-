import { describe, it, expect } from 'vitest';
import { computeCashBalance, type CashBalanceMovement } from './cashBalance';

describe('computeCashBalance (M-3: the one shared cash-balance formula)', () => {
  it('with no movements, everything is zero', () => {
    expect(computeCashBalance([])).toEqual({
      efectivo: 0,
      transferencia: 0,
      pos: 0,
      global: 0,
    });
  });

  it('adds apertura (opening float) as cash', () => {
    const movements: CashBalanceMovement[] = [
      { type: 'apertura', income: 100000, expense: 0, payment_method: null, comment: null },
    ];

    const result = computeCashBalance(movements);

    expect(result.efectivo).toBe(100000);
    expect(result.global).toBe(100000);
  });

  it('splits servicio income by payment_method: only efectivo touches the drawer', () => {
    const movements: CashBalanceMovement[] = [
      { type: 'servicio', income: 50000, expense: 0, payment_method: 'efectivo', comment: null },
      { type: 'servicio', income: 30000, expense: 0, payment_method: 'transferencia', comment: null },
      { type: 'servicio', income: 20000, expense: 0, payment_method: 'pos', comment: null },
    ];

    const result = computeCashBalance(movements);

    expect(result.efectivo).toBe(50000);
    expect(result.transferencia).toBe(30000);
    expect(result.pos).toBe(20000);
    // global = all methods combined, since it is money in any form
    expect(result.global).toBe(100000);
  });

  it('a gasto tagged [Cta Bancaria] reduces global but NOT the cash drawer', () => {
    const movements: CashBalanceMovement[] = [
      { type: 'servicio', income: 100000, expense: 0, payment_method: 'efectivo', comment: null },
      { type: 'gasto', income: 0, expense: 10000, payment_method: null, comment: 'Compra insumos' },
      { type: 'gasto', income: 0, expense: 40000, payment_method: null, comment: 'Pago proveedor [Cta Bancaria]' },
    ];

    const result = computeCashBalance(movements);

    // Only the non-bank gasto (10000) comes out of the drawer.
    expect(result.efectivo).toBe(90000);
    // Both gastos reduce global — the money left the business either way.
    expect(result.global).toBe(50000);
  });

  it('a cierre (retiro) withdrawal reduces both efectivo and global', () => {
    const movements: CashBalanceMovement[] = [
      { type: 'apertura', income: 100000, expense: 0, payment_method: null, comment: null },
      { type: 'servicio', income: 50000, expense: 0, payment_method: 'efectivo', comment: null },
      { type: 'cierre', income: 0, expense: 120000, payment_method: null, comment: null },
    ];

    const result = computeCashBalance(movements);

    expect(result.efectivo).toBe(30000); // 100000 + 50000 - 120000
    expect(result.global).toBe(30000);
  });

  it('a cierre movement is not double-counted across periods: excluding it entirely from', () => {
    // Regression for the M-3 invariant: a cierre movement belongs to exactly
    // ONE period (the one it closes out). Simulates two adjacent periods by
    // running computeCashBalance twice, once per period's own movements —
    // the cierre that ended period 1 must never appear in period 2's array.
    const period1: CashBalanceMovement[] = [
      { type: 'apertura', income: 100000, expense: 0, payment_method: null, comment: null },
      { type: 'servicio', income: 50000, expense: 0, payment_method: 'efectivo', comment: null },
      { type: 'cierre', income: 0, expense: 150000, payment_method: null, comment: null },
    ];
    const period2: CashBalanceMovement[] = [
      { type: 'apertura', income: 20000, expense: 0, payment_method: null, comment: null },
      { type: 'servicio', income: 10000, expense: 0, payment_method: 'efectivo', comment: null },
    ];

    expect(computeCashBalance(period1).efectivo).toBe(0); // 100000 + 50000 - 150000
    expect(computeCashBalance(period2).efectivo).toBe(30000); // fresh float, no leftover cierre
  });

  it('full scenario: apertura + mixed-method income + mixed gastos + cierre', () => {
    const movements: CashBalanceMovement[] = [
      { type: 'apertura', income: 200000, expense: 0, payment_method: null, comment: null },
      { type: 'servicio', income: 100000, expense: 0, payment_method: 'efectivo', comment: null },
      { type: 'servicio', income: 60000, expense: 0, payment_method: 'transferencia', comment: null },
      { type: 'servicio', income: 40000, expense: 0, payment_method: 'pos', comment: null },
      { type: 'gasto', income: 0, expense: 30000, payment_method: null, comment: 'Insumos' },
      { type: 'gasto', income: 0, expense: 20000, payment_method: null, comment: 'Alquiler [Cta Bancaria]' },
      { type: 'cierre', income: 0, expense: 50000, payment_method: null, comment: null },
    ];

    const result = computeCashBalance(movements);

    // efectivo = 200000 + 100000 - 30000(cash gasto) - 50000(cierre) = 220000
    expect(result.efectivo).toBe(220000);
    expect(result.transferencia).toBe(60000);
    expect(result.pos).toBe(40000);
    // global = efectivo(220000) + transferencia(60000) + pos(40000) - bank gasto(20000) = 300000
    expect(result.global).toBe(300000);
  });
});
