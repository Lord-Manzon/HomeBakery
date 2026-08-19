import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../theme/ThemeContext';
import { radii, spacing, typography } from '../theme';
import type { ColorToken } from '../theme/colors';

// Success counterpart to ErrorBanner.tsx — same shape, same spacing,
// just the success color tokens instead of danger, plus a checkmark
// since a confirmation benefits from an icon more than an error does.
export function SuccessBanner({ message }: { message: string }) {
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      <Ionicons name="checkmark-circle" size={16} color={colors.success} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.successMuted,
      borderRadius: radii.md,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    text: {
      ...typography.bodySm,
      color: colors.success,
    },
  });
}