import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import SettingsPage from './page';
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

describe('SettingsPage /settings/general — "Negocio" (REQ-SETTINGSREORG-2)', () => {
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
      settings: { ...DEFAULT_BUSINESS_SETTINGS, business_name: 'Mi Negocio' },
      isLoading: false,
      initialized: true,
      refreshSettings: mockRefreshSettings,
    });
  });

  it('renders an access-restricted state when the user is not admin anywhere', () => {
    mockUseBranch.mockReturnValue({
      branches: [{ id: 'b1', user_role: 'user' }],
    });

    render(<SettingsPage />);

    expect(screen.queryByLabelText(/nombre del negocio/i)).toBeNull();
    expect(screen.getByText(/acceso restringido/i)).toBeTruthy();
  });

  it('titles the page "Negocio"', () => {
    mockUseBranch.mockReturnValue({
      branches: [{ id: 'b1', user_role: 'admin' }],
    });

    render(<SettingsPage />);

    expect(screen.getByRole('heading', { name: 'Negocio' })).toBeTruthy();
  });

  it('renders the full form pre-populated when the user is admin on at least one branch', () => {
    mockUseBranch.mockReturnValue({
      branches: [
        { id: 'b1', user_role: 'user' },
        { id: 'b2', user_role: 'admin' },
      ],
    });

    render(<SettingsPage />);

    expect(screen.queryByText(/acceso restringido/i)).toBeNull();
    const businessName = screen.getByLabelText(/nombre del negocio/i) as HTMLInputElement;
    expect(businessName.value).toBe('Mi Negocio');
    const servicesLabel = screen.getByLabelText(/nombre de servicios/i) as HTMLInputElement;
    expect(servicesLabel.value).toBe(DEFAULT_BUSINESS_SETTINGS.services_label);
  });

  it('renders a staff_label input pre-populated with the current settings value (generalize-verticals)', () => {
    mockUseBranch.mockReturnValue({
      branches: [{ id: 'b1', user_role: 'admin' }],
    });
    mockUseSettings.mockReturnValue({
      settings: { ...DEFAULT_BUSINESS_SETTINGS, staff_label: 'Mozo' },
      isLoading: false,
      initialized: true,
      refreshSettings: mockRefreshSettings,
    });

    render(<SettingsPage />);

    const input = screen.getByLabelText(/nombre de personal/i) as HTMLInputElement;
    expect(input.value).toBe('Mozo');
  });

  it('does NOT render the Rubro (vertical) select — that lives on /settings/branches now', () => {
    mockUseBranch.mockReturnValue({
      branches: [{ id: 'b1', user_role: 'admin' }],
    });

    render(<SettingsPage />);

    expect(screen.queryByLabelText(/rubro/i)).toBeNull();
  });

  it('does NOT render the module toggles (commissions/split payment/arqueo/inventory) — moved to /settings/modules', () => {
    mockUseBranch.mockReturnValue({
      branches: [{ id: 'b1', user_role: 'admin' }],
    });

    render(<SettingsPage />);

    expect(screen.queryByRole('switch', { name: /comisiones/i })).toBeNull();
    expect(screen.queryByRole('switch', { name: /pago dividido/i })).toBeNull();
    expect(screen.queryByRole('switch', { name: /arqueo obligatorio/i })).toBeNull();
    expect(screen.queryByRole('switch', { name: /inventario/i })).toBeNull();
  });

  it('renders a brand_color swatch radiogroup with the current preset checked', () => {
    mockUseBranch.mockReturnValue({
      branches: [{ id: 'b1', user_role: 'admin' }],
    });
    mockUseSettings.mockReturnValue({
      settings: { ...DEFAULT_BUSINESS_SETTINGS, brand_color: 'emerald' },
      isLoading: false,
      initialized: true,
      refreshSettings: mockRefreshSettings,
    });

    render(<SettingsPage />);

    expect(screen.getByRole('radiogroup')).toBeTruthy();
    expect(screen.getByRole('radio', { name: /esmeralda/i }).getAttribute('aria-checked')).toBe(
      'true'
    );
    expect(screen.getByRole('radio', { name: /pizarra/i }).getAttribute('aria-checked')).toBe(
      'false'
    );
  });

  it('clicking a swatch selects it (radio aria-checked flips)', () => {
    mockUseBranch.mockReturnValue({
      branches: [{ id: 'b1', user_role: 'admin' }],
    });

    render(<SettingsPage />);

    const violetSwatch = screen.getByRole('radio', { name: /violeta/i });
    expect(violetSwatch.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(violetSwatch);

    expect(violetSwatch.getAttribute('aria-checked')).toBe('true');
  });

  it('saving calls business_settings.update(...).eq(id, 1) with business_name and brand_color, then refreshSettings()', async () => {
    mockUseBranch.mockReturnValue({
      branches: [{ id: 'b1', user_role: 'admin' }],
    });

    render(<SettingsPage />);

    screen.getByText(/guardar/i).click();

    await waitFor(() => expect(mockFrom).toHaveBeenCalledWith('business_settings'));
    expect(mockEq).toHaveBeenCalledWith('id', 1);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        business_name: 'Mi Negocio',
        brand_color: DEFAULT_BUSINESS_SETTINGS.brand_color,
      })
    );
    const savedPayload = mockUpdate.mock.calls[0][0];
    expect(savedPayload).not.toHaveProperty('commissions_enabled');
    expect(savedPayload).not.toHaveProperty('vertical');
    await waitFor(() => expect(mockRefreshSettings).toHaveBeenCalled());
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'success'));
  });

  it('shows an error toast when the save fails', async () => {
    mockUseBranch.mockReturnValue({
      branches: [{ id: 'b1', user_role: 'admin' }],
    });
    mockEq.mockResolvedValue({ error: { message: 'boom' } });

    render(<SettingsPage />);

    screen.getByText(/guardar/i).click();

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('boom', 'error'));
    expect(mockRefreshSettings).not.toHaveBeenCalled();
  });
});
