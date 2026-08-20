import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useIngredient, useRestockIngredient } from '../../../../../src/hooks/useIngredients';
import { restockFormSchema } from '../../../../../src/utils/validation/ingredientSchemas';
import { FormField } from '../../../../../src/components/FormField';
import { PrimaryButton } from '../../../../../src/components/PrimaryButton';
import { ErrorBanner } from '../../../../../src/components/ErrorBanner';
import { colors, spacing, typography } from '../../../../../src/theme';

export default function RestockScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: ingredient, isLoading } = useIngredient(id);
  const restock = useRestockIngredient(id);

  const [quantity, setQuantity] = useState('');
  const [totalCostPaid, setTotalCostPaid] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (isLoading || !ingredient) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const handleSave = () => {
    const parsed = restockFormSchema.safeParse({
      quantity,
      totalCostPaid: totalCostPaid === '' ? null : totalCostPaid,
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
    restock.mutate(parsed.data, {
      onSuccess: () => router.back(),
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.xl }}>
      <Pressable onPress={() => router.back()} hitSlop={12} style={{ marginBottom: spacing.lg }}>
        <Text style={styles.backArrow}>‹</Text>
      </Pressable>

      <Text style={styles.title}>Restock {ingredient.name}</Text>
      <Text style={styles.subtitle}>
        Currently {ingredient.current_stock} {ingredient.unit} at {ingredient.cost_per_unit.toFixed(2)}
        /{ingredient.unit}
      </Text>

      {restock.isError ? <ErrorBanner message="Couldn't save this restock. Try again." /> : null}

      <FormField
        label={`Quantity to add (${ingredient.unit})`}
        placeholder="0"
        keyboardType="decimal-pad"
        value={quantity}
        onChangeText={setQuantity}
        error={fieldErrors.quantity}
      />

      <FormField
        label="Total cost paid (optional)"
        placeholder="0.00"
        keyboardType="decimal-pad"
        value={totalCostPaid}
        onChangeText={setTotalCostPaid}
        error={fieldErrors.totalCostPaid}
      />
      <Text style={styles.hint}>
        Leave blank if you don't want to update the cost per {ingredient.unit} right now.
      </Text>

      <PrimaryButton title="Save restock" onPress={handleSave} isLoading={restock.isPending} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  backArrow: { fontSize: 28, color: colors.textPrimary },
  title: { ...typography.titleLg, color: colors.textPrimary, marginBottom: spacing.xs },
  subtitle: { ...typography.bodySm, color: colors.textSecondary, marginBottom: spacing.xl },
  hint: { ...typography.caption, color: colors.textSecondary, marginTop: -spacing.md, marginBottom: spacing.xl },
});
