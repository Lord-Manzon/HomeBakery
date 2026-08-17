import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import Animated from 'react-native-reanimated';
import { useThemeColors } from '../theme/ThemeContext';
import { radii, spacing, typography } from '../theme';
import { usePressScale } from '../hooks/usePressScale';
import type { ColorToken } from '../theme/colors';

type PrimaryButtonProps = {
  title: string;
  onPress: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  /**
   * 'primary' = filled accent (default). 'secondary' = accent-outline —
   * per docs/UI_UX.md's Components section: "one [filled button] per
   * screen max — never two competing filled buttons side by side."
   * Added so screens with two related actions (e.g. Restock / Use-waste
   * on the ingredient detail screen) can visually rank them instead of
   * both reading as equally primary.
   */
  variant?: 'primary' | 'secondary';
};

export function PrimaryButton({
  title,
  onPress,
  isLoading,
  disabled,
  variant = 'primary',
}: PrimaryButtonProps) {
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isDisabled = disabled || isLoading;
  const isSecondary = variant === 'secondary';
  // Motion: subtle press-in scale using the shared Motion tokens — see
  // docs/DECISIONS.md's 2026-08-17 "Motion design token system" entry.
  const press = usePressScale();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={isDisabled ? undefined : press.onPressIn}
      onPressOut={isDisabled ? undefined : press.onPressOut}
      disabled={isDisabled}
    >
      <Animated.View
        style={[
          styles.button,
          isSecondary && styles.buttonSecondary,
          isDisabled && (isSecondary ? styles.buttonSecondaryDisabled : styles.buttonDisabled),
          press.style,
        ]}
      >
        {isLoading ? (
          <ActivityIndicator color={isSecondary ? colors.primary : colors.textInverse} />
        ) : (
          <Text style={[styles.label, isSecondary && styles.labelSecondary]}>{title}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

// See FormField.tsx for why styles are built per-render from the theme
// palette instead of a static module-level StyleSheet.create().
function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    button: {
      backgroundColor: colors.primary,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
    },
    buttonSecondary: {
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonSecondaryDisabled: {
      opacity: 0.5,
    },
    label: {
      ...typography.titleSm,
      color: colors.textInverse,
    },
    labelSecondary: {
      color: colors.primary,
    },
  });
}
