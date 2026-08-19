import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useThemeColors } from '../../../../src/theme/ThemeContext';
import {
  useCreateProduct,
  useDeleteProductCategory,
  useProductCategories,
} from '../../../../src/hooks/useProducts';
import { productFormSchema } from '../../../../src/utils/validation/productSchemas';
import { getCategoryVisual } from '../../../../src/utils/productCategoryIcon';
import { FormField } from '../../../../src/components/FormField';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import { ErrorBanner } from '../../../../src/components/ErrorBanner';
import { ConfirmDialog } from '../../../../src/components/ConfirmDialog';
import { uploadProductPhoto } from '../../../../src/services/products';
import { spacing, radii, typography, motionDuration, motionEasing } from '../../../../src/theme';
import type { ColorToken } from '../../../../src/theme/colors';
import type { ProductCategory } from '../../../../src/types/product';

export default function NewProductScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const createProduct = useCreateProduct();
  const { data: categories } = useProductCategories();

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ name?: string; category?: string }>({});
  const [isEditingCategories, setIsEditingCategories] = useState(false);
  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<ProductCategory | null>(
    null
  );
  const deleteCategory = useDeleteProductCategory();

  // Quick-pick chips now come from the product_categories table rather
  // than being derived from distinct values already in use on products
  // — see docs/DECISIONS.md's 2026-08-18 entry. This lets a category
  // (and its chosen icon) exist and show up here before any product
  // actually uses it, which the old "distinct from products" approach
  // couldn't do.
  const existingCategories = categories ?? [];

  const canSave = name.trim().length > 0 && !createProduct.isPending;

  const handlePickPhoto = async () => {
    setPhotoError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPhotoError("Couldn't access your photos. You can still save without one.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    const parsed = productFormSchema.safeParse({ name, category });
    if (!parsed.success) {
      const fieldErrors: typeof errors = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'name') fieldErrors.name = issue.message;
        if (issue.path[0] === 'category') fieldErrors.category = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});

    // Photo upload failure is handled separately from the product save
    // itself, per docs/UI_UX_1.md section E.5a: "offer 'Save without
    // photo' rather than blocking the whole save on a flaky upload."
    let image_url: string | null = null;
    if (imageUri) {
      try {
        image_url = await uploadProductPhoto(imageUri);
      } catch {
        setPhotoError("Couldn't upload your photo — saving without it. You can add one later.");
      }
    }

    createProduct.mutate(
      { ...parsed.data, image_url },
      {
        onSuccess: (product) => {
          router.replace(`/more/products/${product.id}`);
        },
      }
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>New product</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {createProduct.isError ? (
          <ErrorBanner message="Couldn't save your product. Please try again." />
        ) : null}

        <Pressable style={styles.photoPicker} onPress={handlePickPhoto}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.photoPreview} />
          ) : (
            <>
              <Ionicons name="camera-outline" size={28} color={colors.textSecondary} />
              <Text style={styles.photoPickerText}>Add a photo (optional)</Text>
            </>
          )}
        </Pressable>
        {photoError ? <Text style={styles.photoError}>{photoError}</Text> : null}

        <FormField
          label="Name"
          placeholder="e.g. Carrot cake"
          value={name}
          onChangeText={setName}
          error={errors.name}
        />

        <View style={styles.categoryLabelRow}>
          <Text style={styles.label}>Category (optional)</Text>
          {isEditingCategories ? (
            <Pressable onPress={() => setIsEditingCategories(false)}>
              <Text style={styles.categoryDoneText}>Done</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.categoryChipRow}>
          {existingCategories.map((cat) => (
            <CategoryChip
              key={cat.id}
              category={cat}
              isSelected={category === cat.name}
              isEditing={isEditingCategories}
              onSelect={() => setCategory(category === cat.name ? '' : cat.name)}
              onLongPress={() => setIsEditingCategories(true)}
              onRequestDelete={() => setPendingDeleteCategory(cat)}
              styles={styles}
              colors={colors}
            />
          ))}
          <Pressable
            onPress={
              isEditingCategories ? undefined : () => router.push('/more/products/categories/new')
            }
            style={[styles.categoryChipNew, isEditingCategories && styles.categoryChipNewDisabled]}
          >
            <Ionicons name="add" size={14} color={colors.primary} />
            <Text style={styles.categoryChipNewText}>New</Text>
          </Pressable>
        </View>
        {errors.category ? <Text style={styles.photoError}>{errors.category}</Text> : null}

        <View style={styles.saveButton}>
          <PrimaryButton
            title={createProduct.isPending ? 'Saving…' : 'Save'}
            onPress={handleSave}
            disabled={!canSave}
            isLoading={createProduct.isPending}
          />
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={!!pendingDeleteCategory}
        title="Delete this category?"
        message={`"${pendingDeleteCategory?.name}" will be removed. Any product that already used this category keeps its name, it just won't show this icon anymore.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (!pendingDeleteCategory) return;
          if (category === pendingDeleteCategory.name) setCategory('');
          deleteCategory.mutate(pendingDeleteCategory.id);
          setPendingDeleteCategory(null);
        }}
        onCancel={() => setPendingDeleteCategory(null)}
      />
    </View>
  );
}

// Long-press any chip to enter "editing" mode (all chips wiggle + grow
// an x badge, like iOS home-screen icons) — tap a chip's x to remove
// that category, tap "Done" to exit. Deleting only removes the
// product_categories row; any product already carrying that category
// name keeps it, per docs/DECISIONS.md's 2026-08-18 entry — see the
// ConfirmDialog message above for the plain-language version of that.
function CategoryChip({
  category,
  isSelected,
  isEditing,
  onSelect,
  onLongPress,
  onRequestDelete,
  styles,
  colors,
}: {
  category: ProductCategory;
  isSelected: boolean;
  isEditing: boolean;
  onSelect: () => void;
  onLongPress: () => void;
  onRequestDelete: () => void;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
}) {
  const visual = getCategoryVisual(category.name, [category]);
  const wiggle = useSharedValue(0);

  useEffect(() => {
    if (isEditing) {
      wiggle.value = withRepeat(
        withSequence(
          withTiming(-1, { duration: motionDuration.instant, easing: motionEasing.standard }),
          withTiming(1, { duration: motionDuration.instant * 2, easing: motionEasing.standard }),
          withTiming(0, { duration: motionDuration.instant, easing: motionEasing.standard })
        ),
        -1
      );
    } else {
      wiggle.value = withTiming(0, { duration: motionDuration.fast });
    }
  }, [isEditing]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${wiggle.value * 2}deg` }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={isEditing ? undefined : onSelect}
        onLongPress={isEditing ? undefined : onLongPress}
        style={[
          styles.categoryChip,
          isSelected && { backgroundColor: visual.color, borderColor: visual.color },
        ]}
      >
        <Ionicons
          name={visual.icon as keyof typeof Ionicons.glyphMap}
          size={14}
          color={isSelected ? colors.textInverse : colors.textSecondary}
        />
        <Text style={[styles.categoryChipText, isSelected && styles.categoryChipTextSelected]}>
          {category.name}
        </Text>
      </Pressable>
      {isEditing ? (
        <Pressable onPress={onRequestDelete} style={styles.categoryChipDeleteBadge} hitSlop={8}>
          <Ionicons name="close" size={10} color={colors.textInverse} />
        </Pressable>
      ) : null}
    </Animated.View>
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
    photoPicker: {
      height: 120,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xs,
    },
    photoPreview: {
      width: '100%',
      height: '100%',
      borderRadius: radii.lg,
      backgroundColor: colors.surface,
    },
    photoPickerText: { ...typography.bodySm, color: colors.textSecondary, marginTop: spacing.xs },
    scrollContent: { paddingBottom: spacing.xxl },
    photoError: {
      ...typography.caption,
      color: colors.danger,
      marginBottom: spacing.lg,
    },
    label: { ...typography.titleSm, color: colors.textPrimary, marginBottom: spacing.sm },
    categoryLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    categoryDoneText: { ...typography.bodySm, color: colors.primary, fontWeight: '600' },
    categoryChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    categoryChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.full,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.surface,
    },
    categoryChipText: { ...typography.bodySm, color: colors.textPrimary },
    categoryChipTextSelected: { color: colors.textInverse },
    categoryChipNew: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: radii.full,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    categoryChipNewText: { ...typography.bodySm, color: colors.primary, fontWeight: '600' },
    categoryChipNewDisabled: { opacity: 0.4 },
    categoryChipDeleteBadge: {
      position: 'absolute',
      top: -6,
      right: -6,
      width: 18,
      height: 18,
      borderRadius: radii.full,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.background,
    },
    saveButton: { marginTop: spacing.sm },
  });
}
