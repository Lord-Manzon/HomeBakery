import { useMemo } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useThemeColors } from '../theme/ThemeContext';
import { radii, spacing, typography } from '../theme';
import type { ColorToken } from '../theme/colors';

type FormFieldProps = TextInputProps & {
  label: string;
  error?: string;
};

export function FormField({ label, error, style, ...inputProps }: FormFieldProps) {
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, error ? styles.inputError : null, style]}
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        {...inputProps}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

// Styles are built per-render from the current theme palette (see
// docs/DECISIONS.md's 2026-08-17 "shared components theme-reactive"
// entry) rather than a single module-level StyleSheet.create() call,
// since colors now vary per baker/mode instead of being fixed constants.
function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    container: {
      marginBottom: spacing.lg,
    },
    label: {
      ...typography.titleSm,
      color: colors.textPrimary,
      marginBottom: spacing.xs,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      fontSize: typography.body.fontSize,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
    },
    inputError: {
      borderColor: colors.danger,
    },
    error: {
      ...typography.bodySm,
      color: colors.danger,
      marginTop: spacing.xs,
    },
  });
}
