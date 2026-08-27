import { useHideFloatingNav } from '../../../../src/hooks/useHideFloatingNav';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useThemeColors } from '../../../../src/theme/ThemeContext';
import { useCreateProductCategory } from '../../../../src/hooks/useProducts';
import { usePressScale } from '../../../../src/hooks/usePressScale';
import { FormField } from '../../../../src/components/FormField';
import { Screen } from '../../../../src/components/Screen';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import { ErrorBanner } from '../../../../src/components/ErrorBanner';
import { spacing, radii, typography, motionDuration, motionEasing } from '../../../../src/theme';
import type { ColorToken } from '../../../../src/theme/colors';

// A fixed, curated icon set (matches the "choose an icon" reference
// mockup) rather than a searchable/full icon library — keeps the grid
// small enough to scan at a glance, consistent with the app's "curated,
// not free-form" pattern already used for accent colors (see
// src/theme/accentSwatches.ts).
const ICON_OPTIONS = [
  'cafe-outline',
  'ice-cream-outline',
  'pizza-outline',
  'nutrition-outline',
  'wine-outline',
  'basket-outline',
  'gift-outline',
  'restaurant-outline',
  'flame-outline',
  'star-outline',
] as const;

// Literal, describes-the-shape labels — not category-concept names. The
// point is removing doubt about what the icon actually depicts (does
// "gift-outline" read as a present, or a box of packaging?), not
// suggesting what a baker should name their category.
const ICON_LABELS: Record<(typeof ICON_OPTIONS)[number], string> = {
  'cafe-outline': 'Coffee',
  'ice-cream-outline': 'Ice cream',
  'pizza-outline': 'Pizza',
  'nutrition-outline': 'Fruit',
  'wine-outline': 'Wine',
  'basket-outline': 'Basket',
  'gift-outline': 'Gift',
  'restaurant-outline': 'Dining',
  'flame-outline': 'Flame',
  'star-outline': 'Star',
};

const ICON_GRID_COLUMNS = 4;

export default function NewCategoryScreen() {
  useHideFloatingNav();
  const router = useRouter();
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Computed, not guessed — 64px was a fixed value that happened to fit
  // 4-per-row with leftover space on the right on this device, but
  // wouldn't reliably fill the row edge-to-edge on a different screen
  // width. This derives the exact tile width so 4 columns + 3 gaps
  // always sum to precisely the container's actual content width.
  const { width: windowWidth } = useWindowDimensions();
  const iconTileWidth =
    (windowWidth - spacing.xl * 2 - spacing.md * (ICON_GRID_COLUMNS - 1)) / ICON_GRID_COLUMNS;
  const createCategory = useCreateProductCategory();

  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | undefined>(undefined);

  const canSave = name.trim().length > 0 && !!icon && !createCategory.isPending;

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Enter a category name');
      return;
    }
    if (!icon) return;
    setNameError(undefined);

    createCategory.mutate(
      { name: trimmed, icon },
      { onSuccess: () => router.back() }
    );
  };

  return (
    <Screen style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>New category</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {createCategory.isError ? (
          <ErrorBanner message="Couldn't save this category. Please try again." />
        ) : null}

        <FormField
          label="Name"
          placeholder="e.g. Dessert"
          value={name}
          onChangeText={setName}
          error={nameError}
        />

        <Text style={styles.label}>Choose an icon</Text>
        <Animated.View
          entering={FadeIn.duration(motionDuration.medium).easing(motionEasing.decelerate)}
          style={styles.iconGrid}
        >
          {ICON_OPTIONS.map((name) => (
            <IconTile
              key={name}
              iconName={name}
              isSelected={icon === name}
              onPress={() => setIcon(name)}
              styles={styles}
              colors={colors}
              width={iconTileWidth}
            />
          ))}
        </Animated.View>

        <View style={styles.createButton}>
          <PrimaryButton
            title={createCategory.isPending ? 'Saving…' : 'Create category'}
            onPress={handleCreate}
            disabled={!canSave}
            isLoading={createCategory.isPending}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

function IconTile({
  iconName,
  isSelected,
  onPress,
  styles,
  colors,
  width,
}: {
  iconName: (typeof ICON_OPTIONS)[number];
  isSelected: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
  width: number;
}) {
  const press = usePressScale(0.92);
  const label = ICON_LABELS[iconName];

  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={label}
      style={[styles.iconTileWrap, { width }]}
    >
      <Animated.View style={[styles.iconTile, isSelected && styles.iconTileSelected, press.style]}>
        <Ionicons
          name={iconName as keyof typeof Ionicons.glyphMap}
          size={22}
          color={isSelected ? colors.textInverse : colors.textPrimary}
        />
      </Animated.View>
      <Text
        style={[styles.iconTileLabel, isSelected && styles.iconTileLabelSelected]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, padding: spacing.xl },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.lg,
    },
    backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { ...typography.displaySm, color: colors.textPrimary },
    scrollContent: { paddingBottom: spacing.xxl },
    label: { ...typography.titleSm, color: colors.textPrimary, marginBottom: spacing.md },
    iconGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
      marginBottom: spacing.xl,
    },
    iconTileWrap: { alignItems: 'center' },
    iconTile: {
      width: 56,
      height: 56,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconTileSelected: {
      backgroundColor: colors.primary,
    },
    iconTileLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: spacing.xxs,
      textAlign: 'center',
    },
    iconTileLabelSelected: {
      color: colors.primary,
      fontWeight: '600',
    },
    createButton: { marginTop: spacing.sm },
  });
}