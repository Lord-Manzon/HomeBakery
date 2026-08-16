import { useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { FormField } from './FormField';
import { PrimaryButton } from './PrimaryButton';
import { ErrorBanner } from './ErrorBanner';
import {
  ingredientFormSchema,
  type IngredientFormInput,
} from '../utils/validation/ingredientSchemas';
import { INGREDIENT_CATEGORIES, INGREDIENT_UNITS, type Ingredient } from '../types/ingredient';
import { colors, radii, spacing, typography } from '../theme';

type IngredientFormSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  onSubmit: (input: IngredientFormInput) => void;
  isSaving: boolean;
  errorMessage?: string | null;
  /** Pass the existing ingredient to pre-fill for Edit; omit for Add. */
  initialValue?: Ingredient;
};

/**
 * Per docs/UI_UX.md section E.4.5 — used for BOTH Add (from the
 * ingredients list) and Edit (from ingredient detail). On Edit, changing
 * `quantity` produces an `adjustment` inventory movement — that logic
 * lives in src/services/ingredients.ts's updateIngredient(), not here;
 * this component only collects and validates the form values.
 *
 * NOTE 2026-08-15: chipRow previously used `gap` combined with
 * `flexWrap: 'wrap'`, which has a known history of silently failing to
 * render wrapped children on Android in some RN/Yoga versions. Switched
 * to margin-based spacing on each chip instead — safer, no version
 * dependency.
 */
export function IngredientFormSheet({
  visible,
  onDismiss,
  onSubmit,
  isSaving,
  errorMessage,
  initialValue,
}: IngredientFormSheetProps) {
  const isEdit = !!initialValue;

  const [name, setName] = useState(initialValue?.name ?? '');
  const [category, setCategory] = useState<string | null>(initialValue?.category ?? null);
  const [quantity, setQuantity] = useState(initialValue ? String(initialValue.current_stock) : '');
  const [unit, setUnit] = useState<string>(initialValue?.unit ?? '');
  const [lowStockThreshold, setLowStockThreshold] = useState(
    initialValue?.low_stock_threshold != null ? String(initialValue.low_stock_threshold) : ''
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSave = () => {
    const parsed = ingredientFormSchema.safeParse({
      name,
      category,
      quantity,
      unit,
      lowStockThreshold: lowStockThreshold === '' ? null : lowStockThreshold,
    });

    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errors[issue.path[0] as string] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    onSubmit(parsed.data);
  };

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} dismissDisabled={isSaving}>
      <Text style={styles.title}>{isEdit ? 'Edit ingredient' : 'Add ingredient'}</Text>

      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

      <FormField
        label="Ingredient name"
        placeholder="e.g. Flour"
        value={name}
        onChangeText={setName}
        error={fieldErrors.name}
      />

      <Text style={styles.label}>Category (optional)</Text>
      <View style={styles.chipRow}>
        {INGREDIENT_CATEGORIES.map((c) => (
          <Pressable
            key={c}
            onPress={() => setCategory(category === c ? null : c)}
            style={[styles.chip, category === c && styles.chipSelected]}
          >
            <Text style={[styles.chipText, category === c && styles.chipTextSelected]}>{c}</Text>
          </Pressable>
        ))}
      </View>

      <FormField
        label="Quantity"
        placeholder="0"
        keyboardType="decimal-pad"
        value={quantity}
        onChangeText={setQuantity}
        error={fieldErrors.quantity}
      />

      <Text style={styles.label}>Unit</Text>
      <View style={styles.chipRow}>
        {INGREDIENT_UNITS.map((u) => (
          <Pressable
            key={u}
            onPress={() => setUnit(u)}
            style={[styles.chip, unit === u && styles.chipSelected]}
          >
            <Text style={[styles.chipText, unit === u && styles.chipTextSelected]}>{u}</Text>
          </Pressable>
        ))}
      </View>
      {fieldErrors.unit ? <Text style={styles.fieldError}>{fieldErrors.unit}</Text> : null}

      <FormField
        label="Low-stock alert (optional)"
        placeholder="e.g. 5"
        keyboardType="decimal-pad"
        value={lowStockThreshold}
        onChangeText={setLowStockThreshold}
        error={fieldErrors.lowStockThreshold}
      />

      <PrimaryButton
        title={isEdit ? 'Save changes' : 'Add ingredient'}
        onPress={handleSave}
        isLoading={isSaving}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.titleLg, color: colors.textPrimary, marginBottom: spacing.lg },
  label: { ...typography.titleSm, color: colors.textPrimary, marginBottom: spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.lg },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 36,
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.bodySm, color: colors.textPrimary },
  chipTextSelected: { color: colors.textInverse },
  fieldError: { ...typography.bodySm, color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.md },
});
