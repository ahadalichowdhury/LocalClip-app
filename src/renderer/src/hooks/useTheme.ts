import { useEffect, useState } from 'react';
import { applyGlass } from '../lib/glass';
import { applyHighlight } from '../lib/highlight';

export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    // Load initial settings
    loadSettings();
  }, []);

  useEffect(() => {
    if (settings) {
      applyTheme(settings.theme);
      applyHighlight(settings.highlightColor);
      applyGlass(settings.glassEffect, settings.glassOpacity);
    }
  }, [settings]);

  const loadSettings = async () => {
    try {
      if (window.electronAPI?.settings?.getAll) {
        const allSettings = await window.electronAPI.settings.getAll();
        setSettings(allSettings);
      }
    } catch (error) {
      console.error('Failed to load settings for theme:', error);
    }
  };

  const applyTheme = (themeMode: 'light' | 'dark' | 'auto') => {
    let resolvedTheme: 'light' | 'dark' = 'light';

    if (themeMode === 'auto') {
      // Use system preference
      resolvedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    } else {
      resolvedTheme = themeMode;
    }

    // Apply theme to document
    const root = document.documentElement;
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    setTheme(resolvedTheme);
  };

  const updateTheme = async (newTheme: 'light' | 'dark' | 'auto') => {
    try {
      if (window.electronAPI?.settings?.set) {
        await window.electronAPI.settings.set('theme', newTheme);
        setSettings((prev: any) =>
          prev ? { ...prev, theme: newTheme } : null
        );
      }
    } catch (error) {
      console.error('Failed to update theme:', error);
    }
  };

  // Listen for system theme changes when in auto mode
  useEffect(() => {
    if (settings?.theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme('auto');

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [settings?.theme]);

  return {
    theme,
    settings,
    updateTheme,
    refreshSettings: loadSettings,
  };
}
