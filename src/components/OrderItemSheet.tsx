import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
  const [quantity, setQuantity] = useState('1');
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
      setQuantity(String(initialValue.quantity));
    } else {
      setSelectedProduct(null);
      setSelectedVariantId('');
      setQuantity('1');
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

  const handleSave = () => {
    if (!selectedProduct) {
      setError('Pick a product.');
      return;
    }
    const variant = selectedProduct.variants.find((v) => v.id === selectedVariantId);
    if (!variant) {
      setError('Pick a size.');
      return;
    }
    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setError('Enter a quantity above 0.');
      return;
    }
    setError(null);
    onSubmit({
      id: initialValue?.id,
      product_id: selectedProduct.id,
      variant_id: variant.id,
      quantity: parsedQuantity,
      product_name: selectedProduct.name,
      variant_name: variant.name,
      selling_price: variant.selling_price,
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
              filteredProducts.map((product) => (
                <Pressable
                  key={product.id}
                  onPress={() => handleSelectProduct(product)}
                  style={[
                    styles.pickerRow,
                    selectedProduct?.id === product.id && styles.pickerRowSelected,
                  ]}
                >
                  <Text style={styles.pickerRowText}>{product.name}</Text>
                  <Text style={styles.pickerRowMeta}>
                    {product.variants.length} size{product.variants.length === 1 ? '' : 's'}
                  </Text>
                </Pressable>
              ))
            )}
          </View>
        </View>
      ) : (
        <Text style={styles.lockedProductLabel}>{selectedProduct?.name}</Text>
      )}

      {selectedProduct && selectedProduct.variants.length > 1 ? (
        <View style={styles.pickerBlock}>
          <Text style={styles.label}>Size</Text>
          <View style={styles.pickerList}>
            {selectedProduct.variants.map((variant) => (
              <Pressable
                key={variant.id}
                onPress={() => setSelectedVariantId(variant.id)}
                style={[
                  styles.pickerRow,
                  selectedVariantId === variant.id && styles.pickerRowSelected,
                ]}
              >
                <Text style={styles.pickerRowText}>{variant.name}</Text>
                <Text style={styles.pickerRowMeta}>{formatCurrency(variant.selling_price, currency)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <FormField
        label="Quantity"
        keyboardType="number-pad"
        value={quantity}
        onChangeText={setQuantity}
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <PrimaryButton title={isEditing ? 'Save changes' : 'Add to order'} onPress={handleSave} />
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
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
    },
    pickerRowSelected: { backgroundColor: colors.surfaceMuted },
    pickerRowText: { ...typography.body, color: colors.textPrimary },
    pickerRowMeta: { ...typography.bodySm, color: colors.textSecondary },
    pickerEmpty: { ...typography.bodySm, color: colors.textSecondary, padding: spacing.md },
    lockedProductLabel: {
      ...typography.body,
      color: colors.textPrimary,
      fontWeight: '600',
      marginBottom: spacing.md,
    },
    errorText: { ...typography.bodySm, color: colors.danger, marginTop: -spacing.sm, marginBottom: spacing.sm },
  });
}
