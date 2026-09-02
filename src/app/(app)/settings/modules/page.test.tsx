import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ModulesPage from './page';
import { DEFAULT_BUSINESS_SETTINGS } from '@/lib/settings';

const mockUseBranch = vi.fn();
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => mockUseBranch(),
}));

const mockUseSettings = vi.fn();
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => mockUseSettings(),
}));

const mockShowToast = vi.fn();
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockFrom = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

const mockRefreshSettings = vi.fn();

describe('ModulesPage /settings/modules (REQ-SETTINGSREORG-4)', () => {
  beforeEach(() => {
    mockUpdate.mockReset();
    mockEq.mockReset();
    mockFrom.mockReset();
    mockRefreshSettings.mockReset();
    mockShowToast.mockReset();

    mockEq.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ update: mockUpdate });

    mockUseSettings.mockReturnValue({
      settings: DEFAULT_BUSINESS_SETTINGS,
      isLoading: false,
      initialized: true,
      refreshSettings: mockRefreshSettings,
    });
  });

  it('renders an access-restricted state when the user is not admin anywhere', () => {
    mockUseBranch.mockReturnValue({
      branches: [{ id: 'b1', user_role: 'user' }],
    });

    render(<ModulesPage />);

    expect(screen.queryByRole('switch', { name: /pago dividido/i })).toBeNull();
    expect(screen.getByText(/acceso restringido/i)).toBeTruthy();
  });

  it('titles the page "Módulos"', () => {
    mockUseBranch.mockReturnValue({
      branches: [{ id: 'b1', user_role: 'admin' }],
      currentBranch: { id: 'b1', user_role: 'admin', vertical: 'generic' },
    });

    render(<ModulesPage />);

    expect(screen.getByRole('heading', { name: 'Módulos' })).toBeTruthy();
  });

  it('only shows the commissions toggle when the current branch vertical is barbershop', () => {
    mockUseBranch.mockReturnValue({
      branches: [{ id: 'b1', user_role: 'admin' }],
      currentBranch: { id: 'b1', user_role: 'admin', vertical: 'generic' },
    });

    render(<ModulesPage />);

    expect(screen.queryByRole('switch', { name: /comisiones/i })).toBeNull();
  });

  it('shows the commissions toggle when the current branch vertical is barbershop', () => {
    mockUseBranch.mockReturnValue({
      branches: [{ id: 'b1', user_role: 'admin' }],
      currentBranch: { id: 'b1', user_role: 'admin', vertical: 'barbershop' },
    });

    render(<ModulesPage />);

    expect(screen.getByRole('switch', { name: /comisiones/i })).toBeTruthy();
  });

  it('renders the four toggles as accessible switches reflecting their checked state', () => {
    mockUseBranch.mockReturnValue({
      branches: [{ id: 'b1', user_role: 'admin' }],
      currentBranch: { id: 'b1', user_role: 'admin', vertical: 'barbershop' },
    });
    mockUseSettings.mockReturnValue({
      settings: {
        ...DEFAULT_BUSINESS_SETTINGS,
        commissions_enabled: true,
        split_payment_enabled: false,
        mandatory_arqueo_enabled: true,
        inventory_enabled: false,
      },
      isLoading: false,
      initialized: true,
      refreshSettings: mockRefreshSettings,
    });

    render(<ModulesPage />);

    expect(screen.getByRole('switch', { name: /comisiones/i }).getAttribute('aria-checked')).toBe(
      'true'
    );
    expect(
      screen.getByRole('switch', { name: /pago dividido/i }).getAttribute('aria-checked')
    ).toBe('false');
    expect(
      screen.getByRole('switch', { name: /arqueo obligatorio/i }).getAttribute('aria-checked')
    ).toBe('true');
    expect(screen.getByRole('switch', { name: /inventario/i }).getAttribute('aria-checked')).toBe(
      'false'
    );
  });

  it('renders a one-line explanatory hint under each toggle', () => {
    mockUseBranch.mockReturnValue({
      branches: [{ id: 'b1', user_role: 'admin' }],
      currentBranch: { id: 'b1', user_role: 'admin', vertical: 'barbershop' },
    });

    render(<ModulesPage />);

    expect(screen.getByText(/comisión en cada servicio/i)).toBeTruthy();
    expect(screen.getByText(/combinando más de un método de pago/i)).toBeTruthy();
    expect(screen.getByText(/cerrar caja \(arqueo\)/i)).toBeTruthy();
    expect(screen.getByText(/control de stock/i)).toBeTruthy();
  });

  it('toggling a switch flips its aria-checked state', () => {
    mockUseBranch.mockReturnValue({
      branches: [{ id: 'b1', user_role: 'admin' }],
      currentBranch: { id: 'b1', user_role: 'admin', vertical: 'barbershop' },
    });

    render(<ModulesPage />);

    const commissionsSwitch = screen.getByRole('switch', { name: /comisiones/i });
    expect(commissionsSwitch.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(commissionsSwitch);

    expect(commissionsSwitch.getAttribute('aria-checked')).toBe('true');
  });

  it('saving calls business_settings.update(...).eq(id, 1) with the four toggle fields, then refreshSettings()', async () => {
    mockUseBranch.mockReturnValue({
      branches: [{ id: 'b1', user_role: 'admin' }],
      currentBranch: { id: 'b1', user_role: 'admin', vertical: 'barbershop' },
    });

    render(<ModulesPage />);

    screen.getByText(/guardar/i).click();

    await waitFor(() => expect(mockFrom).toHaveBeenCalledWith('business_settings'));
    expect(mockEq).toHaveBeenCalledWith('id', 1);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        commissions_enabled: DEFAULT_BUSINESS_SETTINGS.commissions_enabled,
        split_payment_enabled: DEFAULT_BUSINESS_SETTINGS.split_payment_enabled,
        mandatory_arqueo_enabled: DEFAULT_BUSINESS_SETTINGS.mandatory_arqueo_enabled,
        inventory_enabled: DEFAULT_BUSINESS_SETTINGS.inventory_enabled,
      })
    );
    const savedPayload = mockUpdate.mock.calls[0][0];
    expect(savedPayload).not.toHaveProperty('business_name');
    expect(savedPayload).not.toHaveProperty('services_label');
    await waitFor(() => expect(mockRefreshSettings).toHaveBeenCalled());
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'success'));
  });

  it('shows an error toast when the save fails', async () => {
    mockUseBranch.mockReturnValue({
      branches: [{ id: 'b1', user_role: 'admin' }],
      currentBranch: { id: 'b1', user_role: 'admin', vertical: 'generic' },
    });
    mockEq.mockResolvedValue({ error: { message: 'boom' } });

    render(<ModulesPage />);

    screen.getByText(/guardar/i).click();

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('boom', 'error'));
    expect(mockRefreshSettings).not.toHaveBeenCalled();
  });
});
