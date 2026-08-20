import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCreateRecipe } from '../../../../src/hooks/useRecipes';
import { useThemeColors } from '../../../../src/theme/ThemeContext';
import { ErrorBanner } from '../../../../src/components/ErrorBanner';
import { FormField } from '../../../../src/components/FormField';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import { Screen } from '../../../../src/components/Screen';
import { spacing, radii, typography } from '../../../../src/theme';
import type { ColorToken } from '../../../../src/theme/colors';
import { recipeFormSchema } from '../../../../src/utils/validation/recipeSchemas';

export default function NewRecipeScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const createRecipe = useCreateRecipe();

  const [name, setName] = useState('');
  const [yieldQuantity, setYieldQuantity] = useState('');
  const [yieldUnit, setYieldUnit] = useState('');
  const [marginPercent, setMarginPercent] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSave = () => {
    // Instructions aren't collected here — see docs/DECISIONS.md's
    // 2026-08-21 entry. They're added afterward from Recipe Detail,
    // where there's room for real step-by-step entry rather than a
    // cramped box on an already-long creation form.
    const result = recipeFormSchema.safeParse({
      name,
      yield_quantity: yieldQuantity,
      yield_unit: yieldUnit,
      margin_percent: marginPercent || null,
    });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) fieldErrors[issue.path[0] as string] = issue.message;
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    createRecipe.mutate(result.data, {
      onSuccess: (recipe) => router.replace(`/more/recipes/${recipe.id}`),
    });
  };

  return (
    <Screen style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>New recipe</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <FormField label="Name" placeholder="e.g. Vanilla sponge" value={name} onChangeText={setName} error={errors.name} />

        <Text style={styles.sectionLabel}>How much does one batch make?</Text>
        <View style={styles.row}>
          <View style={styles.rowFieldQty}>
            <FormField
              label="How many"
              placeholder="1"
              keyboardType="decimal-pad"
              value={yieldQuantity}
              onChangeText={setYieldQuantity}
              error={errors.yield_quantity}
            />
          </View>
          <View style={styles.rowFieldUnit}>
            <FormField
              label="Of what"
              placeholder="e.g. 8-inch cake, cupcakes,rolls"
              value={yieldUnit}
              onChangeText={setYieldUnit}
              error={errors.yield_unit}
            />
          </View>
        </View>
        <Text style={styles.hint}>
          One full batch, start to finish — e.g. one 8-inch cake, or two dozen cupcakes.
        </Text>

        <FormField
          label="Margin override (optional)"
          placeholder="Leave blank to use your default margin"
          keyboardType="decimal-pad"
          value={marginPercent}
          onChangeText={setMarginPercent}
          error={errors.margin_percent}
        />
        <Text style={styles.hint}>
          Only if this recipe's costs genuinely differ from your usual margin — a product or
          variant can still override this further. Leave blank otherwise.
        </Text>

        {createRecipe.isError ? <ErrorBanner message="Couldn't save. Try again." /> : null}

        <View style={styles.saveButton}>
          <PrimaryButton title="Save recipe" onPress={handleSave} isLoading={createRecipe.isPending} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    container: { flex: 1, paddingHorizontal: spacing.xl },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    title: { ...typography.titleLg, color: colors.textPrimary },
    iconButton: { width: 44, height: 44, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center' },
    sectionLabel: { ...typography.titleSm, color: colors.textPrimary, marginBottom: spacing.sm },
    row: { flexDirection: 'row', gap: spacing.md },
    // Unit gets more room than quantity — "8-inch cake" needs it, "1" doesn't.
    rowFieldQty: { flex: 1 },
    rowFieldUnit: { flex: 2 },
    hint: { ...typography.caption, color: colors.textSecondary, marginTop: -spacing.sm, marginBottom: spacing.lg },
    saveButton: { marginTop: spacing.md, marginBottom: spacing.xxxl },
  });
}
