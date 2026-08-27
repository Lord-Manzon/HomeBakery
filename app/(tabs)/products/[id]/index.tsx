import { useMemo, useState } from 'react';
import { useHideFloatingNav } from '../../../../src/hooks/useHideFloatingNav';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import {
  useCreateVariant,
  useDeactivateProduct,
  useDeactivateVariant,
  useProduct,
  useProductCategories,
  useUpdateProduct,
  useUpdateVariant,
  useVariants,
} from '../../../../src/hooks/useProducts';
import { useBakerProfile } from '../../../../src/hooks/useBakerProfile';
import { useThemeColors } from '../../../../src/theme/ThemeContext';
import { usePressScale } from '../../../../src/hooks/usePressScale';
import { getCategoryVisual } from '../../../../src/utils/productCategoryIcon';
import { ErrorBanner } from '../../../../src/components/ErrorBanner';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import { VariantFormSheet } from '../../../../src/components/VariantFormSheet';
import { ConfirmDialog } from '../../../../src/components/ConfirmDialog';
import { Screen } from '../../../../src/components/Screen';
import { uploadProductPhoto } from '../../../../src/services/products';
import { formatCurrency } from '../../../../src/utils/currency';
import { spacing, radii, typography, motionDuration, motionEasing, motionStagger } from '../../../../src/theme';
import type { ColorToken } from '../../../../src/theme/colors';
import type { ProductCategory, ProductVariant } from '../../../../src/types/product';

export default function ProductDetailScreen() {
  useHideFloatingNav();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { data: product, isLoading, isError } = useProduct(id);
  const { data: variants, isLoading: isLoadingVariants } = useVariants(id);
  const { data: baker } = useBakerProfile();
  const { data: productCategories } = useProductCategories();

  const createVariant = useCreateVariant(id);
  const updateVariant = useUpdateVariant(id);
  const updateProduct = useUpdateProduct(id);
  const deactivateVariant = useDeactivateVariant(id);
  const deactivateProduct = useDeactivateProduct();

  const [isVariantSheetOpen, setIsVariantSheetOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState<ProductVariant | undefined>(undefined);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const [isConfirmingDeactivate, setIsConfirmingDeactivate] = useState(false);
  const [revealedVariantId, setRevealedVariantId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [localImageUri, setLocalImageUri] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);

  if (isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }

  if (isError || !product) {
    return (
      <Screen>
        <ErrorBanner message="Couldn't load this product." />
      </Screen>
    );
  }

  const activeVariants = variants ?? [];
  const defaultVariant = activeVariants.find((v) => v.is_default) ?? activeVariants[0];
  const displayImageUri = localImageUri ?? product.image_url ?? null;

  const openAddVariant = () => {
    setEditingVariant(undefined);
    setSaveError(null);
    setIsVariantSheetOpen(true);
  };

  const openEditVariant = (variant: ProductVariant) => {
    setEditingVariant(variant);
    setSaveError(null);
    setIsVariantSheetOpen(true);
  };

  const handleVariantSubmit = (input: Parameters<typeof createVariant.mutate>[0]) => {
    setSaveError(null);
    if (editingVariant) {
      updateVariant.mutate(
        { variantId: editingVariant.id, input },
        {
          onSuccess: () => setIsVariantSheetOpen(false),
          onError: () => setSaveError("Couldn't save this variant. Please try again."),
        }
      );
    } else {
      createVariant.mutate(input, {
        onSuccess: () => setIsVariantSheetOpen(false),
        onError: () => setSaveError("Couldn't save this variant. Please try again."),
      });
    }
  };

  const handleRecipeAndCosting = () => {
    if (!defaultVariant) return;
    router.push(`/products/${product.id}/recipe?variantId=${defaultVariant.id}`);
  };

  const handlePickPhoto = async () => {
    setPhotoError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPhotoError("Couldn't access your photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;

    const localUri = result.assets[0].uri;
    setLocalImageUri(localUri);
    setIsUploadingPhoto(true);
    try {
      const uploadedUrl = await uploadProductPhoto(localUri);
      updateProduct.mutate(
        { name: product.name, category: product.category, image_url: uploadedUrl },
        { onError: () => setPhotoError("Couldn't save your photo. Please try again.") }
      );
    } catch {
      setPhotoError("Couldn't upload your photo. Please try again.");
      setLocalImageUri(null);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const openNameEdit = () => {
    setNameDraft(product.name);
    setNameError(null);
    setIsEditingName(true);
  };

  const commitNameEdit = () => {
    const trimmed = nameDraft.trim();
    setIsEditingName(false);
    if (trimmed === product.name) return;
    if (!trimmed) {
      setNameError("Name can't be empty");
      return;
    }
    setNameError(null);
    updateProduct.mutate(
      { name: trimmed, category: product.category, image_url: product.image_url },
      { onError: () => setNameError("Couldn't save the name. Please try again.") }
    );
  };

  // Selecting the already-set category again clears it — same
  // tap-to-toggle behavior as the New Product chip picker, so this
  // screen doesn't need a separate "remove category" affordance.
  const handleSelectCategory = (name: string) => {
    const next = product.category === name ? null : name;
    updateProduct.mutate({ name: product.name, category: next, image_url: product.image_url });
    setIsCategoryPickerOpen(false);
  };

  return (
    <Screen>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <View style={styles.titleWrap}>
            {isEditingName ? (
              <TextInput
                style={styles.titleInput}
                value={nameDraft}
                onChangeText={setNameDraft}
                onBlur={commitNameEdit}
                onSubmitEditing={commitNameEdit}
                autoFocus
                selectTextOnFocus
                returnKeyType="done"
                maxLength={100}
              />
            ) : (
              <Pressable onPress={openNameEdit} style={styles.titlePressable}>
                <Text style={styles.title} numberOfLines={1}>
                  {product.name}
                </Text>
              </Pressable>
            )}
          </View>
          <Pressable onPress={() => setIsOverflowOpen((v) => !v)} style={styles.iconButton}>
            <Ionicons name="ellipsis-vertical" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        {nameError ? <Text style={styles.nameErrorText}>{nameError}</Text> : null}

        {isOverflowOpen ? (
          <>
            <Pressable style={styles.overflowScrim} onPress={() => setIsOverflowOpen(false)} />
            <Animated.View
              entering={FadeIn.duration(motionDuration.fast).easing(motionEasing.decelerate)}
              style={styles.overflowMenu}
            >
              <Pressable
                style={styles.overflowRow}
                onPress={() => {
                  setIsOverflowOpen(false);
                  setIsConfirmingDeactivate(true);
                }}
              >
                <Ionicons name="archive-outline" size={18} color={colors.danger} />
                <Text style={styles.overflowRowText}>Deactivate product</Text>
              </Pressable>
            </Animated.View>
          </>
        ) : null}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroBlock}>
            <HeroPhoto
              uri={displayImageUri}
              isUploading={isUploadingPhoto}
              onPress={handlePickPhoto}
              styles={styles}
              colors={colors}
            />
            {photoError ? <Text style={styles.photoErrorText}>{photoError}</Text> : null}

            <Pressable
              onPress={() => setIsCategoryPickerOpen((v) => !v)}
              style={
                product.category
                  ? styles.categoryPill
                  : [styles.categoryPill, styles.categoryPillEmpty]
              }
            >
              {product.category ? (
                <>
                  <Ionicons
                    name={
                      getCategoryVisual(product.category, productCategories ?? [])
                        .icon as keyof typeof Ionicons.glyphMap
                    }
                    size={12}
                    color={colors.textSecondary}
                  />
                  <Text style={styles.categoryPillText}>{product.category}</Text>
                </>
              ) : (
                <>
                  <Ionicons name="add" size={12} color={colors.primary} />
                  <Text style={styles.categoryPillEmptyText}>Add category</Text>
                </>
              )}
            </Pressable>

            {isCategoryPickerOpen ? (
              <Animated.View
                entering={FadeIn.duration(motionDuration.fast).easing(motionEasing.decelerate)}
                style={styles.categoryPickerRow}
              >
                {(productCategories ?? []).map((cat) => {
                  const isSelected = product.category === cat.name;
                  const visual = getCategoryVisual(cat.name, productCategories ?? []);
                  return (
                    <Pressable
                      key={cat.id}
                      onPress={() => handleSelectCategory(cat.name)}
                      style={[
                        styles.categoryPickerChip,
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
                          styles.categoryPickerChipText,
                          isSelected && styles.categoryPickerChipTextSelected,
                        ]}
                      >
                        {cat.name}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => router.push('/products/categories/new')}
                  style={styles.categoryPickerChipNew}
                >
                  <Ionicons name="add" size={14} color={colors.primary} />
                  <Text style={styles.categoryPickerChipNewText}>New</Text>
                </Pressable>
              </Animated.View>
            ) : null}
          </View>

          <Text style={styles.sectionLabel}>Variants</Text>

          {isLoadingVariants ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
          ) : activeVariants.length === 0 ? (
            <Animated.View
              entering={FadeIn.duration(motionDuration.medium).easing(motionEasing.decelerate)}
              style={styles.emptyVariants}
            >
              <Text style={styles.emptyVariantsText}>This product has no sizes yet</Text>
              <View style={styles.emptyVariantsButton}>
                <PrimaryButton title="Add variant" onPress={openAddVariant} />
              </View>
            </Animated.View>
          ) : (
            <View style={styles.variantsGrid}>
              {activeVariants.map((item, index) => (
                <VariantCard
                  key={item.id}
                  index={index}
                  variant={item}
                  currency={baker?.currency}
                  styles={styles}
                  colors={colors}
                  onPress={() => openEditVariant(item)}
                  isRevealed={revealedVariantId === item.id}
                  onReveal={() => setRevealedVariantId(item.id)}
                  onCancelReveal={() => setRevealedVariantId(null)}
                  isDeleting={deactivateVariant.isPending && deactivateVariant.variables === item.id}
                  onConfirmDelete={() => {
                    deactivateVariant.mutate(item.id);
                    setRevealedVariantId(null);
                  }}
                />
              ))}
              <Pressable style={styles.addVariantTile} onPress={openAddVariant}>
                <Ionicons name="add" size={18} color={colors.textSecondary} />
                <Text style={styles.addVariantTileText}>Add variant</Text>
              </Pressable>
            </View>
          )}

          {activeVariants.length > 0 ? (
            <View style={styles.actionsSection}>
              <PrimaryButton
                title="Recipe & costing"
                onPress={handleRecipeAndCosting}
                disabled={!defaultVariant}
              />
              {!defaultVariant ? (
                <Text style={styles.disabledHint}>Add a variant first</Text>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      </View>

      <VariantFormSheet
        visible={isVariantSheetOpen}
        onDismiss={() => setIsVariantSheetOpen(false)}
        onSubmit={handleVariantSubmit}
        isSaving={createVariant.isPending || updateVariant.isPending}
        errorMessage={saveError}
        initialValue={editingVariant}
      />

      <ConfirmDialog
        visible={isConfirmingDeactivate}
        title="Deactivate this product?"
        message={`"${product.name}" will drop off your storefront, but existing order history stays intact. You can't undo this from here.`}
        confirmLabel="Deactivate"
        onConfirm={() => {
          deactivateProduct.mutate(product.id, {
            onSuccess: () => router.back(),
          });
          setIsConfirmingDeactivate(false);
        }}
        onCancel={() => setIsConfirmingDeactivate(false)}
      />
    </Screen>
  );
}

function HeroPhoto({
  uri,
  isUploading,
  onPress,
  styles,
  colors,
}: {
  uri: string | null;
  isUploading: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
}) {
  const press = usePressScale(0.98);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={isUploading}
    >
      <Animated.View style={[styles.hero, press.style]}>
        {uri ? (
          <Image source={{ uri }} style={styles.heroImage} resizeMode="cover" />
        ) : (
          <View style={styles.heroPlaceholder}>
            <Ionicons name="image-outline" size={28} color={colors.textSecondary} />
            <Text style={styles.heroPlaceholderText}>Add a photo</Text>
          </View>
        )}
        {isUploading ? (
          <View style={styles.heroUploadingOverlay}>
            <ActivityIndicator color={colors.textInverse} />
          </View>
        ) : (
          <View style={styles.heroBadge}>
            <Ionicons name="camera" size={14} color={colors.textInverse} />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

function VariantCard({
  variant,
  index,
  currency,
  styles,
  colors,
  onPress,
  isRevealed,
  onReveal,
  onCancelReveal,
  isDeleting,
  onConfirmDelete,
}: {
  variant: ProductVariant;
  index: number;
  currency: string | null | undefined;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
  onPress: () => void;
  isRevealed: boolean;
  onReveal: () => void;
  onCancelReveal: () => void;
  isDeleting: boolean;
  onConfirmDelete: () => void;
}) {
  const press = usePressScale(0.97);
  const delay = Math.min(index, motionStagger.maxStaggeredItems) * motionStagger.listItem;

  return (
    <Animated.View
      entering={FadeInDown.duration(motionDuration.medium).delay(delay).easing(motionEasing.decelerate)}
      exiting={FadeOut.duration(motionDuration.medium).easing(motionEasing.accelerate)}
      layout={LinearTransition.duration(motionDuration.medium).easing(motionEasing.standard)}
      style={styles.variantCardWrap}
    >
      <Pressable
        onPress={isRevealed ? undefined : onPress}
        onLongPress={isRevealed ? undefined : onReveal}
        onPressIn={isRevealed ? undefined : press.onPressIn}
        onPressOut={isRevealed ? undefined : press.onPressOut}
      >
        <Animated.View
          style={[styles.variantCard, isRevealed && styles.variantCardRevealed, press.style]}
        >
          {isRevealed ? (
            <Animated.View entering={FadeIn.duration(motionDuration.fast)}>
              <Text style={styles.variantCardRevealPrompt}>Remove this size?</Text>
              <View style={styles.variantCardRevealRow}>
                <Pressable onPress={onCancelReveal} style={styles.variantCardCancelBtn}>
                  <Text style={styles.variantCardCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={onConfirmDelete}
                  disabled={isDeleting}
                  style={styles.variantCardDeleteBtn}
                >
                  {isDeleting ? (
                    <ActivityIndicator size="small" color={colors.danger} />
                  ) : (
                    <Text style={styles.variantCardDeleteText}>Delete</Text>
                  )}
                </Pressable>
              </View>
            </Animated.View>
          ) : (
            <>
              <Text style={styles.variantCardName}>{variant.name}</Text>
              <Text style={styles.variantCardPrice}>
                {formatCurrency(variant.selling_price, currency)}
              </Text>
            </>
          )}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    content: { flex: 1, paddingHorizontal: spacing.lg },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    titleWrap: { flex: 1, alignItems: 'center' },
    titlePressable: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xxs,
      maxWidth: '100%',
    },
    title: { ...typography.displaySm, color: colors.textPrimary, flexShrink: 1 },
    titleInput: {
      ...typography.displaySm,
      color: colors.textPrimary,
      flex: 1,
      textAlign: 'center',
      borderBottomWidth: 1,
      borderBottomColor: colors.primary,
      paddingBottom: spacing.xxs,
    },
    nameErrorText: {
      ...typography.caption,
      color: colors.danger,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    overflowScrim: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 5,
    },
    overflowMenu: {
      position: 'absolute',
      top: 56,
      right: 0,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      overflow: 'hidden',
      zIndex: 10,
      elevation: 6,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
    },
    overflowRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      minHeight: 44,
    },
    overflowRowText: { ...typography.body, color: colors.danger },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: spacing.xxxl + 96 },
    heroBlock: { marginBottom: spacing.xl },
    hero: {
      width: '100%',
      height: 180,
      borderRadius: radii.lg,
      backgroundColor: colors.surfaceMuted,
      overflow: 'hidden',
    },
    heroImage: { width: '100%', height: '100%' },
    heroPlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
      borderRadius: radii.lg,
    },
    heroPlaceholderText: { ...typography.bodySm, color: colors.textSecondary },
    heroBadge: {
      position: 'absolute',
      right: spacing.sm,
      bottom: spacing.sm,
      width: 30,
      height: 30,
      borderRadius: radii.full,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.surface,
    },
    heroUploadingOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(46, 42, 38, 0.35)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoErrorText: { ...typography.caption, color: colors.danger, marginTop: spacing.sm },
    categoryPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      alignSelf: 'flex-start',
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.full,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      marginTop: spacing.sm,
    },
    categoryPillEmpty: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.primary,
      borderStyle: 'dashed',
    },
    categoryPillText: { ...typography.caption, color: colors.textSecondary },
    categoryPillEmptyText: { ...typography.caption, color: colors.primary, fontWeight: '600' },
    categoryPickerRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    categoryPickerChip: {
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
    categoryPickerChipText: { ...typography.bodySm, color: colors.textPrimary },
    categoryPickerChipTextSelected: { color: colors.textInverse },
    categoryPickerChipNew: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: radii.full,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    categoryPickerChipNewText: { ...typography.bodySm, color: colors.primary, fontWeight: '600' },
    sectionLabel: { ...typography.titleSm, color: colors.textPrimary, marginBottom: spacing.md },
    emptyVariants: {
      alignItems: 'center',
      paddingVertical: spacing.xxl,
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.lg,
    },
    emptyVariantsText: { ...typography.bodySm, color: colors.textSecondary, marginBottom: spacing.lg },
    emptyVariantsButton: { minWidth: 180 },
    variantsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    variantCardWrap: { width: '47%' },
    variantCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      padding: spacing.md,
      minHeight: 64,
      justifyContent: 'center',
    },
    variantCardRevealed: {
      borderColor: colors.danger,
    },
    variantCardName: { ...typography.body, color: colors.textPrimary },
    variantCardPrice: { ...typography.titleSm, color: colors.textPrimary, marginTop: spacing.xxs },
    variantCardRevealPrompt: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs },
    variantCardRevealRow: { flexDirection: 'row', gap: spacing.xs },
    variantCardCancelBtn: {
      flex: 1,
      height: 30,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    variantCardCancelText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
    variantCardDeleteBtn: {
      flex: 1,
      height: 30,
      borderRadius: radii.sm,
      backgroundColor: colors.dangerMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    variantCardDeleteText: { ...typography.caption, color: colors.danger, fontWeight: '600' },
    addVariantTile: {
      width: '47%',
      minHeight: 64,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: spacing.xs,
    },
    addVariantTileText: { ...typography.bodySm, color: colors.textSecondary },
    actionsSection: {
      marginTop: spacing.xl,
      paddingTop: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    disabledHint: {
      ...typography.caption,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
  });
}