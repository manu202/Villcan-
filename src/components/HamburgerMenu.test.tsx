import { describe, it, expect, vi } from 'vitest';
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

describe('HamburgerMenu services nav item (business_settings.services_label)', () => {
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
