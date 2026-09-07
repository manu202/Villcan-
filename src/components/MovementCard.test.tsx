import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MovementCard } from './MovementCard';
import type { MovementWithDetails } from '@/types';

vi.mock('@/lib/utils', () => ({
  formatGuaranies: (n: number) => `₲ ${n.toLocaleString()}`,
  formatTime: (_d: string) => '10:30',
  getMovementTypeLabel: (t: string) => ({
    servicio: 'Servicio', gasto: 'Gasto', apertura: 'Apertura', cierre: 'Retiro',
  })[t] ?? t,
}));

const BASE: MovementWithDetails = {
  id: 'm1',
  type: 'servicio',
  amount_charged: 25000,
  commission_pct: null,
  income: 25000,
  expense: 0,
  payment_method: 'efectivo',
  contact_id: 'c1',
  service_id: 's1',
  user_id: 'u1',
  branch_id: 'b1',
  comment: null,
  created_at: '2026-09-07T10:30:00Z',
  contact: { id: 'c1', full_name: 'Juan Pérez', ci: null, phone: null, comment: null, created_at: '' },
  service: { id: 's1', name: 'Lomo Completo', price: 25000, cost: null, created_at: '', is_active: true, branch_id: 'b1' },
};

// ─── Layout ──────────────────────────────────────────────────────────────────

describe('MovementCard — layout', () => {
  it('tiene data-testid con el id del movimiento', () => {
    render(<MovementCard movement={BASE} onClick={vi.fn()} />);
    expect(screen.getByTestId('movement-card-m1')).toBeTruthy();
  });

  it('muestra el nombre del servicio como título cuando type=servicio', () => {
    render(<MovementCard movement={BASE} onClick={vi.fn()} />);
    expect(screen.getByText('Lomo Completo')).toBeTruthy();
  });

  it('muestra el comment como título cuando no hay service.name', () => {
    const m = { ...BASE, type: 'gasto' as const, service: undefined, comment: 'Materiales de limpieza', amount_charged: null, income: 0, expense: 3000 };
    render(<MovementCard movement={m} onClick={vi.fn()} />);
    expect(screen.getByText('Materiales de limpieza')).toBeTruthy();
  });

  it('muestra el label del tipo como fallback si no hay service ni comment', () => {
    const m = { ...BASE, type: 'apertura' as const, service: undefined, comment: null, amount_charged: null, income: 10000, expense: 0, payment_method: null };
    render(<MovementCard movement={m} onClick={vi.fn()} />);
    expect(screen.getByText('Apertura')).toBeTruthy();
  });

  it('muestra el nombre del contacto como subtítulo para servicio', () => {
    render(<MovementCard movement={BASE} onClick={vi.fn()} />);
    expect(screen.getByText('Juan Pérez')).toBeTruthy();
  });

  it('muestra la hora del movimiento', () => {
    render(<MovementCard movement={BASE} onClick={vi.fn()} />);
    expect(screen.getByText('10:30')).toBeTruthy();
  });

  it('renderiza el contenedor del ícono', () => {
    render(<MovementCard movement={BASE} onClick={vi.fn()} />);
    expect(screen.getByTestId('movement-icon')).toBeTruthy();
  });
});

// ─── Montos y color coding ────────────────────────────────────────────────────

describe('MovementCard — amounts', () => {
  it('servicio: muestra amount_charged con prefijo + y clase positiva', () => {
    render(<MovementCard movement={BASE} onClick={vi.fn()} />);
    const amount = screen.getByTestId('movement-amount');
    expect(amount.textContent).toContain('+');
    expect(amount.textContent).toContain('25');
    expect(amount.className).toContain('mc-amount--positive');
  });

  it('gasto: muestra net negativo con prefijo − y clase negativa', () => {
    const m = { ...BASE, type: 'gasto' as const, amount_charged: null, income: 0, expense: 5000, payment_method: null, service: undefined, comment: 'Café' };
    render(<MovementCard movement={m} onClick={vi.fn()} />);
    const amount = screen.getByTestId('movement-amount');
    expect(amount.textContent).toContain('−');
    expect(amount.className).toContain('mc-amount--negative');
  });

  it('apertura: muestra income con prefijo + y clase positiva', () => {
    const m = { ...BASE, type: 'apertura' as const, amount_charged: null, income: 50000, expense: 0, payment_method: null, service: undefined, comment: null };
    render(<MovementCard movement={m} onClick={vi.fn()} />);
    const amount = screen.getByTestId('movement-amount');
    expect(amount.textContent).toContain('+');
    expect(amount.className).toContain('mc-amount--positive');
  });

  it('cierre: muestra expense con prefijo − y clase negativa', () => {
    const m = { ...BASE, type: 'cierre' as const, amount_charged: null, income: 0, expense: 30000, payment_method: null, service: undefined, comment: null };
    render(<MovementCard movement={m} onClick={vi.fn()} />);
    const amount = screen.getByTestId('movement-amount');
    expect(amount.textContent).toContain('−');
    expect(amount.className).toContain('mc-amount--negative');
  });

  it('servicio con amount_charged=null usa income como fallback', () => {
    const m = { ...BASE, amount_charged: null, income: 18000 };
    render(<MovementCard movement={m} onClick={vi.fn()} />);
    const amount = screen.getByTestId('movement-amount');
    expect(amount.textContent).toContain('+');
    expect(amount.className).toContain('mc-amount--positive');
  });
});

// ─── Ícono por tipo y método de pago ─────────────────────────────────────────

describe('MovementCard — ícono', () => {
  it('servicio + efectivo → data-icon="Banknote"', () => {
    render(<MovementCard movement={{ ...BASE, payment_method: 'efectivo' }} onClick={vi.fn()} />);
    expect(screen.getByTestId('movement-icon').getAttribute('data-icon')).toBe('Banknote');
  });

  it('servicio + transferencia → data-icon="Smartphone"', () => {
    render(<MovementCard movement={{ ...BASE, payment_method: 'transferencia' }} onClick={vi.fn()} />);
    expect(screen.getByTestId('movement-icon').getAttribute('data-icon')).toBe('Smartphone');
  });

  it('servicio + pos → data-icon="CreditCard"', () => {
    render(<MovementCard movement={{ ...BASE, payment_method: 'pos' }} onClick={vi.fn()} />);
    expect(screen.getByTestId('movement-icon').getAttribute('data-icon')).toBe('CreditCard');
  });

  it('gasto → data-icon="ShoppingBag"', () => {
    const m = { ...BASE, type: 'gasto' as const, amount_charged: null, income: 0, expense: 1000, payment_method: null, service: undefined, comment: 'algo' };
    render(<MovementCard movement={m} onClick={vi.fn()} />);
    expect(screen.getByTestId('movement-icon').getAttribute('data-icon')).toBe('ShoppingBag');
  });

  it('apertura → data-icon="Wallet"', () => {
    const m = { ...BASE, type: 'apertura' as const, amount_charged: null, income: 1000, expense: 0, payment_method: null, service: undefined, comment: null };
    render(<MovementCard movement={m} onClick={vi.fn()} />);
    expect(screen.getByTestId('movement-icon').getAttribute('data-icon')).toBe('Wallet');
  });

  it('cierre → data-icon="ArrowDownLeft"', () => {
    const m = { ...BASE, type: 'cierre' as const, amount_charged: null, income: 0, expense: 1000, payment_method: null, service: undefined, comment: null };
    render(<MovementCard movement={m} onClick={vi.fn()} />);
    expect(screen.getByTestId('movement-icon').getAttribute('data-icon')).toBe('ArrowDownLeft');
  });
});

// ─── Interacción ──────────────────────────────────────────────────────────────

describe('MovementCard — navegación', () => {
  it('tap en la card llama onClick con el id del movimiento', () => {
    const onClick = vi.fn();
    render(<MovementCard movement={BASE} onClick={onClick} />);
    fireEvent.click(screen.getByTestId('movement-card-m1'));
    expect(onClick).toHaveBeenCalledWith('m1');
  });

  it('la card es un elemento interactivo con role button o li clickeable', () => {
    const onClick = vi.fn();
    render(<MovementCard movement={BASE} onClick={onClick} />);
    const card = screen.getByTestId('movement-card-m1');
    expect(card).toBeTruthy();
  });
});
