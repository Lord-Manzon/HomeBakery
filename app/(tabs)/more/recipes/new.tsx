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
  const [instructions, setInstructions] = useState('');
  const [marginPercent, setMarginPercent] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSave = () => {
    const result = recipeFormSchema.safeParse({
      name,
      yield_quantity: yieldQuantity,
      yield_unit: yieldUnit,
      instructions,
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

        <View style={styles.row}>
          <View style={styles.rowField}>
            <FormField
              label="Yield quantity"
              placeholder="1"
              keyboardType="decimal-pad"
              value={yieldQuantity}
              onChangeText={setYieldQuantity}
              error={errors.yield_quantity}
            />
          </View>
          <View style={styles.rowField}>
            <FormField
              label="Yield unit"
              placeholder="8-inch cake"
              value={yieldUnit}
              onChangeText={setYieldUnit}
              error={errors.yield_unit}
            />
          </View>
        </View>
        <Text style={styles.hint}>
          How much one full batch of this recipe makes — e.g. "1" / "8-inch cake", or "24" /
          "cupcakes".
        </Text>

        <FormField
          label="Instructions (optional)"
          placeholder="Steps, oven temp, notes..."
          value={instructions}
          onChangeText={setInstructions}
          multiline
          numberOfLines={4}
          style={styles.multiline}
        />

        <FormField
          label="Margin override (optional)"
          placeholder="Leave blank to use your default margin"
          keyboardType="decimal-pad"
          value={marginPercent}
          onChangeText={setMarginPercent}
          error={errors.margin_percent}
        />
        <Text style={styles.hint}>
          Only set this if this specific recipe's economics genuinely differ from your usual
          margin — a product or variant can still override this further. Leave blank to use your
          baker default.
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
    row: { flexDirection: 'row', gap: spacing.md },
    rowField: { flex: 1 },
    hint: { ...typography.caption, color: colors.textSecondary, marginTop: -spacing.sm, marginBottom: spacing.lg },
    multiline: { minHeight: 90, textAlignVertical: 'top', paddingTop: spacing.sm + 2 },
    saveButton: { marginTop: spacing.md, marginBottom: spacing.xxxl },
  });
}
