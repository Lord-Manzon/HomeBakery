import { useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from './BottomSheet';
import { FormField } from './FormField';
import { PrimaryButton } from './PrimaryButton';
import { ErrorBanner } from './ErrorBanner';
import { USE_WASTE_REASONS, useWasteFormSchema, type UseWasteReason } from '../utils/validation/ingredientSchemas';
import { colors, radii, spacing, typography } from '../theme';

// Icon per reason, matching the original mockup — dropped when this
// component was first built, re-added 2026-08-16. Keyed against
// USE_WASTE_REASONS exactly so a typo here fails to compile rather than
// silently falling back.
const REASON_ICONS: Record<UseWasteReason, keyof typeof Ionicons.glyphMap> = {
  'Used in production': 'flame-outline',
  Wasted: 'trash-outline',
  Spoiled: 'warning-outline',
};

type UseWasteSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  currentStock: number;
  unit: string;
  onSubmit: (quantity: number, reason: UseWasteReason) => void;
  isSaving: boolean;
  errorMessage?: string | null;
};

/**
 * Per docs/UI_UX.md section E.4.4 — exactly three reasons, "Other" was
 * considered and dropped as too ambiguous to map to a movement type.
 * "Used in production" -> usage movement; "Wasted"/"Spoiled" -> waste
 * movement. That mapping happens in src/services/ingredients.ts, not
 * here — this component just collects quantity + reason.
 *
 * CHANGED 2026-08-16: added a live "new stock" preview that reads as an
 * inline error (danger color, no dash) once the entered quantity would
 * exceed current stock, and the Save button now visually disables
 * (border/opacity, not just non-interactive) instead of only being
 * inert — makes the invalid state visible before tapping, not just
 * after.
 */
export function UseWasteSheet({
  visible,
  onDismiss,
  currentStock,
  unit,
  onSubmit,
  isSaving,
  errorMessage,
}: UseWasteSheetProps) {
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<UseWasteReason | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSave = () => {
    const schema = useWasteFormSchema(currentStock);
    const parsed = schema.safeParse({ quantity, reason });

    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errors[issue.path[0] as string] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    onSubmit(parsed.data.quantity, parsed.data.reason);
  };

  const qtyNumber = Number(quantity) || 0;
  const exceedsStock = quantity !== '' && qtyNumber > currentStock;
  const isPositive = quantity !== '' && qtyNumber > 0;
  const newStock = Math.max(0, currentStock - qtyNumber);
  const canSave = isPositive && !exceedsStock && !!reason;

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} dismissDisabled={isSaving}>
      <Text style={styles.title}>Use or waste stock</Text>
      <Text style={styles.subtitle}>
        You have {currentStock} {unit} available.
      </Text>

      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

      <FormField
        label={`Quantity (${unit})`}
        placeholder="0"
        keyboardType="decimal-pad"
        value={quantity}
        onChangeText={setQuantity}
        error={fieldErrors.quantity}
      />

      <Text style={styles.label}>Reason</Text>
      <View style={styles.reasonList}>
        {USE_WASTE_REASONS.map((r) => {
          const isSelected = reason === r;
          return (
            <Pressable
              key={r}
              onPress={() => setReason(r)}
              style={[styles.reasonRow, isSelected && styles.reasonRowSelected]}
            >
              <Ionicons
                name={REASON_ICONS[r]}
                size={16}
                color={isSelected ? colors.primary : colors.textSecondary}
                style={styles.reasonIcon}
              />
              <Text style={[styles.reasonText, isSelected && styles.reasonTextSelected]}>{r}</Text>
            </Pressable>
          );
        })}
      </View>
      {fieldErrors.reason ? <Text style={styles.fieldError}>{fieldErrors.reason}</Text> : null}

      {isPositive && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>New stock</Text>
          <Text style={[styles.summaryValue, exceedsStock && { color: colors.danger }]}>
            {currentStock} − {qtyNumber} = {exceedsStock ? '—' : `${newStock} ${unit}`}
          </Text>
        </View>
      )}

      <PrimaryButton
        title="Save"
        onPress={handleSave}
        isLoading={isSaving}
        disabled={!canSave}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.titleLg, color: colors.textPrimary },
  subtitle: { ...typography.bodySm, color: colors.textSecondary, marginBottom: spacing.lg },
  label: { ...typography.titleSm, color: colors.textPrimary, marginBottom: spacing.xs },
  reasonList: { marginBottom: spacing.md },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    minHeight: 44,
  },
  reasonIcon: { marginRight: spacing.sm },
  reasonRowSelected: { borderColor: colors.primary, backgroundColor: colors.surfaceMuted },
  reasonText: { ...typography.body, color: colors.textPrimary },
  reasonTextSelected: { color: colors.primary, fontWeight: '600' },
  fieldError: { ...typography.bodySm, color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.md },
  summaryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  summaryLabel: { ...typography.caption, color: colors.textSecondary },
  summaryValue: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600' },
});
