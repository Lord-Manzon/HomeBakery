import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../theme/ThemeContext';
import { radii, spacing, typography } from '../theme';
import type { ColorToken } from '../theme/colors';
import { BottomSheet } from './BottomSheet';
import { FormField } from './FormField';
import { PrimaryButton } from './PrimaryButton';
import { formatCurrency } from '../utils/currency';
import type { ProductWithVariants } from '../types/product';

export type CartItem = {
  /** Present for an item that already exists on the order being edited;
   * absent for one newly added in this session. See orderSchemas.ts's
   * orderItemFormSchema comment for why this matters on save. */
  id?: string;
  product_id: string;
  variant_id: string;
  quantity: number;
  product_name: string;
  variant_name: string;
  selling_price: number;
};

type OrderItemSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  products: ProductWithVariants[];
  currency: string | null | undefined;
  initialValue?: CartItem | null;
  onSubmit: (item: CartItem) => void;
};

/**
 * Add/edit one order line item: pick a product, then one of its variants,
 * then a quantity. Two-step picker, same pattern as
 * RecipeIngredientSheet's ingredient picker -- except an order line needs
 * an extra step (variant) that a recipe ingredient doesn't.
 *
 * Only `selling_price` is shown here for reference while picking -- it is
 * NOT what gets saved as `unit_price`. src/services/orders.ts re-fetches
 * each variant's current price at save time (see that file's comments),
 * so this sheet only ever deals with product_id/variant_id/quantity.
 */
export function OrderItemSheet({
  visible,
  onDismiss,
  products,
  currency,
  initialValue,
  onSubmit,
}: OrderItemSheetProps) {
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductWithVariants | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!initialValue;

  useEffect(() => {
    if (!visible) return;
    setSearch('');
    setError('');
    if (initialValue) {
      const product = products.find((p) => p.id === initialValue.product_id) ?? null;
      setSelectedProduct(product);
      setSelectedVariantId(initialValue.variant_id);
      setQuantity(initialValue.quantity);
    } else {
      setSelectedProduct(null);
      setSelectedVariantId('');
      setQuantity(1);
    }
  }, [visible, initialValue, products]);

  // Only products with at least one (active) variant are orderable -- a
  // bare product with nothing priced yet has nothing to add to a cart.
  const orderableProducts = products.filter((p) => p.variants.length > 0);
  const filteredProducts = search.trim()
    ? orderableProducts.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    : orderableProducts;

  const handleSelectProduct = (product: ProductWithVariants) => {
    setSelectedProduct(product);
    // A product with only one variant doesn't make the baker pick it
    // separately -- auto-select it, same "don't ask what has only one
    // answer" spirit as the variant sheet's is_default logic.
    setSelectedVariantId(product.variants.length === 1 ? product.variants[0].id : '');
  };

  // The variant currently picked, if any -- drives the line-total summary
  // bar so it can render as soon as a valid product+size combo exists,
  // not only after Save is tapped.
  const selectedVariant = selectedProduct?.variants.find((v) => v.id === selectedVariantId) ?? null;
  const lineTotal = selectedVariant ? selectedVariant.selling_price * quantity : 0;

  // Quantity is stepper-only now (no free-text entry), so it can never be
  // invalid or empty -- clamped at a minimum of 1. Removing an item
  // entirely is a separate action (the order form's own remove button),
  // not something this sheet needs to handle via a 0 quantity.
  const adjustQuantity = (delta: number) => {
    setQuantity((prev) => Math.max(1, prev + delta));
  };

  const handleSave = () => {
    if (!selectedProduct) {
      setError('Pick a product.');
      return;
    }
    if (!selectedVariant) {
      setError('Pick a size.');
      return;
    }
    setError(null);
    onSubmit({
      id: initialValue?.id,
      product_id: selectedProduct.id,
      variant_id: selectedVariant.id,
      quantity,
      product_name: selectedProduct.name,
      variant_name: selectedVariant.name,
      selling_price: selectedVariant.selling_price,
    });
  };

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss}>
      <Text style={styles.title}>{isEditing ? 'Edit item' : 'Add item'}</Text>

      {!isEditing ? (
        <View style={styles.pickerBlock}>
          <FormField
            label="Product"
            placeholder="Search products"
            value={search}
            onChangeText={setSearch}
          />
          <View style={styles.pickerList}>
            {filteredProducts.length === 0 ? (
              <Text style={styles.pickerEmpty}>
                {orderableProducts.length === 0
                  ? 'No products with a priced size yet — add a variant first.'
                  : 'No products match.'}
              </Text>
            ) : (
              filteredProducts.map((product) => {
                const isSelected = selectedProduct?.id === product.id;
                return (
                  <Pressable
                    key={product.id}
                    onPress={() => handleSelectProduct(product)}
                    style={[styles.pickerRow, isSelected && styles.pickerRowSelected]}
                  >
                    {product.image_url ? (
                      <Image source={{ uri: product.image_url }} style={styles.pickerRowImage} />
                    ) : (
                      <View style={styles.pickerRowImagePlaceholder}>
                        <Ionicons name="restaurant-outline" size={20} color={colors.primary} />
                      </View>
                    )}
                    <Text style={styles.pickerRowText} numberOfLines={1}>
                      {product.name}
                    </Text>
                    {isSelected ? (
                      <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                    ) : (
                      <Text style={styles.pickerRowMeta}>
                        {product.variants.length} size{product.variants.length === 1 ? '' : 's'}
                      </Text>
                    )}
                  </Pressable>
                );
              })
            )}
          </View>
        </View>
      ) : (
        <Text style={styles.lockedProductLabel}>{selectedProduct?.name}</Text>
      )}

      {selectedProduct && selectedProduct.variants.length > 1 ? (
        <View style={styles.pickerBlock}>
          <Text style={styles.label}>Size</Text>
          <View style={styles.sizeChipRow}>
            {selectedProduct.variants.map((variant) => {
              const isSelected = selectedVariantId === variant.id;
              return (
                <Pressable
                  key={variant.id}
                  onPress={() => setSelectedVariantId(variant.id)}
                  style={[styles.sizeChip, isSelected && styles.sizeChipSelected]}
                >
                  <Text style={[styles.sizeChipName, isSelected && styles.sizeChipNameSelected]}>
                    {variant.name}
                  </Text>
                  <Text style={[styles.sizeChipPrice, isSelected && styles.sizeChipPriceSelected]}>
                    {formatCurrency(variant.selling_price, currency)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={styles.quantityRow}>
        <Text style={styles.label}>Quantity</Text>
        <View style={styles.stepper}>
          <Pressable onPress={() => adjustQuantity(-1)} hitSlop={8} style={styles.stepperButton}>
            <Ionicons name="remove" size={16} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.stepperValue}>{quantity}</Text>
          <Pressable
            onPress={() => adjustQuantity(1)}
            hitSlop={8}
            style={[styles.stepperButton, styles.stepperButtonPrimary]}
          >
            <Ionicons name="add" size={16} color={colors.textInverse} />
          </Pressable>
        </View>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {selectedProduct && selectedVariant ? (
        <View style={styles.summaryBar}>
          <View style={styles.summaryTextBlock}>
            <Text style={styles.summaryLabel}>Line total</Text>
            <Text style={styles.summaryMeta} numberOfLines={1}>
              {selectedProduct.name} · {selectedVariant.name} · ×{quantity}
            </Text>
          </View>
          <View style={styles.summaryAction}>
            <Text style={styles.summaryPrice}>{formatCurrency(lineTotal, currency)}</Text>
            <Pressable onPress={handleSave} hitSlop={8} style={styles.summaryButton}>
              <Text style={styles.summaryButtonText}>{isEditing ? 'Save' : 'Add'}</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.textInverse} />
            </Pressable>
          </View>
        </View>
      ) : (
        <PrimaryButton title={isEditing ? 'Save changes' : 'Add to order'} onPress={handleSave} disabled />
      )}
    </BottomSheet>
  );
}

function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    title: { ...typography.titleLg, color: colors.textPrimary, marginBottom: spacing.lg },
    label: { ...typography.titleSm, color: colors.textPrimary, marginBottom: spacing.xs },
    pickerBlock: { marginBottom: spacing.md },
    pickerList: { marginTop: spacing.xs },
    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.sm,
    },
    pickerRowSelected: { borderColor: colors.primary, borderWidth: 1.5, backgroundColor: colors.primaryMuted },
    pickerRowImage: { width: 44, height: 44, borderRadius: radii.md },
    pickerRowImagePlaceholder: {
      width: 44,
      height: 44,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pickerRowText: { ...typography.body, color: colors.textPrimary, flex: 1 },
    pickerRowMeta: { ...typography.bodySm, color: colors.textSecondary },
    pickerEmpty: { ...typography.bodySm, color: colors.textSecondary, padding: spacing.md },
    lockedProductLabel: {
      ...typography.body,
      color: colors.textPrimary,
      fontWeight: '600',
      marginBottom: spacing.md,
    },
    sizeChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
    sizeChip: {
      flexGrow: 1,
      flexBasis: '28%',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    sizeChipSelected: { borderColor: colors.primary, borderWidth: 1.5, backgroundColor: colors.primaryMuted },
    sizeChipName: { ...typography.bodySm, color: colors.textPrimary },
    sizeChipNameSelected: { fontWeight: '600' },
    sizeChipPrice: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
    sizeChipPriceSelected: { color: colors.primary, fontWeight: '600' },
    quantityRow: { marginBottom: spacing.md },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.lg,
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
    },
    stepperButton: {
      width: 28,
      height: 28,
      borderRadius: radii.sm,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperButtonPrimary: { backgroundColor: colors.primary },
    stepperValue: { ...typography.titleSm, color: colors.textPrimary, minWidth: 18, textAlign: 'center' },
    // Tonal accent fill (primaryMuted), same token used elsewhere for a
    // lighter "tinted" surface -- never a dark/black block.
    summaryBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.primaryMuted,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
    },
    summaryTextBlock: { flex: 1, marginRight: spacing.sm },
    summaryLabel: { ...typography.caption, color: colors.textSecondary },
    summaryMeta: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600', marginTop: 2 },
    summaryAction: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    summaryPrice: { ...typography.titleSm, color: colors.textPrimary },
    summaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xxs,
      backgroundColor: colors.primary,
      borderRadius: radii.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    summaryButtonText: { ...typography.bodySm, color: colors.textInverse, fontWeight: '600' },
    errorText: { ...typography.bodySm, color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm },
  });
}
