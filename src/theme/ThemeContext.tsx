import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { buildPalette, type ThemeMode } from './palettes';
import type { ColorToken } from './colors';

type BakerThemePreference = {
  themeAccent: string;
  themeMode: 'light' | 'dark' | 'system';
};

type ThemeContextValue = {
  colors: Record<ColorToken, string>;
  mode: ThemeMode; // resolved — 'system' already turned into 'light'/'dark'
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Wraps the app. Reads the baker's saved accent/mode preference and
 * provides a computed palette to every descendant via useThemeColors().
 *
 * INTEGRATION NOTE for whoever wires this in: `preference` should come
 * from the baker profile hook/service (the same one that already reads
 * `bakers.default_margin_percent` etc. — see src/hooks and src/services).
 * Passed as a prop here rather than fetched internally, so this component
 * stays easy to test and doesn't need to know about TanStack Query.
 *
 * Until a screen adds an accent/mode picker (not built yet — that's the
 * next piece), every baker gets the default from the 0003 migration:
 * accent #C9683F, mode 'system'.
 */
export function ThemeProvider({
  preference,
  children,
}: {
  preference: BakerThemePreference;
  children: React.ReactNode;
}) {
  const systemScheme = useColorScheme(); // 'light' | 'dark' | null

  const resolvedMode: ThemeMode =
    preference.themeMode === 'system'
      ? systemScheme === 'dark'
        ? 'dark'
        : 'light'
      : preference.themeMode;

  const colors = useMemo(
    () => buildPalette(preference.themeAccent, resolvedMode),
    [preference.themeAccent, resolvedMode]
  );

  const value = useMemo(
    () => ({ colors, mode: resolvedMode }),
    [colors, resolvedMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Use this in any NEW screen/component that should react to the baker's
 * theme choice. Existing components using the static `import { colors }
 * from 'src/theme'` are unaffected and keep working — migrating them to
 * this hook is a separate, later cleanup pass, not required now.
 *
 * Usage:
 *   const { colors } = useThemeColors();
 *   const styles = StyleSheet.create({ box: { backgroundColor: colors.surface } });
 *
 * Note: StyleSheet.create() can't itself be reactive, so components using
 * this hook should build their style objects inline or via useMemo keyed
 * on `colors`, rather than a static StyleSheet.create() at module scope.
 */
export function useThemeColors(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useThemeColors must be used inside a ThemeProvider');
  }
  return ctx;
}
