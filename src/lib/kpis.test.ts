import { describe, it, expect } from 'vitest';
import { calcCashBoxKPIs, calcRunningBalance, type KpiMovement } from './kpis';

describe('calcCashBoxKPIs (period activity: Ingresos/Egresos, apertura excluded)', () => {
  it('sums servicio income by method and gasto expense for the period', () => {
    const movements: KpiMovement[] = [
      { type: 'servicio', income: 50000, expense: 0, payment_method: 'efectivo', comment: null },
      { type: 'servicio', income: 30000, expense: 0, payment_method: 'transferencia', comment: null },
      { type: 'servicio', income: 20000, expense: 0, payment_method: 'pos', comment: null },
      { type: 'gasto', income: 0, expense: 10000, payment_method: null, comment: 'Compra insumos' },
      { type: 'gasto', income: 0, expense: 5000, payment_method: null, comment: 'Pago proveedor [Cta Bancaria]' },
      // apertura/cierre must NOT count as period activity income/expense
      { type: 'apertura', income: 1000000, expense: 0, payment_method: null, comment: null },
      { type: 'cierre', income: 0, expense: 200000, payment_method: null, comment: null },
    ];

    const result = calcCashBoxKPIs(movements);

    expect(result.totalIncome).toBe(100000); // servicio only, all methods
    expect(result.incomeByMethod).toEqual({ efectivo: 50000, transferencia: 30000, pos: 20000 });
    expect(result.totalExpenses).toBe(15000); // gasto only, both entries (Cta Bancaria included here)
  });

  it('zero-movement regression: matches pre-fix behavior of all-zero KPIs', () => {
    const result = calcCashBoxKPIs([]);
    expect(result).toEqual({
      totalIncome: 0,
      incomeByMethod: { efectivo: 0, transferencia: 0, pos: 0 },
      totalExpenses: 0,
    });
  });
});

describe('calcRunningBalance (Balance en Efectivo / Balance Global, always-current)', () => {
  it('adds apertura as cash, subtracts cierre, splits Cta Bancaria gastos for efectivo vs global', () => {
    const movements: KpiMovement[] = [
      { type: 'apertura', income: 1000000, expense: 0, payment_method: null, comment: null },
      { type: 'servicio', income: 50000, expense: 0, payment_method: 'efectivo', comment: null },
      { type: 'servicio', income: 30000, expense: 0, payment_method: 'transferencia', comment: null },
      { type: 'servicio', income: 20000, expense: 0, payment_method: 'pos', comment: null },
      { type: 'gasto', income: 0, expense: 10000, payment_method: null, comment: 'Compra insumos' },
      { type: 'gasto', income: 0, expense: 5000, payment_method: null, comment: 'Pago proveedor [Cta Bancaria]' },
      { type: 'cierre', income: 0, expense: 200000, payment_method: null, comment: null },
    ];

    const result = calcRunningBalance(movements);

    // efectivo = apertura(1000000) + servicio-efectivo(50000) - gastosNonBank(10000) - cierre(200000)
    expect(result.balanceEfectivo).toBe(840000);
    // global = apertura(1000000) + all servicio income(100000) - ALL gastos(15000) - cierre(200000)
    expect(result.balanceGlobal).toBe(885000);
  });

  it('zero-apertura/cierre regression: matches today\'s pre-fix numbers exactly', () => {
    // Mirrors src/app/page.test.tsx's existing locked scenario:
    // servicio efectivo 50000, gasto 10000 (non-bank) + 5000 (Cta Bancaria)
    const movements: KpiMovement[] = [
      { type: 'servicio', income: 50000, expense: 0, payment_method: 'efectivo', comment: null },
      { type: 'gasto', income: 0, expense: 10000, payment_method: null, comment: 'Compra insumos' },
      { type: 'gasto', income: 0, expense: 5000, payment_method: null, comment: 'Pago proveedor [Cta Bancaria]' },
    ];

    const result = calcRunningBalance(movements);

    // Pre-fix: balanceEfectivo = efectivo(50000) - gastosFromCaja(10000) = 40000
    expect(result.balanceEfectivo).toBe(40000);
    // Pre-fix: balanceGlobal = efectivo+transferencia+pos(50000) - totalExpenses(15000) = 35000
    expect(result.balanceGlobal).toBe(35000);
  });

  it('with no movements at all, both balances are zero', () => {
    const result = calcRunningBalance([]);
    expect(result).toEqual({ balanceEfectivo: 0, balanceGlobal: 0 });
  });
});
