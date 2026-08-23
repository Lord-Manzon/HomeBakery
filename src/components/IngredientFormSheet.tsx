import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { BottomSheet } from './BottomSheet';
import { FormField } from './FormField';
import { PrimaryButton } from './PrimaryButton';
import { ErrorBanner } from './ErrorBanner';
import { StockGauge } from './StockGauge';
import {
  ingredientFormSchema,
  type IngredientFormInput,
} from '../utils/validation/ingredientSchemas';
import { INGREDIENT_CATEGORIES, INGREDIENT_UNITS, type Ingredient } from '../types/ingredient';
import { useBakerProfile } from '../hooks/useBakerProfile';
import { useIngredients } from '../hooks/useIngredients';
import { usePressScale } from '../hooks/usePressScale';
import { useThemeColors } from '../theme/ThemeContext';
import { getStockGaugePercent, getStockGaugeStatus } from '../services/stockGauge';
import { getCategoryIcon } from '../utils/ingredientCategoryIcon';
import { radii, spacing, typography } from '../theme';
import type { ColorToken } from '../theme/colors';

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
 *
 * CHANGED 2026-08-16: category and unit chips now scroll horizontally
 * (single row, ScrollView) instead of wrapping to multiple rows — keeps
 * the sheet shorter so it doesn't take the whole screen. Kept the
 * margin-based spacing from the note above rather than reintroducing
 * `gap`, even though a non-wrapping row wouldn't hit the same Android
 * bug — one spacing convention across the sheet is simpler to reason
 * about than two. Also added a live preview at the bottom showing how
 * the entry will look on the Ingredients list, using the same
 * StockGauge component and gauge math as that screen.
 *
 * UPDATED 2026-08-21: switched from the static `colors` import to
 * useThemeColors() + a per-render makeStyles(colors) (see BottomSheet.tsx
 * and FormField.tsx, both already on this pattern) so the sheet reacts
 * to the baker's accent color / light-dark preference. Category and unit
 * chips now use usePressScale() for the same tactile press feedback the
 * Ingredients list's category chips and PrimaryButton already have.
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
  const { data: baker } = useBakerProfile();
  const sensitivity = baker?.gauge_sensitivity ?? 'balanced';
  // Reuses the same cached query the ingredients list already loaded
  // (same queryKey in useIngredients.ts) — this doesn't fire a second
  // network request, it just reads what's already in the React Query
  // cache. Excludes the ingredient being edited so an unchanged name
  // doesn't flag as a duplicate of itself.
  const { data: allIngredients } = useIngredients();
  const existingNames = (allIngredients ?? [])
    .filter((i) => i.id !== initialValue?.id)
    .map((i) => i.name);
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [name, setName] = useState(initialValue?.name ?? '');
  const [category, setCategory] = useState<string | null>(initialValue?.category ?? null);
  const [quantity, setQuantity] = useState(initialValue ? String(initialValue.current_stock) : '');
  const [unit, setUnit] = useState<string>(initialValue?.unit ?? '');
  const [lowStockThreshold, setLowStockThreshold] = useState(
    initialValue?.low_stock_threshold != null ? String(initialValue.low_stock_threshold) : ''
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Same reasoning as VariantFormSheet.tsx's identical fix: this sheet
  // stays mounted for the whole ingredient detail (or list) screen's
  // lifetime — BottomSheet only toggles a Modal's `visible`, it doesn't
  // unmount children — so the useState() initializers above only run
  // ONCE. Without this, typing something in Edit, canceling without
  // saving, then reopening Edit would show your abandoned typed value
  // instead of the ingredient's actual current value.
  useEffect(() => {
    if (visible) {
      setName(initialValue?.name ?? '');
      setCategory(initialValue?.category ?? null);
      setQuantity(initialValue ? String(initialValue.current_stock) : '');
      setUnit(initialValue?.unit ?? '');
      setLowStockThreshold(
        initialValue?.low_stock_threshold != null ? String(initialValue.low_stock_threshold) : ''
      );
      setFieldErrors({});
    }
  }, [visible, initialValue]);

  const handleSave = () => {
    const parsed = ingredientFormSchema(existingNames).safeParse({
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

  // Live preview values — parsed loosely (not through the Zod schema)
  // since the preview should update as the baker types, before the
  // value is necessarily valid yet.
  const previewStock = Number(quantity) || 0;
  const previewThreshold = lowStockThreshold === '' ? null : Number(lowStockThreshold) || null;
  const previewPercent = getStockGaugePercent(previewStock, previewThreshold, sensitivity);
  const previewStatus = getStockGaugeStatus(previewStock, previewThreshold);
  const previewIcon = getCategoryIcon(category);

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} dismissDisabled={isSaving}>
      <Text style={styles.title}>{isEdit ? 'Edit ingredient' : 'Add ingredient'}</Text>

      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

      <Text style={styles.previewSectionLabel}>Preview on your list</Text>
      <View style={styles.previewCard}>
        <View style={styles.previewTopRow}>
          <View
            style={[
              styles.previewIconTile,
              {
                backgroundColor:
                  previewStatus === 'out'
                    ? colors.dangerMuted
                    : previewStatus === 'low'
                      ? colors.warningMuted
                      : previewStatus === 'none'
                        ? colors.surfaceMuted
                        : colors.successMuted,
              },
            ]}
          >
            <Ionicons
              name={previewIcon}
              size={15}
              color={
                previewStatus === 'out'
                  ? colors.danger
                  : previewStatus === 'low'
                    ? colors.warning
                    : previewStatus === 'none'
                      ? colors.textSecondary
                      : colors.success
              }
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.previewName} numberOfLines={1}>
              {name || 'Ingredient name'}
            </Text>
            <Text style={styles.previewCategory}>{category ?? 'No category'}</Text>
          </View>
          <Text style={styles.previewStock}>
            {previewStock} {unit || '—'}
          </Text>
        </View>
        <StockGauge percent={previewPercent} status={previewStatus} />
      </View>

      <FormField
        label="Ingredient name"
        placeholder="e.g. Flour"
        value={name}
        onChangeText={setName}
        error={fieldErrors.name}
      />

      <Text style={styles.label}>Category (optional)</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipScrollContent}
      >
        {INGREDIENT_CATEGORIES.map((c) => (
          <FormChip
            key={c}
            label={c}
            icon={getCategoryIcon(c)}
            isSelected={category === c}
            styles={styles}
            colors={colors}
            onPress={() => setCategory(category === c ? null : c)}
          />
        ))}
      </ScrollView>

      <View style={styles.quantityUnitRow}>
        <View style={styles.quantityCol}>
          <FormField
            label="Quantity"
            placeholder="0"
            keyboardType="decimal-pad"
            value={quantity}
            onChangeText={setQuantity}
            error={fieldErrors.quantity}
            style={styles.quantityInput}
          />
        </View>
        <View style={styles.unitCol}>
          <Text style={styles.label}>Unit</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipScrollContent}
          >
            {INGREDIENT_UNITS.map((u) => (
              <FormChip
                key={u}
                label={u}
                isSelected={unit === u}
                styles={styles}
                colors={colors}
                onPress={() => setUnit(u)}
              />
            ))}
          </ScrollView>
          {fieldErrors.unit ? <Text style={styles.fieldError}>{fieldErrors.unit}</Text> : null}
        </View>
      </View>

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

// Shared by both the category row and the unit row — icon is optional
// since unit chips (g, kg, ml, pcs...) don't have one, only category
// chips do (via getCategoryIcon).
function FormChip({
  label,
  icon,
  isSelected,
  styles,
  colors,
  onPress,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  isSelected: boolean;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
  onPress: () => void;
}) {
  const press = usePressScale();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
    >
      <Animated.View style={[styles.chip, isSelected && styles.chipSelected, press.style]}>
        {icon ? (
          <Ionicons
            name={icon}
            size={14}
            color={isSelected ? colors.textInverse : colors.textPrimary}
            style={styles.chipIcon}
          />
        ) : null}
        <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

// Styles are built per-render from the live theme palette (rather than a
// static module-level StyleSheet.create()) so the sheet reacts to the
// baker's accent color / light-dark preference. See BottomSheet.tsx and
// FormField.tsx for the same pattern.
function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    title: { ...typography.titleLg, color: colors.textPrimary, marginBottom: spacing.lg },
    label: { ...typography.titleSm, color: colors.textPrimary, marginBottom: spacing.xs },
    quantityUnitRow: { flexDirection: 'row', gap: spacing.md },
    quantityCol: { width: 96 },
    quantityInput: { textAlign: 'left' },
    unitCol: { flex: 1 },
    chipScroll: { height: 40, maxHeight: 40, flexGrow: 0, flexShrink: 0, marginBottom: spacing.lg },
    chipScrollContent: { flexGrow: 0, alignItems: 'flex-start', paddingRight: spacing.xl },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.full,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      minHeight: 36,
      justifyContent: 'center',
      marginRight: spacing.sm,
    },
    chipIcon: { marginRight: spacing.xxs },
    chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { ...typography.bodySm, color: colors.textPrimary },
    chipTextSelected: { color: colors.textInverse },
    fieldError: { ...typography.bodySm, color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.md },
    previewSectionLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: spacing.sm,
    },
    previewCard: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    previewTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    previewIconTile: {
      width: 32,
      height: 32,
      borderRadius: radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    previewName: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
    previewCategory: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
    previewStock: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  });
}