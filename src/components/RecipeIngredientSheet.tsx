import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../theme/ThemeContext';
import { radii, spacing, typography } from '../theme';
import type { ColorToken } from '../theme/colors';
import { BottomSheet } from './BottomSheet';
import { ErrorBanner } from './ErrorBanner';
import { FormField } from './FormField';
import { PrimaryButton } from './PrimaryButton';
import type { Ingredient } from '../types/ingredient';
import {
  recipeIngredientFormSchema,
  type RecipeIngredientFormInput,
} from '../utils/validation/recipeSchemas';

type RecipeIngredientSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  ingredients: Ingredient[];
  initialValue?: { ingredient_id: string; quantity: number; unit: string } | null;
  onSubmit: (input: RecipeIngredientFormInput) => void;
  isSaving: boolean;
  errorMessage?: string | null;
};

/**
 * Add/edit one ingredient line within a recipe — quantity + unit, per
 * docs/UI_UX_1.md section 6's "Tapping an ingredient row opens an edit
 * sheet (quantity + unit)". The ingredient itself is only pickable when
 * adding a new line (editing an existing line keeps its ingredient fixed
 * — swapping ingredients on an existing line reads as "add a different
 * ingredient", not "edit this one").
 */
export function RecipeIngredientSheet({
  visible,
  onDismiss,
  ingredients,
  initialValue,
  onSubmit,
  isSaving,
  errorMessage,
}: RecipeIngredientSheetProps) {
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [selectedId, setSelectedId] = useState(initialValue?.ingredient_id ?? '');
  const [quantity, setQuantity] = useState(initialValue ? String(initialValue.quantity) : '');
  const [unit, setUnit] = useState(initialValue?.unit ?? '');
  const [errors, setErrors] = useState<{ ingredient_id?: string; quantity?: string; unit?: string }>({});
  const [search, setSearch] = useState('');

  const isEditing = !!initialValue;

  useEffect(() => {
    if (visible) {
      setSelectedId(initialValue?.ingredient_id ?? '');
      setQuantity(initialValue ? String(initialValue.quantity) : '');
      setUnit(initialValue?.unit ?? '');
      setErrors({});
      setSearch('');
    }
  }, [visible, initialValue]);

  // When picking a new ingredient, default the unit to that ingredient's
  // own stock unit — the common case (recipe unit matches stock unit); the
  // baker can still override it, per recipeSchemas.ts's unit-conversion note.
  const handleSelectIngredient = (ingredient: Ingredient) => {
    setSelectedId(ingredient.id);
    if (!unit) setUnit(ingredient.unit);
  };

  const filteredIngredients = search.trim()
    ? ingredients.filter((i) => i.name.toLowerCase().includes(search.trim().toLowerCase()))
    : ingredients;

  const handleSave = () => {
    const result = recipeIngredientFormSchema.safeParse({
      ingredient_id: selectedId,
      quantity,
      unit,
    });
    if (!result.success) {
      const fieldErrors: typeof errors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof typeof errors;
        fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    onSubmit(result.data);
  };

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} dismissDisabled={isSaving}>
      <Text style={styles.title}>{isEditing ? 'Edit ingredient' : 'Add ingredient'}</Text>

      {!isEditing ? (
        <View style={styles.pickerBlock}>
          <FormField
            label="Ingredient"
            placeholder="Search ingredients"
            value={search}
            onChangeText={setSearch}
          />
          {errors.ingredient_id ? <Text style={styles.pickerError}>{errors.ingredient_id}</Text> : null}
          {/* Plain map, not FlatList — BottomSheet already wraps its
              children in a ScrollView (Android keyboard fix, see
              docs/DECISIONS.md), and nesting a VirtualizedList inside a
              ScrollView of the same orientation is a hard RN error, not
              just a warning. */}
          <View style={styles.pickerList}>
            {filteredIngredients.length === 0 ? (
              <Text style={styles.pickerEmpty}>No ingredients match.</Text>
            ) : (
              filteredIngredients.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => handleSelectIngredient(item)}
                  style={[styles.pickerRow, selectedId === item.id && styles.pickerRowSelected]}
                >
                  <Text style={styles.pickerRowText}>{item.name}</Text>
                  <Text style={styles.pickerRowUnit}>{item.unit}</Text>
                </Pressable>
              ))
            )}
          </View>
        </View>
      ) : null}

      <View style={styles.row}>
        <View style={styles.rowField}>
          <FormField
            label="Quantity"
            keyboardType="decimal-pad"
            value={quantity}
            onChangeText={setQuantity}
            error={errors.quantity}
          />
        </View>
        <View style={styles.rowField}>
          <FormField label="Unit" value={unit} onChangeText={setUnit} error={errors.unit} />
        </View>
      </View>

      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

      <PrimaryButton title="Save" onPress={handleSave} isLoading={isSaving} />
    </BottomSheet>
  );
}

function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    title: { ...typography.titleLg, color: colors.textPrimary, marginBottom: spacing.lg },
    pickerBlock: { marginBottom: spacing.sm },
    pickerList: { marginTop: spacing.xs },
    pickerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
    },
    pickerRowSelected: { backgroundColor: colors.surfaceMuted },
    pickerRowText: { ...typography.body, color: colors.textPrimary },
    pickerRowUnit: { ...typography.bodySm, color: colors.textSecondary },
    pickerEmpty: { ...typography.bodySm, color: colors.textSecondary, padding: spacing.md },
    pickerError: { ...typography.bodySm, color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm },
    row: { flexDirection: 'row', gap: spacing.md },
    rowField: { flex: 1 },
  });
}
