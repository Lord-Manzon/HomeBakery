import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radii, typography } from '../theme';
import type { ColorToken } from '../theme/colors';
import type { RecipeStep } from '../types/recipe';

type Props = {
  steps: RecipeStep[];
  accentColor: string;
  colors: Record<ColorToken, string>;
};

/**
 * Read-only numbered timeline for a recipe's instructions. Shared between
 * the Recipe detail screen's Instructions tab (so a baker can see the
 * steps without an extra navigation, same as the Ingredients tab already
 * showing its list directly) and the standalone Instructions screen's
 * View mode (where editing/reordering happens). One component, one
 * visual, instead of two places rendering the same thing that could
 * quietly drift apart over time.
 */
export function InstructionsTimeline({ steps, accentColor, colors }: Props) {
  const styles = makeStyles(colors);
  return (
    <>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const hasMeta = step.duration_minutes != null || step.temperature_celsius != null;
        return (
          <View key={index} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: accentColor }]}>
                <Text style={styles.dotText}>{index + 1}</Text>
              </View>
              {!isLast ? <View style={[styles.line, { backgroundColor: `${accentColor}33` }]} /> : null}
            </View>
            <View style={styles.card}>
              <Text style={styles.stepText}>{step.text}</Text>
              {hasMeta ? (
                <View style={styles.metaRow}>
                  {step.duration_minutes != null ? (
                    <View style={styles.metaChip}>
                      <Ionicons name="time-outline" size={12} color={colors.textSecondary} />
                      <Text style={styles.metaChipText}>{formatDuration(step.duration_minutes)}</Text>
                    </View>
                  ) : null}
                  {step.temperature_celsius != null ? (
                    <View style={styles.metaChip}>
                      <Ionicons name="thermometer-outline" size={12} color={colors.textSecondary} />
                      <Text style={styles.metaChipText}>{step.temperature_celsius}\u00b0C</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </>
  );
}

/** "5m" under an hour, "1h 30m" style once it crosses 60 \u2014 matches how a
 * baker actually talks about bake/proof/rest times, rather than always
 * showing raw minutes ("90m" reads slower than "1h 30m"). */
function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    row: { flexDirection: 'row' },
    rail: { width: 28, alignItems: 'center' },
    dot: {
      width: 24,
      height: 24,
      borderRadius: radii.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dotText: { ...typography.caption, color: colors.textInverse, fontWeight: '700' },
    line: { flex: 1, width: 2, marginVertical: spacing.xxs },
    card: {
      flex: 1,
      marginLeft: spacing.sm,
      marginBottom: spacing.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      padding: spacing.md,
    },
    stepText: { ...typography.body, color: colors.textPrimary },
    metaRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
    metaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xxs,
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.full,
      paddingVertical: spacing.xxs,
      paddingHorizontal: spacing.sm,
    },
    metaChipText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  });
}