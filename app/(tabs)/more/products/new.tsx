import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useThemeColors } from '../../../../src/theme/ThemeContext';
import { useCreateProduct, useProductCategories } from '../../../../src/hooks/useProducts';
import { productFormSchema } from '../../../../src/utils/validation/productSchemas';
import { getCategoryVisual } from '../../../../src/utils/productCategoryIcon';
import { FormField } from '../../../../src/components/FormField';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import { ErrorBanner } from '../../../../src/components/ErrorBanner';
import { uploadProductPhoto } from '../../../../src/services/products';
import { spacing, radii, typography } from '../../../../src/theme';
import type { ColorToken } from '../../../../src/theme/colors';

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

        <Text style={styles.label}>Category (optional)</Text>
        <View style={styles.categoryChipRow}>
          {existingCategories.map((cat) => {
            const isSelected = category === cat.name;
            const visual = getCategoryVisual(cat.name, existingCategories);
            return (
              <Pressable
                key={cat.id}
                onPress={() => setCategory(isSelected ? '' : cat.name)}
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
                <Text
                  style={[
                    styles.categoryChipText,
                    isSelected && styles.categoryChipTextSelected,
                  ]}
                >
                  {cat.name}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => router.push('/more/products/categories/new')}
            style={styles.categoryChipNew}
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
    </View>
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
    saveButton: { marginTop: spacing.sm },
  });
}
