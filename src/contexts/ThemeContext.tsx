'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'theme';

function resolveInitialTheme(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
}

function applyThemeAttribute(theme: ThemePreference) {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Always start from 'system' so the first CLIENT render matches what the
  // server rendered (server has no access to localStorage). The blocking
  // inline script in layout.tsx already stamped the real value on <html>
  // pre-hydration, so there's no visual flash — this state only drives
  // React's own tree (e.g. the toggle's icon/label), not the CSS. Resolving
  // the real localStorage value happens in an effect below, which only runs
  // after hydration completes, avoiding the mismatch entirely.
  const [theme, setThemeState] = useState<ThemePreference>('system');

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    applyThemeAttribute(next);
  }, []);

  // Post-hydration only: pick up the real stored preference and reconcile
  // <html data-theme> in case something external changed it.
  useEffect(() => {
    function syncFromStorage() {
      setThemeState(resolveInitialTheme());
    }
    syncFromStorage();
  }, []);

  useEffect(() => {
    applyThemeAttribute(theme);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
