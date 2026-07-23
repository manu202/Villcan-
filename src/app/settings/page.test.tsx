import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SettingsPage from './page';

const mockUseBranch = vi.fn();
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => mockUseBranch(),
}));

describe('SettingsPage hub (REQ-SETTINGSREORG-1)', () => {
  beforeEach(() => {
    mockUseBranch.mockReset();
  });

  it('renders an access-restricted state when the user is not admin anywhere', () => {
    mockUseBranch.mockReturnValue({
      branches: [{ id: 'b1', user_role: 'barber' }],
    });

    render(<SettingsPage />);

    expect(screen.getByText(/acceso restringido/i)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /general/i })).toBeNull();
  });

  it('renders 3 navigable cards (General, Sucursales, Usuarios) when admin on at least one branch', () => {
    mockUseBranch.mockReturnValue({
      branches: [
        { id: 'b1', user_role: 'barber' },
        { id: 'b2', user_role: 'admin' },
      ],
    });

    render(<SettingsPage />);

    expect(screen.queryByText(/acceso restringido/i)).toBeNull();

    const general = screen.getByRole('link', { name: /general/i });
    expect(general.getAttribute('href')).toBe('/settings/general');

    const branches = screen.getByRole('link', { name: /sucursales/i });
    expect(branches.getAttribute('href')).toBe('/settings/branches');

    const users = screen.getByRole('link', { name: /usuarios/i });
    expect(users.getAttribute('href')).toBe('/settings/users');
  });

  it('does not render the settings form inline (moved to /settings/general)', () => {
    mockUseBranch.mockReturnValue({
      branches: [{ id: 'b1', user_role: 'admin' }],
    });

    render(<SettingsPage />);

    expect(screen.queryByRole('switch', { name: /comisiones/i })).toBeNull();
    expect(screen.queryByLabelText(/nombre de servicios/i)).toBeNull();
  });
});
