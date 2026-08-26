import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useThemeColors } from '../../../../src/theme/ThemeContext';
import {
  useOrder,
  useMarkOrderDelivered,
  useMarkOrderPaid,
  useCancelOrder,
  useDeleteOrder,
} from '../../../../src/hooks/useOrders';
import { useBakerProfile } from '../../../../src/hooks/useBakerProfile';
import { isOrderActive, canCancelOrder } from '../../../../src/services/orderLogic';
import { formatOrderDate, formatOrderTime, todayDateString } from '../../../../src/utils/dateFormat';
import { formatCurrency } from '../../../../src/utils/currency';
import { Screen } from '../../../../src/components/Screen';
import { ErrorBanner } from '../../../../src/components/ErrorBanner';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import { PaymentMethodSheet } from '../../../../src/components/PaymentMethodSheet';
import { spacing, radii, typography } from '../../../../src/theme';
import type { ColorToken } from '../../../../src/theme/colors';
import type { OrderStatus } from '../../../../src/types/order';

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pending',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function statusColor(status: OrderStatus, colors: Record<ColorToken, string>): string {
  switch (status) {
    case 'pending':
      return colors.statusPending;
    case 'delivered':
      return colors.statusDelivered;
    case 'completed':
      return colors.statusCompleted;
    case 'cancelled':
      return colors.statusCancelled;
  }
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { data: order, isLoading, isError, refetch } = useOrder(id);
  const { data: baker } = useBakerProfile();
  const markDelivered = useMarkOrderDelivered();
  const markPaid = useMarkOrderPaid();
  const cancelOrder = useCancelOrder();
  const deleteOrder = useDeleteOrder();

  const [pendingAction, setPendingAction] = useState<'cancel' | 'delete' | null>(null);
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);

  if (isError) {
    return (
      <Screen style={styles.container}>
        <ErrorBanner message="Couldn't load this order." />
        <PrimaryButton title="Try again" onPress={() => refetch()} />
      </Screen>
    );
  }

  if (isLoading || !order) {
    return (
      <Screen style={styles.container}>
        <View style={[styles.card, styles.skeleton]} />
        <View style={[styles.card, styles.skeleton]} />
      </Screen>
    );
  }

  const isOverdue = isOrderActive(order.status) && order.scheduled_date < todayDateString();
  const badgeLabel = isOverdue ? 'Overdue' : STATUS_LABEL[order.status];
  const badgeColor = isOverdue ? colors.danger : statusColor(order.status, colors);

  const time = formatOrderTime(order.scheduled_time);
  const dateLabel = formatOrderDate(order.scheduled_date);
  const whenLabel = time ? `${dateLabel} · ${time}` : dateLabel;

  // Per docs/DECISIONS.md's 2026-08-22 entry: the only active status
  // that hasn't been delivered yet is 'pending' -- once delivered, status
  // moves past this and the button has nothing left to do.
  const showMarkDelivered = order.status === 'pending';
  const showMarkPaid = order.payment_status === 'unpaid' && isOrderActive(order.status);
  const canCancel = canCancelOrder(order.status);

  return (
    <Screen style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {order.customer_name}
        </Text>
        <View style={styles.headerIcons}>
          {isOrderActive(order.status) ? (
            <Pressable
              onPress={() => router.push(`/orders/${id}/edit`)}
              style={styles.iconButton}
              accessibilityLabel="Edit order"
            >
              <Ionicons name="pencil-outline" size={20} color={colors.textSecondary} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => setPendingAction(pendingAction === 'delete' ? null : 'delete')}
            style={styles.iconButton}
            accessibilityLabel="Delete order"
          >
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
          </Pressable>
        </View>
      </View>

      <View style={[styles.badge, { backgroundColor: `${badgeColor}1F` }]}>
        <Text style={[styles.badgeText, { color: badgeColor }]}>{badgeLabel}</Text>
      </View>

      {pendingAction === 'delete' ? (
        <View style={styles.inlineConfirmRow}>
          <Text style={styles.inlineConfirmText}>
            Delete this order? This can't be undone. If it just needs to not go ahead, Cancel
            keeps it in your history instead.
          </Text>
          <View style={styles.inlineConfirmActions}>
            <Pressable onPress={() => setPendingAction(null)} style={styles.inlineConfirmCancel}>
              <Text style={styles.inlineConfirmCancelText}>Keep it</Text>
            </Pressable>
            <Pressable
              onPress={() => deleteOrder.mutate(id, { onSuccess: () => router.back() })}
              style={styles.inlineConfirmDelete}
              disabled={deleteOrder.isPending}
            >
              <Text style={styles.inlineConfirmDeleteText}>
                {deleteOrder.isPending ? 'Deleting…' : 'Confirm delete'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {pendingAction === 'cancel' ? (
        <View style={styles.inlineConfirmRow}>
          <Text style={styles.inlineConfirmText}>
            Cancel this order? It stays in your order history as Cancelled.
          </Text>
          <View style={styles.inlineConfirmActions}>
            <Pressable onPress={() => setPendingAction(null)} style={styles.inlineConfirmCancel}>
              <Text style={styles.inlineConfirmCancelText}>Never mind</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                cancelOrder.mutate(
                  { id: order.id, status: order.status },
                  { onSuccess: () => setPendingAction(null) }
                )
              }
              style={styles.inlineConfirmDelete}
              disabled={cancelOrder.isPending}
            >
              <Text style={styles.inlineConfirmDeleteText}>
                {cancelOrder.isPending ? 'Cancelling…' : 'Confirm cancel'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.xxxl + 96 }}
      >
        {order.customer_contact ? <Text style={styles.contactText}>{order.customer_contact}</Text> : null}

        <Text style={styles.sectionHeader}>Items</Text>
        <View style={styles.card}>
          {order.items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <Text style={styles.itemText}>
                {item.quantity}× {item.product_name} ({item.variant_name})
              </Text>
              <Text style={styles.itemPrice}>{formatCurrency(item.line_total, baker?.currency)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionHeader}>Fulfillment</Text>
        <View style={styles.card}>
          <View style={styles.metaRow}>
            <Ionicons
              name={order.fulfillment_type === 'delivery' ? 'bicycle-outline' : 'bag-handle-outline'}
              size={16}
              color={colors.textSecondary}
            />
            <Text style={styles.metaText}>
              {order.fulfillment_type === 'delivery' ? 'Delivery' : 'Pickup'}
            </Text>
          </View>
          {order.fulfillment_type === 'delivery' && order.delivery_address ? (
            <Text style={styles.metaSubtext}>{order.delivery_address}</Text>
          ) : null}
          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.metaText}>{whenLabel}</Text>
          </View>
        </View>

        {order.notes ? (
          <>
            <Text style={styles.sectionHeader}>Notes</Text>
            <View style={styles.card}>
              <Text style={styles.notesText}>{order.notes}</Text>
            </View>
          </>
        ) : null}

        <Text style={styles.sectionHeader}>Payment</Text>
        <View style={styles.card}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>{formatCurrency(order.subtotal, baker?.currency)}</Text>
          </View>
          {order.delivery_fee > 0 ? (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Delivery fee</Text>
              <Text style={styles.totalsValue}>{formatCurrency(order.delivery_fee, baker?.currency)}</Text>
            </View>
          ) : null}
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabelBold}>Total</Text>
            <Text style={styles.totalsValueBold}>{formatCurrency(order.total, baker?.currency)}</Text>
          </View>

          <Pressable
            onPress={() => {
              if (order.payment_status === 'paid') setPaymentSheetOpen(true);
            }}
            style={[
              styles.paymentBadge,
              { backgroundColor: order.payment_status === 'paid' ? colors.successMuted : colors.warningMuted },
            ]}
          >
            <Text
              style={[
                styles.paymentBadgeText,
                { color: order.payment_status === 'paid' ? colors.success : colors.warning },
              ]}
            >
              {order.payment_status === 'paid' ? `Paid · ${order.payment_method ?? 'Cash'}` : 'Unpaid'}
            </Text>
            {order.payment_status === 'paid' ? (
              <Ionicons name="pencil-outline" size={12} color={colors.success} />
            ) : null}
          </Pressable>
        </View>

        {showMarkDelivered || showMarkPaid ? (
          <View style={styles.actionsBlock}>
            {showMarkDelivered ? (
              <PrimaryButton
                title={order.fulfillment_type === 'delivery' ? 'Mark Delivered' : 'Mark Picked Up'}
                onPress={() =>
                  markDelivered.mutate({
                    id: order.id,
                    status: order.status,
                    payment_status: order.payment_status,
                  })
                }
                isLoading={markDelivered.isPending}
              />
            ) : null}
            {showMarkPaid ? (
              <View style={showMarkDelivered ? styles.actionSpacing : undefined}>
                <PrimaryButton
                  title="Mark Paid"
                  variant={showMarkDelivered ? 'secondary' : 'primary'}
                  onPress={() =>
                    markPaid.mutate({
                      order: { id: order.id, status: order.status },
                      paymentMethod: 'Cash',
                    })
                  }
                  isLoading={markPaid.isPending}
                />
              </View>
            ) : null}
          </View>
        ) : null}

        {canCancel ? (
          <Pressable onPress={() => setPendingAction('cancel')} style={styles.cancelLink}>
            <Text style={styles.cancelLinkText}>Cancel order</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <PaymentMethodSheet
        visible={paymentSheetOpen}
        onDismiss={() => setPaymentSheetOpen(false)}
        currentMethod={order.payment_method}
        isSaving={markPaid.isPending}
        onSubmit={(method) => {
          markPaid.mutate(
            { order: { id: order.id, status: order.status }, paymentMethod: method },
            { onSuccess: () => setPaymentSheetOpen(false) }
          );
        }}
      />
    </Screen>
  );
}

function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    container: { flex: 1, paddingHorizontal: spacing.xl },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    headerIcons: { flexDirection: 'row' },
    title: { ...typography.titleLg, color: colors.textPrimary, flex: 1, textAlign: 'center' },
    badge: {
      alignSelf: 'flex-start',
      borderRadius: radii.full,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xxs,
      marginBottom: spacing.md,
    },
    badgeText: { ...typography.bodySm, fontWeight: '600' },
    contactText: { ...typography.bodySm, color: colors.textSecondary, marginBottom: spacing.lg },
    sectionHeader: { ...typography.titleSm, color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.sm },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.md,
    },
    skeleton: { height: 90, backgroundColor: colors.surfaceMuted, borderWidth: 0, marginBottom: spacing.md },
    itemRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.xs,
    },
    itemText: { ...typography.bodySm, color: colors.textPrimary, flex: 1, marginRight: spacing.sm },
    itemPrice: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600' },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
    metaText: { ...typography.bodySm, color: colors.textPrimary },
    metaSubtext: {
      ...typography.bodySm,
      color: colors.textSecondary,
      marginLeft: 24,
      marginBottom: spacing.xs,
    },
    notesText: { ...typography.bodySm, color: colors.textPrimary },
    totalsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xxs },
    totalsLabel: { ...typography.bodySm, color: colors.textSecondary },
    totalsValue: { ...typography.bodySm, color: colors.textPrimary },
    totalsLabelBold: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600' },
    totalsValueBold: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
    paymentBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xxs,
      alignSelf: 'flex-start',
      borderRadius: radii.full,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      marginTop: spacing.sm,
    },
    paymentBadgeText: { ...typography.bodySm, fontWeight: '600' },
    actionsBlock: { marginTop: spacing.lg },
    actionSpacing: { marginTop: spacing.sm },
    cancelLink: { alignItems: 'center', paddingVertical: spacing.md },
    cancelLinkText: { ...typography.bodySm, color: colors.textSecondary, textDecorationLine: 'underline' },
    inlineConfirmRow: {
      backgroundColor: colors.dangerMuted,
      borderRadius: radii.md,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    inlineConfirmText: { ...typography.bodySm, color: colors.danger, marginBottom: spacing.sm },
    inlineConfirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
    inlineConfirmCancel: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
    inlineConfirmCancelText: { ...typography.bodySm, color: colors.textSecondary, fontWeight: '600' },
    inlineConfirmDelete: {
      backgroundColor: colors.danger,
      borderRadius: radii.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    inlineConfirmDeleteText: { ...typography.bodySm, color: colors.textInverse, fontWeight: '600' },
  });
}
