import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../theme/ThemeContext';
import { radii, spacing, typography } from '../theme';
import type { ColorToken } from '../theme/colors';

export function ErrorBanner({ message }: { message: string }) {
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

// See FormField.tsx for why styles are built per-render from the theme
// palette instead of a static module-level StyleSheet.create().
function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    container: {
      backgroundColor: colors.dangerMuted,
      borderRadius: radii.md,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    text: {
      ...typography.bodySm,
      color: colors.danger,
    },
  });
}
