import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { FormField } from './FormField';
import { PrimaryButton } from './PrimaryButton';
import { ErrorBanner } from './ErrorBanner';
import { useThemeColors } from '../theme/ThemeContext';
import { variantFormSchema, type VariantFormInput } from '../utils/validation/productSchemas';
import type { ProductVariant } from '../types/product';
import { spacing, typography } from '../theme';
import type { ColorToken } from '../theme/colors';

type VariantFormSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  onSubmit: (input: VariantFormInput) => void;
  isSaving: boolean;
  errorMessage?: string | null;
  /** Pass the existing variant to pre-fill for Edit; omit for Add. */
  initialValue?: ProductVariant;
};

/**
 * Per docs/UI_UX_1.md section E.5c — used for BOTH Add (from Product
 * detail's "Add variant") and Edit (tapping an existing variant row).
 * Recipe linkage, recipe_portion, and suggested_price are deliberately
 * NOT fields here — those are set later inside Recipe & costing once
 * Phase 6 exists (docs/DECISIONS.md).
 */
export function VariantFormSheet({
  visible,
  onDismiss,
  onSubmit,
  isSaving,
  errorMessage,
  initialValue,
}: VariantFormSheetProps) {
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isEdit = !!initialValue;

  const [name, setName] = useState(initialValue?.name ?? '');
  const [sellingPrice, setSellingPrice] = useState(
    initialValue ? String(initialValue.selling_price) : ''
  );
  const [packagingCost, setPackagingCost] = useState(
    initialValue?.packaging_cost != null ? String(initialValue.packaging_cost) : ''
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = () => {
    const parsed = variantFormSchema.safeParse({
      name,
      selling_price: sellingPrice,
      packaging_cost: packagingCost || 0,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errs[String(issue.path[0])] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    onSubmit(parsed.data);
  };

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} dismissDisabled={isSaving}>
      <Text style={styles.title}>{isEdit ? 'Edit variant' : 'Add variant'}</Text>

      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

      <FormField
        label="Name"
        placeholder='e.g. "Medium — Serves 8"'
        value={name}
        onChangeText={setName}
        error={fieldErrors.name}
      />

      <FormField
        label="Selling price"
        placeholder="0.00"
        keyboardType="decimal-pad"
        value={sellingPrice}
        onChangeText={setSellingPrice}
        error={fieldErrors.selling_price}
      />

      <FormField
        label="Packaging cost (optional)"
        placeholder="0.00"
        keyboardType="decimal-pad"
        value={packagingCost}
        onChangeText={setPackagingCost}
        error={fieldErrors.packaging_cost}
      />

      <View style={styles.footer}>
        <PrimaryButton
          title={isSaving ? 'Saving…' : 'Save'}
          onPress={handleSubmit}
          isLoading={isSaving}
          disabled={isSaving}
        />
      </View>
    </BottomSheet>
  );
}

function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    title: { ...typography.titleLg, color: colors.textPrimary, marginBottom: spacing.lg },
    footer: { marginTop: spacing.sm },
  });
}
