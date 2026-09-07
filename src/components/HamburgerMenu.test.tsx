import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HamburgerMenu } from './HamburgerMenu';

vi.mock('next/navigation', () => ({
  usePathname: () => '/reports',
}));

vi.mock('./AuthButton', () => ({
  AuthButton: () => <div data-testid="auth-button" />,
}));

vi.mock('./BranchSelector', () => ({
  BranchSelector: () => <div data-testid="branch-selector" />,
}));

vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'system', setTheme: vi.fn() }),
}));

const mockUseBranch = vi.fn();
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => mockUseBranch(),
}));

describe('HamburgerMenu — secondary navigation sections', () => {
  beforeEach(() => {
    mockUseBranch.mockReturnValue({ branches: [{ id: 'b1', user_role: 'admin' }] });
  });

  it('renders ANÁLISIS and CONFIGURACIÓN section headers', () => {
    render(<HamburgerMenu />);

    expect(screen.getByText('ANÁLISIS')).toBeTruthy();
    expect(screen.getByText('CONFIGURACIÓN')).toBeTruthy();
  });

  it('does not render OPERACIÓN or CATÁLOGO (moved to BottomNav)', () => {
    render(<HamburgerMenu />);

    expect(screen.queryByText('OPERACIÓN')).toBeNull();
    expect(screen.queryByText('CATÁLOGO')).toBeNull();
  });

  it('no longer links to /errors ("Errores de usuarios" removed from the menu)', () => {
    render(<HamburgerMenu />);

    expect(screen.queryByText(/errores de usuarios/i)).toBeNull();
    expect(screen.queryByRole('link', { name: /errores/i })).toBeNull();
  });

  it('renders secondary nav links: Reportes, Cierres de Caja, Configuración', () => {
    render(<HamburgerMenu />);

    expect(screen.getByRole('link', { name: /reportes/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /cierres de caja/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /^configuración$/i })).toBeTruthy();
  });

  it('does not render primary nav links (Caja, Pedidos, Movimientos, Catálogo) — those are in BottomNav', () => {
    render(<HamburgerMenu />);

    expect(screen.queryByRole('link', { name: /^caja$/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /pedidos/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /movimientos/i })).toBeNull();
  });
});
