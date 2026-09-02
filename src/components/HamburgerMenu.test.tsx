import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HamburgerMenu } from './HamburgerMenu';

vi.mock('next/navigation', () => ({
  usePathname: () => '/services',
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

vi.mock('@/hooks/usePendingOrdersCount', () => ({
  usePendingOrdersCount: () => 0,
}));

const mockUseSettings = vi.fn();
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => mockUseSettings(),
}));

const mockUseBranch = vi.fn();
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => mockUseBranch(),
}));

describe('HamburgerMenu services nav item (business_settings.services_label)', () => {
  beforeEach(() => {
    mockUseBranch.mockReturnValue({ branches: [{ id: 'b1', user_role: 'admin' }] });
  });

  it('uses services_label from settings instead of a hardcoded "Servicios"', () => {
    mockUseSettings.mockReturnValue({ settings: { services_label: 'Menú' } });

    render(<HamburgerMenu />);

    expect(screen.getByText('Menú')).toBeTruthy();
    expect(screen.queryByText('Servicios')).toBeNull();
  });

  it('falls back to the default label "Servicios" when settings say so', () => {
    mockUseSettings.mockReturnValue({ settings: { services_label: 'Servicios' } });

    render(<HamburgerMenu />);

    expect(screen.getByText('Servicios')).toBeTruthy();
  });

  it('does not use the barbershop-specific Scissors icon for the module link', () => {
    mockUseSettings.mockReturnValue({ settings: { services_label: 'Productos' } });

    const { container } = render(<HamburgerMenu />);

    // lucide-react icons render as <svg class="lucide lucide-scissors ...">
    expect(container.querySelector('.lucide-scissors')).toBeNull();
  });
});

describe('HamburgerMenu grouped sections (IA reorg)', () => {
  beforeEach(() => {
    mockUseSettings.mockReturnValue({ settings: { services_label: 'Servicios' } });
    mockUseBranch.mockReturnValue({ branches: [{ id: 'b1', user_role: 'admin' }] });
  });

  it('renders the four section headers', () => {
    render(<HamburgerMenu />);

    expect(screen.getByText('OPERACIÓN')).toBeTruthy();
    expect(screen.getByText('CATÁLOGO')).toBeTruthy();
    expect(screen.getByText('ANÁLISIS')).toBeTruthy();
    expect(screen.getByText('CONFIGURACIÓN')).toBeTruthy();
  });

  it('no longer links to /errors ("Errores de usuarios" removed from the menu)', () => {
    render(<HamburgerMenu />);

    expect(screen.queryByText(/errores de usuarios/i)).toBeNull();
    expect(screen.queryByRole('link', { name: /errores/i })).toBeNull();
  });

  it('still renders all the remaining nav items', () => {
    render(<HamburgerMenu />);

    expect(screen.getByRole('link', { name: /^caja$/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /movimientos/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /pedidos/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /contactos/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /reportes/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /cierres de caja/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /^configuración$/i })).toBeTruthy();
  });
});
