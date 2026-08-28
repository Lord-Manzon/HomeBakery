import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useHideFloatingNav } from '../../../../src/hooks/useHideFloatingNav';
import { useThemeColors } from '../../../../src/theme/ThemeContext';
import { useOrder, useUpdateOrder } from '../../../../src/hooks/useOrders';
import { OrderForm, type OrderFormValues } from '../../../../src/components/OrderForm';
import { isOrderActive } from '../../../../src/services/orderLogic';
import type { OrderWithItems } from '../../../../src/types/order';
import { fromISODateString, fromTimeString } from '../../../../src/utils/dateFormat';
import { ErrorBanner } from '../../../../src/components/ErrorBanner';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import { spacing, typography } from '../../../../src/theme';

export default function EditOrderScreen() {
  useHideFloatingNav();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { data: order, isLoading, isError, refetch } = useOrder(id);
  const updateOrder = useUpdateOrder(id);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Edit order</Text>
        <View style={styles.backButton} />
      </View>

      {isError ? (
        <>
          <ErrorBanner message="Couldn't load this order." />
          <PrimaryButton title="Try again" onPress={() => refetch()} />
        </>
      ) : null}

      {isLoading || !order ? (
        <View style={styles.skeleton} />
      ) : !isOrderActive(order.status) ? (
        <>
          <ErrorBanner message="This order is no longer editable." />
          <PrimaryButton title="Back to order" onPress={() => router.replace(`/orders/${id}`)} />
        </>
      ) : (
        <OrderForm
          key={order.id}
          initialValues={orderToFormValues(order)}
          submitLabel="Save changes"
          isSubmitting={updateOrder.isPending}
          hasSubmitError={updateOrder.isError}
          onSubmit={(input) => {
            updateOrder.mutate(input, {
              onSuccess: () => {
                router.replace(`/orders/${id}`);
              },
            });
          }}
        />
      )}
    </View>
  );
}

/**
 * Hydrates the shared form's state from an already-saved order.
 *
 * `selling_price` on each cart item uses the item's own frozen
 * `unit_price` (what it was actually charged), not the variant's current
 * price -- the best available reference while the baker is editing. This
 * is display-only, though: `src/services/orders.ts`'s `updateOrder`
 * re-fetches each variant's CURRENT price at save time regardless (see
 * that file's comments), so if a price drifted since the order was
 * placed, saving the edit (even an unrelated field) picks up the new
 * price -- a known, already-documented tradeoff of "always trust the
 * freshest price," not something specific to this screen.
 */
function orderToFormValues(order: OrderWithItems): OrderFormValues {
  return {
    customerName: order.customer_name,
    customerContact: order.customer_contact ?? '',
    fulfillmentType: order.fulfillment_type,
    deliveryAddress: order.delivery_address ?? '',
    deliveryFee: String(order.delivery_fee ?? 0),
    scheduledDate: fromISODateString(order.scheduled_date),
    scheduledTime: order.scheduled_time ? fromTimeString(order.scheduled_time) : null,
    notes: order.notes ?? '',
    items: order.items.map((item) => ({
      id: item.id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      quantity: item.quantity,
      product_name: item.product_name,
      variant_name: item.variant_name,
      selling_price: item.unit_price,
    })),
  };
}

function makeStyles(colors: { background: string; textPrimary: string; surfaceMuted: string }) {
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
    skeleton: { flex: 1, borderRadius: 16, backgroundColor: colors.surfaceMuted },
  });
}
