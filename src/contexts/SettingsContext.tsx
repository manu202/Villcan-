'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { BusinessSettings } from '@/types';
import { getBusinessSettings, DEFAULT_BUSINESS_SETTINGS } from '@/lib/settings';

interface SettingsContextValue {
  settings: BusinessSettings; // never null — falls back to hardcoded defaults on error/loading
  isLoading: boolean;
  initialized: boolean;
  refreshSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const BRAND_COLOR_STORAGE_KEY = 'brand_color';

// DB is the source of truth for brand_color (REQ-THEME-5). Cache to
// localStorage (read by the pre-hydration inline script for a flash-free
// paint on the next load) and stamp <html data-accent> so it applies
// app-wide, not just on /settings, once it resolves — overwriting whatever
// the cached value stamped optimistically pre-hydration.
function applyBrandColor(brandColor: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BRAND_COLOR_STORAGE_KEY, brandColor);
  } catch {
    // localStorage unavailable (e.g. private mode) — non-fatal, DB remains source of truth.
  }
  document.documentElement.setAttribute('data-accent', brandColor);
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_BUSINESS_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  const refreshSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const fetched = await getBusinessSettings();
      setSettings(fetched);
      applyBrandColor(fetched.brand_color);
    } catch (error) {
      console.error('Failed to load business settings:', error);
      setSettings(DEFAULT_BUSINESS_SETTINGS);
    } finally {
      setIsLoading(false);
      setInitialized(true);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      await refreshSettings();
    };
    load();
  }, [refreshSettings]);

  return (
    <SettingsContext.Provider value={{ settings, isLoading, initialized, refreshSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
}
