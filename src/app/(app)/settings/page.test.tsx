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
      branches: [{ id: 'b1', user_role: 'user' }],
    });

    render(<SettingsPage />);

    expect(screen.getByText(/acceso restringido/i)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /negocio/i })).toBeNull();
  });

  it('renders navigable cards (Negocio, Sucursales, Módulos, Usuarios, Soporte) when admin on at least one branch', () => {
    mockUseBranch.mockReturnValue({
      branches: [
        { id: 'b1', user_role: 'user' },
        { id: 'b2', user_role: 'admin' },
      ],
    });

    render(<SettingsPage />);

    expect(screen.queryByText(/acceso restringido/i)).toBeNull();

    const negocio = screen.getByRole('link', { name: /negocio/i });
    expect(negocio.getAttribute('href')).toBe('/settings/general');

    const branches = screen.getByRole('link', { name: /sucursales/i });
    expect(branches.getAttribute('href')).toBe('/settings/branches');

    const modules = screen.getByRole('link', { name: /módulos/i });
    expect(modules.getAttribute('href')).toBe('/settings/modules');

    const users = screen.getByRole('link', { name: /usuarios/i });
    expect(users.getAttribute('href')).toBe('/settings/users');

    const support = screen.getByRole('link', { name: /soporte/i });
    expect(support.getAttribute('href')).toBe('/errors');
  });

  it('does not render a "Tienda" card (store screen folded into Sucursales)', () => {
    mockUseBranch.mockReturnValue({
      branches: [{ id: 'b1', user_role: 'admin' }],
    });

    render(<SettingsPage />);

    expect(screen.queryByRole('link', { name: /^tienda$/i })).toBeNull();
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
