import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useThemeColors } from '../../../../src/theme/ThemeContext';
import { useCreateProduct, useProducts } from '../../../../src/hooks/useProducts';
import { productFormSchema } from '../../../../src/utils/validation/productSchemas';
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
  const { data: existingProducts } = useProducts();

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ name?: string; category?: string }>({});

  // Quick-pick chips from categories already in use — per the user's
  // decision: "show existing category chips as quick-pick + allow typing
  // new one." See docs/DECISIONS.md's 2026-08-17 entry.
  const existingCategories = useMemo(() => {
    if (!existingProducts) return [];
    const distinct = new Set<string>();
    for (const p of existingProducts) {
      if (p.category) distinct.add(p.category);
    }
    return Array.from(distinct).sort((a, b) => a.localeCompare(b));
  }, [existingProducts]);

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

      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
        {existingCategories.length > 0 ? (
          <View style={styles.categoryChipRow}>
            {existingCategories.map((cat) => {
              const isSelected = category === cat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setCategory(isSelected ? '' : cat)}
                  style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      isSelected && styles.categoryChipTextSelected,
                    ]}
                  >
                    {cat}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        <FormField
          label=""
          placeholder="Or type a new category"
          value={category}
          onChangeText={setCategory}
          error={errors.category}
        />
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          title={createProduct.isPending ? 'Saving…' : 'Save'}
          onPress={handleSave}
          disabled={!canSave}
          isLoading={createProduct.isPending}
        />
      </View>
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
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.full,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.surface,
    },
    categoryChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    categoryChipText: { ...typography.bodySm, color: colors.textPrimary },
    categoryChipTextSelected: { color: colors.textInverse },
    footer: { paddingTop: spacing.md },
  });
}
