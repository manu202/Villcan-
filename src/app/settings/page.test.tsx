import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

describe('SettingsPage (REQ-CONFIG-6, REQ-CONFIG-7)', () => {
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

    expect(screen.queryByLabelText(/comisiones/i)).toBeNull();
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

  it('saving calls business_settings.update(...).eq(id, 1) and then refreshSettings()', async () => {
    mockUseBranch.mockReturnValue({
      branches: [{ id: 'b1', user_role: 'admin' }],
    });

    render(<SettingsPage />);

    screen.getByText(/guardar/i).click();

    await waitFor(() => expect(mockFrom).toHaveBeenCalledWith('business_settings'));
    expect(mockEq).toHaveBeenCalledWith('id', 1);
    await waitFor(() => expect(mockRefreshSettings).toHaveBeenCalled());
  });
});
