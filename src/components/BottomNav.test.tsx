import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BottomNav } from './BottomNav';

vi.mock('next/navigation', () => ({ usePathname: () => '/orders' }));
vi.mock('@/hooks/usePendingOrdersCount', () => ({ usePendingOrdersCount: () => 3 }));

describe('BottomNav', () => {
  it('renders 4 navigation links', () => {
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: /caja/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /pedidos/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /movimientos/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /cat/i })).toBeTruthy();
  });

  it('marks the active tab (Pedidos at /orders) with aria-current="page"', () => {
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: /pedidos/i }).getAttribute('aria-current')).toBe('page');
  });

  it('does not mark inactive tabs with aria-current', () => {
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: /caja/i }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('link', { name: /movimientos/i }).getAttribute('aria-current')).toBeNull();
  });

  it('shows the pending-orders badge with the count when count > 0', () => {
    render(<BottomNav />);
    const badge = screen.getByTestId('orders-badge');
    expect(badge.textContent).toBe('3');
  });
});
