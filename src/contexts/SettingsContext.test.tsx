import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SettingsProvider, useSettings } from './SettingsContext';
import { DEFAULT_BUSINESS_SETTINGS } from '@/lib/settings';
import type { BusinessSettings } from '@/types';

const mockGetBusinessSettings = vi.fn();
vi.mock('@/lib/settings', async () => {
  const actual = await vi.importActual<typeof import('@/lib/settings')>('@/lib/settings');
  return {
    ...actual,
    getBusinessSettings: () => mockGetBusinessSettings(),
  };
});

function Consumer() {
  const { settings, isLoading, initialized, refreshSettings } = useSettings();
  return (
    <div>
      <span data-testid="commissions">{String(settings.commissions_enabled)}</span>
      <span data-testid="label">{settings.services_label}</span>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="initialized">{String(initialized)}</span>
      <button onClick={() => refreshSettings()}>refresh</button>
    </div>
  );
}

describe('SettingsContext', () => {
  beforeEach(() => {
    mockGetBusinessSettings.mockReset();
  });

  it('yields hardcoded defaults before the fetch resolves', () => {
    let resolveFetch: (v: BusinessSettings) => void = () => {};
    mockGetBusinessSettings.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    render(
      <SettingsProvider>
        <Consumer />
      </SettingsProvider>
    );

    expect(screen.getByTestId('commissions').textContent).toBe(
      String(DEFAULT_BUSINESS_SETTINGS.commissions_enabled)
    );
    expect(screen.getByTestId('label').textContent).toBe(DEFAULT_BUSINESS_SETTINGS.services_label);

    // avoid unhandled rejection/dangling promise warnings
    resolveFetch(DEFAULT_BUSINESS_SETTINGS);
  });

  it('falls back to defaults when the fetch rejects, and settles isLoading/initialized', async () => {
    mockGetBusinessSettings.mockRejectedValue(new Error('boom'));

    render(
      <SettingsProvider>
        <Consumer />
      </SettingsProvider>
    );

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('initialized').textContent).toBe('true');
    expect(screen.getByTestId('commissions').textContent).toBe(
      String(DEFAULT_BUSINESS_SETTINGS.commissions_enabled)
    );
    expect(screen.getByTestId('label').textContent).toBe(DEFAULT_BUSINESS_SETTINGS.services_label);
  });

  it('reflects the fetched row exactly (no silent merge with defaults)', async () => {
    const fetchedRow: BusinessSettings = {
      id: 1,
      commissions_enabled: true,
      default_commission_pct: 15,
      split_payment_enabled: true,
      mandatory_arqueo_enabled: true,
      inventory_enabled: true,
      services_label: 'Cortes',
      brand_color: 'emerald',
      updated_at: '2026-01-01T00:00:00.000Z',
      updated_by: 'user-1',
    };
    mockGetBusinessSettings.mockResolvedValue(fetchedRow);

    render(
      <SettingsProvider>
        <Consumer />
      </SettingsProvider>
    );

    await waitFor(() => expect(screen.getByTestId('label').textContent).toBe('Cortes'));
    expect(screen.getByTestId('commissions').textContent).toBe('true');
  });

  it('refreshSettings() re-fetches and updates settings', async () => {
    mockGetBusinessSettings.mockResolvedValueOnce(DEFAULT_BUSINESS_SETTINGS);

    render(
      <SettingsProvider>
        <Consumer />
      </SettingsProvider>
    );

    await waitFor(() => expect(screen.getByTestId('initialized').textContent).toBe('true'));

    mockGetBusinessSettings.mockResolvedValueOnce({
      ...DEFAULT_BUSINESS_SETTINGS,
      services_label: 'Peluquería',
    });

    screen.getByText('refresh').click();

    await waitFor(() => expect(screen.getByTestId('label').textContent).toBe('Peluquería'));
  });

  it('useSettings() throws when called outside SettingsProvider', async () => {
    const { renderHook } = await import('@testing-library/react');
    const { result } = renderHook(() => {
      try {
        useSettings();
        return null;
      } catch (err) {
        return err as Error;
      }
    });

    expect(result.current).toBeInstanceOf(Error);
  });
});
