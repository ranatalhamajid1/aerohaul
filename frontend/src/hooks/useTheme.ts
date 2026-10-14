import { useCallback, useEffect, useState } from 'react';
import type { ThemeName } from '../lib/tokens';

const KEY = 'aerohaul-theme';

function initialTheme(): ThemeName {
  const saved = localStorage.getItem(KEY);
  return saved === 'light' || saved === 'dark' ? saved : 'dark';
}

export function useTheme(): [ThemeName, () => void] {
  const [theme, setTheme] = useState<ThemeName>(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(KEY, theme);
  }, [theme]);
  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  return [theme, toggle];
}
