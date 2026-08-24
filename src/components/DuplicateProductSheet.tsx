import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { BottomSheet } from './BottomSheet';
import { FormField } from './FormField';
import { PrimaryButton } from './PrimaryButton';
import { ErrorBanner } from './ErrorBanner';
import { usePressScale } from '../hooks/usePressScale';
import { useThemeColors } from '../theme/ThemeContext';
import { radii, spacing, typography } from '../theme';
import type { ColorToken } from '../theme/colors';
import type { ProductWithVariants } from '../types/product';

type DuplicateProductSheetProps = {
  visible: boolean;
  product: ProductWithVariants | null;
  onDismiss: () => void;
  onSubmit: (options: {
    name: string;
    includePhoto: boolean;
    includeVariants: boolean;
    includeRecipeLinks: boolean;
  }) => void;
  isSaving: boolean;
  errorMessage?: string | null;
};

/**
 * "Recipe links" only actually matters if "Variants" is also included —
 * there's nothing to attach a recipe link to otherwise. Kept as its own
 * toggle rather than folded into Variants, since a baker might
 * reasonably want to copy variant names/prices but start fresh on
 * costing without carrying over the old recipe connection.
 */
export function DuplicateProductSheet({
  visible,
  product,
  onDismiss,
  onSubmit,
  isSaving,
  errorMessage,
}: DuplicateProductSheetProps) {
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [name, setName] = useState('');
  const [includeVariants, setIncludeVariants] = useState(true);
  const [includeRecipeLinks, setIncludeRecipeLinks] = useState(true);
  const [includePhoto, setIncludePhoto] = useState(true);

  // Same "sheet stays mounted, useState only runs once" fix as
  // IngredientFormSheet.tsx and VariantFormSheet.tsx — re-syncs every
  // time the sheet opens for a (possibly different) product, instead of
  // showing whatever was left over from the last product duplicated.
  useEffect(() => {
    if (visible && product) {
      setName(`${product.name} - copy`);
      setIncludeVariants(true);
      setIncludeRecipeLinks(true);
      setIncludePhoto(true);
    }
  }, [visible, product]);

  if (!product) return null;

  const variantCount = product.variants.length;

  const handleSave = () => {
    onSubmit({
      name: name.trim(),
      includePhoto,
      includeVariants,
      // Meaningless without variants — collapsed here regardless of the
      // toggle's own displayed state, so a stale "on" value from before
      // Variants was switched off can never sneak through.
      includeRecipeLinks: includeVariants && includeRecipeLinks,
    });
  };

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} dismissDisabled={isSaving}>
      <Text style={styles.title}>Duplicate product</Text>
      <Text style={styles.subtitle}>Creates a new product from "{product.name}".</Text>

      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

      <FormField label="New product name" placeholder="e.g. Chocolate Cake - copy" value={name} onChangeText={setName} />

      <Text style={styles.label}>Include</Text>

      <ToggleRow
        icon="layers-outline"
        label="Variants"
        sublabel={variantCount > 0 ? `${variantCount} variant${variantCount === 1 ? '' : 's'}` : 'No variants to copy'}
        checked={includeVariants}
        disabled={variantCount === 0}
        onToggle={() => setIncludeVariants((v) => !v)}
        styles={styles}
        colors={colors}
      />
      <ToggleRow
        icon="book-outline"
        label="Recipe links"
        sublabel={includeVariants ? "Keep each variant's connected recipe" : 'Needs Variants included'}
        checked={includeVariants && includeRecipeLinks}
        disabled={!includeVariants}
        onToggle={() => setIncludeRecipeLinks((v) => !v)}
        styles={styles}
        colors={colors}
      />
      <ToggleRow
        icon="image-outline"
        label="Photo"
        sublabel={product.image_url ? 'Reuse the same photo' : 'No photo to copy'}
        checked={includePhoto}
        disabled={!product.image_url}
        onToggle={() => setIncludePhoto((v) => !v)}
        styles={styles}
        colors={colors}
      />

      <View style={styles.saveGap} />
      <PrimaryButton
        title="Duplicate"
        onPress={handleSave}
        isLoading={isSaving}
        disabled={name.trim().length === 0}
      />
    </BottomSheet>
  );
}

function ToggleRow({
  icon,
  label,
  sublabel,
  checked,
  disabled,
  onToggle,
  styles,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
}) {
  const press = usePressScale();
  const tint = disabled ? colors.textSecondary : colors.textPrimary;

  return (
    <Pressable
      onPress={disabled ? undefined : onToggle}
      onPressIn={disabled ? undefined : press.onPressIn}
      onPressOut={disabled ? undefined : press.onPressOut}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
    >
      <Animated.View style={[styles.toggleRow, press.style]}>
        <View style={[styles.toggleIconTile, disabled && styles.toggleIconTileDisabled]}>
          <Ionicons name={icon} size={15} color={tint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.toggleLabel, { color: tint }]}>{label}</Text>
          <Text style={styles.toggleSublabel}>{sublabel}</Text>
        </View>
        <Ionicons
          name={checked ? 'checkmark-circle' : 'ellipse-outline'}
          size={22}
          color={disabled ? colors.textSecondary : checked ? colors.primary : colors.textSecondary}
        />
      </Animated.View>
    </Pressable>
  );
}

function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    title: { ...typography.titleLg, color: colors.textPrimary, marginBottom: spacing.xs },
    subtitle: { ...typography.bodySm, color: colors.textSecondary, marginBottom: spacing.lg },
    label: { ...typography.titleSm, color: colors.textPrimary, marginBottom: spacing.xs },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      minHeight: 52,
    },
    toggleIconTile: {
      width: 32,
      height: 32,
      borderRadius: radii.sm,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toggleIconTileDisabled: { opacity: 0.5 },
    toggleLabel: { ...typography.body, fontWeight: '600' },
    toggleSublabel: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
    saveGap: { height: spacing.md },
  });
}