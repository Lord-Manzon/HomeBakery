import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useHideFloatingNav } from '../../../src/hooks/useHideFloatingNav';
import { useThemeColors } from '../../../src/theme/ThemeContext';
import { useCreateOrder } from '../../../src/hooks/useOrders';
import { useProducts } from '../../../src/hooks/useProducts';
import { useBakerProfile } from '../../../src/hooks/useBakerProfile';
import { orderFormSchema } from '../../../src/utils/validation/orderSchemas';
import { formatOrderDate, formatOrderTime, toISODateString, toTimeString } from '../../../src/utils/dateFormat';
import { formatCurrency } from '../../../src/utils/currency';
import { FormField } from '../../../src/components/FormField';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { ErrorBanner } from '../../../src/components/ErrorBanner';
import { OrderItemSheet, type CartItem } from '../../../src/components/OrderItemSheet';
import { spacing, radii, typography } from '../../../src/theme';
import type { ColorToken } from '../../../src/theme/colors';
import type { FulfillmentType } from '../../../src/types/order';

type FormErrors = Partial<
  Record<
    'customer_name' | 'delivery_address' | 'delivery_fee' | 'scheduled_date' | 'items',
    string
  >
>;

export default function NewOrderScreen() {
  useHideFloatingNav();
  const router = useRouter();
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const createOrder = useCreateOrder();
  const { data: products } = useProducts();
  const { data: baker } = useBakerProfile();

  const [customerName, setCustomerName] = useState('');
  const [customerContact, setCustomerContact] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>('pickup');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('0');
  const [scheduledDate, setScheduledDate] = useState(new Date());
  const [scheduledTime, setScheduledTime] = useState<Date | null>(null);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<CartItem[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [itemSheetOpen, setItemSheetOpen] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);

  const canSave = customerName.trim().length > 0 && items.length > 0 && !createOrder.isPending;

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.selling_price, 0);
  const parsedDeliveryFee = Number(deliveryFee) || 0;
  const total = subtotal + (fulfillmentType === 'delivery' ? parsedDeliveryFee : 0);

  const handleDateChange = (event: DateTimePickerEvent, date?: Date) => {
    setShowDatePicker(false);
    if (event.type === 'set' && date) setScheduledDate(date);
  };

  const handleTimeChange = (event: DateTimePickerEvent, date?: Date) => {
    setShowTimePicker(false);
    if (event.type === 'set' && date) setScheduledTime(date);
  };

  const handleAddItem = (item: CartItem) => {
    setItems((prev) => {
      if (editingItemIndex !== null) {
        const next = [...prev];
        next[editingItemIndex] = item;
        return next;
      }
      return [...prev, item];
    });
    setItemSheetOpen(false);
    setEditingItemIndex(null);
    setErrors((prev) => ({ ...prev, items: undefined }));
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const parsed = orderFormSchema.safeParse({
      customer_name: customerName,
      customer_contact: customerContact,
      fulfillment_type: fulfillmentType,
      delivery_address: fulfillmentType === 'delivery' ? deliveryAddress : '',
      delivery_fee: fulfillmentType === 'delivery' ? deliveryFee : '0',
      scheduled_date: toISODateString(scheduledDate),
      scheduled_time: scheduledTime ? toTimeString(scheduledTime) : '',
      notes,
      items: items.map((i) => ({ product_id: i.product_id, variant_id: i.variant_id, quantity: i.quantity })),
    });

    if (!parsed.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormErrors;
        fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});

    createOrder.mutate(parsed.data, {
      onSuccess: (order) => {
        router.replace(`/orders/${order.id}`);
      },
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>New order</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {createOrder.isError ? <ErrorBanner message="Couldn't save this order. Please try again." /> : null}

        <FormField
          label="Customer name"
          placeholder="e.g. Maria Santos"
          value={customerName}
          onChangeText={setCustomerName}
          error={errors.customer_name}
        />
        <FormField
          label="Contact (optional)"
          placeholder="Phone or Messenger"
          value={customerContact}
          onChangeText={setCustomerContact}
        />

        <Text style={styles.label}>Fulfillment</Text>
        <View style={styles.segmentRow}>
          <SegmentButton
            label="Pickup"
            icon="bag-handle-outline"
            isSelected={fulfillmentType === 'pickup'}
            onPress={() => setFulfillmentType('pickup')}
            styles={styles}
            colors={colors}
          />
          <SegmentButton
            label="Delivery"
            icon="bicycle-outline"
            isSelected={fulfillmentType === 'delivery'}
            onPress={() => setFulfillmentType('delivery')}
            styles={styles}
            colors={colors}
          />
        </View>

        {fulfillmentType === 'delivery' ? (
          <>
            <FormField
              label="Delivery address"
              placeholder="Where to deliver"
              value={deliveryAddress}
              onChangeText={setDeliveryAddress}
              error={errors.delivery_address}
              multiline
            />
            <FormField
              label="Delivery fee"
              keyboardType="decimal-pad"
              value={deliveryFee}
              onChangeText={setDeliveryFee}
              error={errors.delivery_fee}
            />
          </>
        ) : null}

        <Text style={styles.label}>When</Text>
        <View style={styles.segmentRow}>
          <Pressable style={styles.dateField} onPress={() => setShowDatePicker(true)}>
            <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.dateFieldText}>{formatOrderDate(toISODateString(scheduledDate))}</Text>
          </Pressable>
          <Pressable style={styles.dateField} onPress={() => setShowTimePicker(true)}>
            <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.dateFieldText}>
              {scheduledTime ? formatOrderTime(toTimeString(scheduledTime)) : 'No time set'}
            </Text>
          </Pressable>
        </View>
        {errors.scheduled_date ? <Text style={styles.errorText}>{errors.scheduled_date}</Text> : null}
        {showDatePicker ? (
          <DateTimePicker
            value={scheduledDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={handleDateChange}
          />
        ) : null}
        {showTimePicker ? (
          <DateTimePicker
            value={scheduledTime ?? new Date()}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleTimeChange}
          />
        ) : null}

        <Text style={styles.label}>Items</Text>
        {items.length === 0 ? (
          <Text style={styles.itemsEmpty}>No items added yet.</Text>
        ) : (
          items.map((item, index) => (
            <Pressable
              key={`${item.variant_id}-${index}`}
              style={styles.itemRow}
              onPress={() => {
                setEditingItemIndex(index);
                setItemSheetOpen(true);
              }}
            >
              <View style={styles.itemRowText}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.quantity}× {item.product_name} ({item.variant_name})
                </Text>
                <Text style={styles.itemPrice}>
                  {formatCurrency(item.quantity * item.selling_price, baker?.currency)}
                </Text>
              </View>
              <Pressable
                onPress={() => handleRemoveItem(index)}
                hitSlop={8}
                style={styles.itemRemoveButton}
              >
                <Ionicons name="close" size={16} color={colors.textSecondary} />
              </Pressable>
            </Pressable>
          ))
        )}
        {errors.items ? <Text style={styles.errorText}>{errors.items}</Text> : null}
        <Pressable
          style={styles.addItemButton}
          onPress={() => {
            setEditingItemIndex(null);
            setItemSheetOpen(true);
          }}
        >
          <Ionicons name="add" size={16} color={colors.primary} />
          <Text style={styles.addItemButtonText}>Add item</Text>
        </Pressable>

        {items.length > 0 ? (
          <View style={styles.totalsBlock}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal</Text>
              <Text style={styles.totalsValue}>{formatCurrency(subtotal, baker?.currency)}</Text>
            </View>
            {fulfillmentType === 'delivery' && parsedDeliveryFee > 0 ? (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Delivery fee</Text>
                <Text style={styles.totalsValue}>{formatCurrency(parsedDeliveryFee, baker?.currency)}</Text>
              </View>
            ) : null}
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabelBold}>Total</Text>
              <Text style={styles.totalsValueBold}>{formatCurrency(total, baker?.currency)}</Text>
            </View>
          </View>
        ) : null}

        <FormField
          label="Notes (optional)"
          placeholder="Anything else to remember about this order"
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        <View style={styles.saveButton}>
          <PrimaryButton
            title={createOrder.isPending ? 'Saving…' : 'Save order'}
            onPress={handleSave}
            disabled={!canSave}
            isLoading={createOrder.isPending}
          />
        </View>
      </ScrollView>

      <OrderItemSheet
        visible={itemSheetOpen}
        onDismiss={() => {
          setItemSheetOpen(false);
          setEditingItemIndex(null);
        }}
        products={products ?? []}
        currency={baker?.currency}
        initialValue={editingItemIndex !== null ? items[editingItemIndex] : null}
        onSubmit={handleAddItem}
      />
    </View>
  );
}

function SegmentButton({
  label,
  icon,
  isSelected,
  onPress,
  styles,
  colors,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  isSelected: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.segmentButton, isSelected && styles.segmentButtonSelected]}
    >
      <Ionicons name={icon} size={16} color={isSelected ? colors.textInverse : colors.textSecondary} />
      <Text style={[styles.segmentButtonText, isSelected && styles.segmentButtonTextSelected]}>
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
    label: { ...typography.titleSm, color: colors.textPrimary, marginBottom: spacing.sm, marginTop: spacing.xs },
    segmentRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
    segmentButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      paddingVertical: spacing.sm + 2,
    },
    segmentButtonSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    segmentButtonText: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600' },
    segmentButtonTextSelected: { color: colors.textInverse },
    dateField: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 4,
    },
    dateFieldText: { ...typography.bodySm, color: colors.textPrimary },
    itemsEmpty: { ...typography.bodySm, color: colors.textSecondary, marginBottom: spacing.sm },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.xs,
    },
    itemRowText: { flex: 1 },
    itemName: { ...typography.bodySm, color: colors.textPrimary },
    itemPrice: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
    itemRemoveButton: { padding: spacing.xs },
    addItemButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: radii.md,
      paddingVertical: spacing.sm,
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    addItemButtonText: { ...typography.bodySm, color: colors.primary, fontWeight: '600' },
    totalsBlock: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.md,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    totalsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xxs },
    totalsLabel: { ...typography.bodySm, color: colors.textSecondary },
    totalsValue: { ...typography.bodySm, color: colors.textPrimary },
    totalsLabelBold: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600' },
    totalsValueBold: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
    errorText: { ...typography.bodySm, color: colors.danger, marginBottom: spacing.sm },
    saveButton: { marginTop: spacing.sm },
  });
}
