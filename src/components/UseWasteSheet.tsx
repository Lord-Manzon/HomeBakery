import { useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { FormField } from './FormField';
import { PrimaryButton } from './PrimaryButton';
import { ErrorBanner } from './ErrorBanner';
import { USE_WASTE_REASONS, useWasteFormSchema, type UseWasteReason } from '../utils/validation/ingredientSchemas';
import { colors, radii, spacing, typography } from '../theme';

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
        {USE_WASTE_REASONS.map((r) => (
          <Pressable
            key={r}
            onPress={() => setReason(r)}
            style={[styles.reasonRow, reason === r && styles.reasonRowSelected]}
          >
            <Text style={[styles.reasonText, reason === r && styles.reasonTextSelected]}>{r}</Text>
          </Pressable>
        ))}
      </View>
      {fieldErrors.reason ? <Text style={styles.fieldError}>{fieldErrors.reason}</Text> : null}

      <PrimaryButton title="Save" onPress={handleSave} isLoading={isSaving} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.titleLg, color: colors.textPrimary },
  subtitle: { ...typography.bodySm, color: colors.textSecondary, marginBottom: spacing.lg },
  label: { ...typography.titleSm, color: colors.textPrimary, marginBottom: spacing.xs },
  reasonList: { marginBottom: spacing.md },
  reasonRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  reasonRowSelected: { borderColor: colors.primary, backgroundColor: colors.surfaceMuted },
  reasonText: { ...typography.body, color: colors.textPrimary },
  reasonTextSelected: { color: colors.primary, fontWeight: '600' },
  fieldError: { ...typography.bodySm, color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.md },
});
