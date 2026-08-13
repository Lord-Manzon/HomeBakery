import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme';

type ScreenPlaceholderProps = {
  title: string;
  note?: string;
};

/**
 * Temporary placeholder for a screen that hasn't been built yet.
 * Used only during Phase 1 (navigation skeleton) — real screens replace
 * this per docs/ROADMAP.md as each phase is implemented.
 */
export function ScreenPlaceholder({ title, note }: ScreenPlaceholderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: {
    ...typography.titleLg,
    color: colors.textPrimary,
  },
  note: {
    ...typography.bodySm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
