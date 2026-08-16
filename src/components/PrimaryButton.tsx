import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, radii, spacing, typography } from '../theme';

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
  const isDisabled = disabled || isLoading;
  const isSecondary = variant === 'secondary';
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        isSecondary && styles.buttonSecondary,
        isDisabled && (isSecondary ? styles.buttonSecondaryDisabled : styles.buttonDisabled),
        pressed && !isDisabled && styles.buttonPressed,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator color={isSecondary ? colors.primary : colors.textInverse} />
      ) : (
        <Text style={[styles.label, isSecondary && styles.labelSecondary]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  buttonPressed: {
    opacity: 0.85,
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
