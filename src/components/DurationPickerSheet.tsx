import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from './BottomSheet';
import { FormField } from './FormField';
import { PrimaryButton } from './PrimaryButton';
import { useThemeColors } from '../theme/ThemeContext';
import { radii, spacing, typography } from '../theme';
import type { ColorToken } from '../theme/colors';

const PRESET_MINUTES = [15, 30, 45, 60, 90, 120];

type DurationPickerSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  /** Currently effective minutes (override if set, else the
   * calculated-from-steps default) — used to highlight the matching
   * preset chip, if any. */
  currentMinutes: number | null;
  /** The value calculated from step durations, so "Use calculated" can
   * be offered and its number shown. Null if no step has a duration. */
  calculatedMinutes: number | null;
  /** null clears the manual override, reverting to calculatedMinutes. */
  onSubmit: (minutes: number | null) => void;
};

/**
 * Same "curated presets beat free-form input" reasoning already used
 * for the accent color picker and stock-gauge sensitivity picker (see
 * docs/DECISIONS.md's 2026-08-15/2026-08-16 entries) — a handful of
 * realistic recipe durations, tap one and it's saved immediately, no
 * separate confirm step needed. Custom is the escape hatch for
 * anything the presets don't cover.
 *
 * A true native wheel/spinner duration picker isn't a safe cross-
 * platform option here: @react-native-community/datetimepicker's
 * countdown/duration display mode is iOS-only, and Android has no
 * built-in equivalent — building a custom scrolling wheel picker from
 * scratch is real gesture-handling work for a single number field.
 * This gets most of the "faster than typing digits" benefit without
 * that risk. Revisit if presets prove too limiting in practice.
 */
export function DurationPickerSheet({
  visible,
  onDismiss,
  currentMinutes,
  calculatedMinutes,
  onSubmit,
}: DurationPickerSheetProps) {
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [isCustom, setIsCustom] = useState(false);
  const [customDraft, setCustomDraft] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  // BottomSheet stays mounted and just toggles visibility (Android
  // keyboard fix, see BottomSheet.tsx) — reset local state each time it
  // opens rather than on mount, same fix VariantFormSheet/
  // IngredientFormSheet already apply for the same reason.
  useEffect(() => {
    if (visible) {
      setIsCustom(false);
      setCustomDraft(currentMinutes != null ? String(currentMinutes) : '');
      setCustomError(null);
    }
  }, [visible, currentMinutes]);

  const handlePreset = (minutes: number) => {
    onSubmit(minutes);
    onDismiss();
  };

  const handleUseCalculated = () => {
    onSubmit(null);
    onDismiss();
  };

  const handleCustomSave = () => {
    const trimmed = customDraft.trim();
    if (!trimmed) {
      setCustomError('Enter a number of minutes.');
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      setCustomError('Enter a whole number of minutes.');
      return;
    }
    onSubmit(n);
    onDismiss();
  };

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss}>
      <Text style={styles.title}>Total time</Text>

      {!isCustom ? (
        <>
          <View style={styles.presetGrid}>
            {PRESET_MINUTES.map((minutes) => (
              <Pressable
                key={minutes}
                onPress={() => handlePreset(minutes)}
                style={[styles.presetChip, currentMinutes === minutes && styles.presetChipActive]}
              >
                <Text
                  style={[styles.presetChipText, currentMinutes === minutes && styles.presetChipTextActive]}
                >
                  {minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60 || ''}`.trim()}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable onPress={() => setIsCustom(true)} style={styles.customRow}>
            <Ionicons name="create-outline" size={16} color={colors.primary} />
            <Text style={styles.customRowText}>Enter a custom time</Text>
          </Pressable>

          {calculatedMinutes != null ? (
            <Pressable onPress={handleUseCalculated} style={styles.customRow}>
              <Ionicons name="refresh-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.calculatedRowText}>
                Use calculated time ({calculatedMinutes} min, from steps)
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <>
          <FormField
            label="Minutes"
            keyboardType="number-pad"
            value={customDraft}
            onChangeText={setCustomDraft}
            error={customError ?? undefined}
            autoFocus
          />
          <PrimaryButton title="Save" onPress={handleCustomSave} />
        </>
      )}
    </BottomSheet>
  );
}

function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    title: { ...typography.titleLg, color: colors.textPrimary, marginBottom: spacing.lg },
    presetGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.xxs },
    presetChip: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      margin: spacing.xxs,
    },
    presetChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    presetChipText: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600' },
    presetChipTextActive: { color: colors.textInverse },
    customRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.md,
      marginTop: spacing.xs,
    },
    customRowText: { ...typography.bodySm, color: colors.primary, fontWeight: '600' },
    calculatedRowText: { ...typography.bodySm, color: colors.textSecondary },
  });
}
