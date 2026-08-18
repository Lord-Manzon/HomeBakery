import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../theme';
import type { GaugeStatus } from '../services/stockGauge';

type StockGaugeProps = {
  percent: number | null;
  status: GaugeStatus;
  /** Compact = thin bar only, no hint text (list cards). Default = adds
   * the "Set a low-stock alert..." hint when percent is null. */
  hint?: string;
};

function colorForStatus(status: GaugeStatus): string {
  if (status === 'out') return colors.danger;
  if (status === 'low') return colors.warning;
  if (status === 'none') return colors.border;
  return colors.success;
}

export function StockGauge({ percent, status, hint }: StockGaugeProps) {
  if (percent === null) {
    return (
      <Text style={styles.hint}>{hint ?? 'Set a low-stock alert to track this'}</Text>
    );
  }
  const barColor = colorForStatus(status);
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${percent}%`, backgroundColor: barColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
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

export { colorForStatus };
