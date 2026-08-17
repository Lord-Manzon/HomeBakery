import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  useCreateVariant,
  useDeactivateProduct,
  useDeactivateVariant,
  useProduct,
  useUpdateVariant,
  useVariants,
} from '../../../../../src/hooks/useProducts';
import { useBakerProfile } from '../../../../../src/hooks/useBakerProfile';
import { useThemeColors } from '../../../../../src/theme/ThemeContext';
import { ErrorBanner } from '../../../../../src/components/ErrorBanner';
import { PrimaryButton } from '../../../../../src/components/PrimaryButton';
import { VariantFormSheet } from '../../../../../src/components/VariantFormSheet';
import { ConfirmDialog } from '../../../../../src/components/ConfirmDialog';
import { Screen } from '../../../../../src/components/Screen';
import { formatCurrency } from '../../../../../src/utils/currency';
import { spacing, radii, typography } from '../../../../../src/theme';
import type { ColorToken } from '../../../../../src/theme/colors';
import type { ProductVariant } from '../../../../../src/types/product';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { data: product, isLoading, isError } = useProduct(id);
  const { data: variants, isLoading: isLoadingVariants } = useVariants(id);
  const { data: baker } = useBakerProfile();

  const createVariant = useCreateVariant(id);
  const updateVariant = useUpdateVariant(id);
  const deactivateVariant = useDeactivateVariant(id);
  const deactivateProduct = useDeactivateProduct();

  const [isVariantSheetOpen, setIsVariantSheetOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState<ProductVariant | undefined>(undefined);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const [isConfirmingDeactivate, setIsConfirmingDeactivate] = useState(false);
  const [confirmingDeleteVariantId, setConfirmingDeleteVariantId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    router.push(`/more/products/${product.id}/recipe?variantId=${defaultVariant.id}`);
  };

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {product.name}
        </Text>
        <Pressable onPress={() => setIsOverflowOpen((v) => !v)} style={styles.iconButton}>
          <Ionicons name="ellipsis-vertical" size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      {isOverflowOpen ? (
        <View style={styles.overflowMenu}>
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
        </View>
      ) : null}

      {product.category ? (
        <View style={styles.categoryPill}>
          <Text style={styles.categoryPillText}>{product.category}</Text>
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>Variants</Text>

      {isLoadingVariants ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
      ) : activeVariants.length === 0 ? (
        <View style={styles.emptyVariants}>
          <Text style={styles.emptyVariantsText}>This product has no sizes yet</Text>
          <View style={styles.emptyVariantsButton}>
            <PrimaryButton title="Add variant" onPress={openAddVariant} />
          </View>
        </View>
      ) : (
        <>
          <FlatList
            data={activeVariants}
            keyExtractor={(v) => v.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <VariantRow
                variant={item}
                currency={baker?.currency}
                styles={styles}
                colors={colors}
                onPress={() => openEditVariant(item)}
                onDeactivate={() => setConfirmingDeleteVariantId(item.id)}
                isConfirmingDeactivate={confirmingDeleteVariantId === item.id}
                onConfirmDeactivate={() => {
                  deactivateVariant.mutate(item.id);
                  setConfirmingDeleteVariantId(null);
                }}
                onCancelDeactivate={() => setConfirmingDeleteVariantId(null)}
              />
            )}
          />

          <View style={styles.actionRow}>
            <View style={styles.actionButtonSecondary}>
              <PrimaryButton title="Add variant" onPress={openAddVariant} variant="secondary" />
            </View>
            <View style={styles.actionButtonPrimary}>
              <PrimaryButton
                title="Recipe & costing"
                onPress={handleRecipeAndCosting}
                disabled={!defaultVariant}
              />
            </View>
          </View>
          {!defaultVariant ? (
            <Text style={styles.disabledHint}>Add a variant first</Text>
          ) : null}
        </>
      )}

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

function VariantRow({
  variant,
  currency,
  styles,
  colors,
  onPress,
  onDeactivate,
  isConfirmingDeactivate,
  onConfirmDeactivate,
  onCancelDeactivate,
}: {
  variant: ProductVariant;
  currency: string | null | undefined;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
  onPress: () => void;
  onDeactivate: () => void;
  isConfirmingDeactivate: boolean;
  onConfirmDeactivate: () => void;
  onCancelDeactivate: () => void;
}) {
  return (
    <View style={styles.variantRow}>
      <Pressable style={styles.variantRowBody} onPress={onPress}>
        <Text style={styles.variantRowName}>{variant.name}</Text>
        <Text style={styles.variantRowPrice}>
          {formatCurrency(variant.selling_price, currency)}
        </Text>
      </Pressable>
      {isConfirmingDeactivate ? (
        <View style={styles.inlineConfirmRow}>
          <Pressable onPress={onCancelDeactivate} style={styles.inlineConfirmCancel}>
            <Text style={styles.inlineConfirmCancelText}>Cancel</Text>
          </Pressable>
          <Pressable onPress={onConfirmDeactivate} style={styles.inlineConfirmConfirm}>
            <Text style={styles.inlineConfirmConfirmText}>Confirm</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={onDeactivate} style={styles.variantRowDelete}>
          <Ionicons name="close" size={18} color={colors.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}

function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { ...typography.displaySm, color: colors.textPrimary, flex: 1, textAlign: 'center' },
    overflowMenu: {
      alignSelf: 'flex-end',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      marginBottom: spacing.md,
      overflow: 'hidden',
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
    categoryPill: {
      alignSelf: 'flex-start',
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.full,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      marginBottom: spacing.lg,
    },
    categoryPillText: { ...typography.caption, color: colors.textSecondary },
    sectionLabel: { ...typography.titleSm, color: colors.textPrimary, marginBottom: spacing.md },
    emptyVariants: {
      alignItems: 'center',
      paddingVertical: spacing.xxl,
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.lg,
    },
    emptyVariantsText: { ...typography.bodySm, color: colors.textSecondary, marginBottom: spacing.lg },
    emptyVariantsButton: { minWidth: 180 },
    variantRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      marginBottom: spacing.sm,
      minHeight: 44,
    },
    variantRowBody: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    variantRowName: { ...typography.body, color: colors.textPrimary },
    variantRowPrice: { ...typography.titleSm, color: colors.textPrimary },
    variantRowDelete: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inlineConfirmRow: { flexDirection: 'row', paddingRight: spacing.sm, gap: spacing.xs },
    inlineConfirmCancel: {
      paddingHorizontal: spacing.md,
      minHeight: 44,
      justifyContent: 'center',
    },
    inlineConfirmCancelText: { ...typography.bodySm, color: colors.textSecondary },
    inlineConfirmConfirm: {
      paddingHorizontal: spacing.md,
      minHeight: 44,
      justifyContent: 'center',
      backgroundColor: colors.dangerMuted,
      borderRadius: radii.sm,
    },
    inlineConfirmConfirmText: { ...typography.bodySm, color: colors.danger, fontWeight: '600' },
    actionRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
    actionButtonSecondary: { flex: 1 },
    actionButtonPrimary: { flex: 1 },
    disabledHint: {
      ...typography.caption,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
  });
}
