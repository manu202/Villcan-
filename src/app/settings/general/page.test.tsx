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

const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockFrom = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

const mockRefreshSettings = vi.fn();

describe('SettingsPage /settings/general (REQ-SETTINGSREORG-2)', () => {
  beforeEach(() => {
    mockUpdate.mockReset();
    mockEq.mockReset();
    mockFrom.mockReset();
    mockRefreshSettings.mockReset();

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
      branches: [{ id: 'b1', user_role: 'barber' }],
    });

    render(<SettingsPage />);

    expect(screen.queryByRole('switch', { name: /comisiones/i })).toBeNull();
    expect(screen.getByText(/acceso restringido/i)).toBeTruthy();
  });

  it('renders the full form pre-populated when the user is admin on at least one branch', () => {
    mockUseBranch.mockReturnValue({
      branches: [
        { id: 'b1', user_role: 'barber' },
        { id: 'b2', user_role: 'admin' },
      ],
    });

    render(<SettingsPage />);

    expect(screen.queryByText(/acceso restringido/i)).toBeNull();
    const label = screen.getByLabelText(/nombre de servicios/i) as HTMLInputElement;
    expect(label.value).toBe(DEFAULT_BUSINESS_SETTINGS.services_label);
  });

  it('renders the four business-settings toggles as accessible switches reflecting their checked state', () => {
    mockUseBranch.mockReturnValue({
      branches: [{ id: 'b1', user_role: 'admin' }],
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

    render(<SettingsPage />);

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

  it('toggling a switch flips its aria-checked state', () => {
    mockUseBranch.mockReturnValue({
      branches: [{ id: 'b1', user_role: 'admin' }],
    });

    render(<SettingsPage />);

    const commissionsSwitch = screen.getByRole('switch', { name: /comisiones/i });
    expect(commissionsSwitch.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(commissionsSwitch);

    expect(commissionsSwitch.getAttribute('aria-checked')).toBe('true');
  });

  it('saving calls business_settings.update(...).eq(id, 1) with brand_color included, then refreshSettings()', async () => {
    mockUseBranch.mockReturnValue({
      branches: [{ id: 'b1', user_role: 'admin' }],
    });

    render(<SettingsPage />);

    screen.getByText(/guardar/i).click();

    await waitFor(() => expect(mockFrom).toHaveBeenCalledWith('business_settings'));
    expect(mockEq).toHaveBeenCalledWith('id', 1);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ brand_color: DEFAULT_BUSINESS_SETTINGS.brand_color })
    );
    await waitFor(() => expect(mockRefreshSettings).toHaveBeenCalled());
  });
});
