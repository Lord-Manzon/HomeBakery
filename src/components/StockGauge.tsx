import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../theme/ThemeContext';
import { radii, spacing, typography } from '../theme';
import type { ColorToken } from '../theme/colors';
import type { GaugeStatus } from '../services/stockGauge';

type StockGaugeProps = {
  percent: number | null;
  status: GaugeStatus;
  /** Compact = thin bar only, no hint text (list cards). Default = adds
   * the "Set a low-stock alert..." hint when percent is null. */
  hint?: string;
};

function colorForStatus(colors: Record<ColorToken, string>, status: GaugeStatus): string {
  if (status === 'out') return colors.danger;
  if (status === 'low') return colors.warning;
  if (status === 'none') return colors.border;
  return colors.success;
}

// UPDATED 2026-08-21: switched to useThemeColors() so the gauge's bar and
// track colors follow the baker's accent/light-dark preference (see
// BottomSheet.tsx, FormField.tsx, IngredientFormSheet.tsx,
// GaugeSensitivitySheet.tsx for the same pattern).
//
// Also fixed: "out of stock" (percent === 0) was rendering the fill at
// width: '0%', which is visually indistinguishable from the empty
// track's own background — an out-of-stock ingredient looked like a
// plain, unremarkable bar instead of an urgent one. Out-of-stock now
// always renders as a FULL, solid danger-colored bar (same convention
// as a phone battery going solid red at critical) rather than a
// literal, invisible 0% fill.
export function StockGauge({ percent, status, hint }: StockGaugeProps) {
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (percent === null) {
    return (
      <Text style={styles.hint}>{hint ?? 'Set a low-stock alert to track this'}</Text>
    );
  }
  const barColor = colorForStatus(colors, status);
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${percent}%`, backgroundColor: barColor }]} />
    </View>
  );
}

function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    track: {
      height: 6,
      borderRadius: radii.full,
      backgroundColor: colors.surfaceMuted,
      overflow: 'hidden',
    },
    
    fill: {
      height: '100%',
      borderRadius: radii.full,
    },
    hint: {
      ...typography.caption,
      color: colors.textSecondary,
    },
  });
}