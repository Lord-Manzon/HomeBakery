import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useThemeColors } from '../theme/ThemeContext';
import { useProducts } from '../hooks/useProducts';
import { useBakerProfile } from '../hooks/useBakerProfile';
import { orderFormSchema, type OrderFormInput } from '../utils/validation/orderSchemas';
import { formatOrderDate, formatOrderTime, toISODateString, toTimeString } from '../utils/dateFormat';
import { formatCurrency } from '../utils/currency';
import { FormField } from './FormField';
import { PrimaryButton } from './PrimaryButton';
import { ErrorBanner } from './ErrorBanner';
import { OrderItemSheet, type CartItem } from './OrderItemSheet';
import { spacing, radii, typography } from '../theme';
import type { ColorToken } from '../theme/colors';
import type { FulfillmentType } from '../types/order';

export type OrderFormValues = {
  customerName: string;
  customerContact: string;
  fulfillmentType: FulfillmentType;
  deliveryAddress: string;
  deliveryFee: string;
  scheduledDate: Date;
  scheduledTime: Date | null;
  notes: string;
  items: CartItem[];
};

export function defaultOrderFormValues(): OrderFormValues {
  return {
    customerName: '',
    customerContact: '',
    fulfillmentType: 'pickup',
    deliveryAddress: '',
    deliveryFee: '0',
    scheduledDate: new Date(),
    scheduledTime: null,
    notes: '',
    items: [],
  };
}

type FormErrors = Partial<
  Record<'customer_name' | 'delivery_address' | 'delivery_fee' | 'scheduled_date' | 'items', string>
>;

type OrderFormProps = {
  /** Blank for New Order (defaultOrderFormValues()), or hydrated from an
   * existing order for Edit Order. Read once at mount to seed local state
   * -- the parent screen is responsible for not rendering this component
   * until real data is ready (see orders/[id]/edit.tsx's loading state). */
  initialValues: OrderFormValues;
  onSubmit: (input: OrderFormInput) => void;
  isSubmitting: boolean;
  submitLabel: string;
  hasSubmitError?: boolean;
};

/**
 * The actual order form -- customer info, fulfillment, schedule, item
 * cart, notes. Shared between orders/new.tsx and orders/[id]/edit.tsx so
 * the two can never quietly drift out of sync with each other; each of
 * those files only owns its header and its create-vs-update mutation.
 */
export function OrderForm({
  initialValues,
  onSubmit,
  isSubmitting,
  submitLabel,
  hasSubmitError,
}: OrderFormProps) {
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { data: products } = useProducts();
  const { data: baker } = useBakerProfile();

  const [customerName, setCustomerName] = useState(initialValues.customerName);
  const [customerContact, setCustomerContact] = useState(initialValues.customerContact);
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>(initialValues.fulfillmentType);
  const [deliveryAddress, setDeliveryAddress] = useState(initialValues.deliveryAddress);
  const [deliveryFee, setDeliveryFee] = useState(initialValues.deliveryFee);
  const [scheduledDate, setScheduledDate] = useState(initialValues.scheduledDate);
  const [scheduledTime, setScheduledTime] = useState<Date | null>(initialValues.scheduledTime);
  const [notes, setNotes] = useState(initialValues.notes);
  const [items, setItems] = useState<CartItem[]>(initialValues.items);
  const [errors, setErrors] = useState<FormErrors>({});

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [itemSheetOpen, setItemSheetOpen] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);

  const canSave = customerName.trim().length > 0 && items.length > 0 && !isSubmitting;

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
      items: items.map((i) => ({
        id: i.id,
        product_id: i.product_id,
        variant_id: i.variant_id,
        quantity: i.quantity,
      })),
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
    onSubmit(parsed.data);
  };

  return (
    <>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {hasSubmitError ? <ErrorBanner message="Couldn't save this order. Please try again." /> : null}

          {/* Customer -- both fields already self-label ("Customer name",
              "Contact (optional)"), so no extra section header here; one
              would just repeat what's already on screen, same issue as
              the Orders list card's now-removed "Order" label. */}
          <View style={styles.sectionCard}>
            <FormField
              compact
              label="Customer name"
              placeholder="e.g. Maria Santos"
              value={customerName}
              onChangeText={setCustomerName}
              error={errors.customer_name}
            />
            <FormField
              compact
              label="Contact (optional)"
              placeholder="Phone or Messenger"
              value={customerContact}
              onChangeText={setCustomerContact}
            />
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Fulfillment</Text>
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
                  compact
                  label="Delivery address"
                  placeholder="Where to deliver"
                  value={deliveryAddress}
                  onChangeText={setDeliveryAddress}
                  error={errors.delivery_address}
                  multiline
                />
                <FormField
                  compact
                  label="Delivery fee"
                  keyboardType="decimal-pad"
                  value={deliveryFee}
                  onChangeText={setDeliveryFee}
                  error={errors.delivery_fee}
                />
              </>
            ) : null}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>When</Text>
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
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Items</Text>
            {items.length === 0 ? (
              <Text style={styles.itemsEmpty}>No items added yet.</Text>
            ) : (
              <View style={styles.itemsList}>
                {items.map((item, index) => (
                  <Pressable
                    key={`${item.variant_id}-${index}`}
                    style={[styles.itemRow, index === items.length - 1 && styles.itemRowLast]}
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
                ))}
              </View>
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
          </View>

          <View style={styles.sectionCard}>
            <FormField
              compact
              label="Notes (optional)"
              placeholder="Anything else to remember about this order"
              value={notes}
              onChangeText={setNotes}
              multiline
            />
          </View>

          <View style={styles.saveButton}>
            <PrimaryButton
              title={isSubmitting ? 'Saving…' : submitLabel}
              onPress={handleSave}
              disabled={!canSave}
              isLoading={isSubmitting}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

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
    </>
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
    flex: { flex: 1 },
    scrollView: { flex: 1 },
    scrollContent: { paddingBottom: spacing.xxl },
    // Fields used to sit one after another down the screen, each its own
    // bordered box with a label above it -- reads as "many small forms
    // to fill" rather than one order. Grouping related fields inside a
    // shared card (Gestalt's proximity/common-region principle) reads as
    // fewer, bigger decisions instead of many small identical ones, even
    // though the same fields are still there. See src/components/
    // FormField.tsx's new `compact` prop, used only inside these cards.
    sectionCard: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    // Only used where the section holds something that doesn't already
    // self-label (the fulfillment segment control, the date/time row,
    // the item list) -- Customer and Notes skip this, since their
    // FormFields already say what they are.
    sectionTitle: { ...typography.titleSm, color: colors.textPrimary, marginBottom: spacing.sm },
    segmentRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
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
      paddingVertical: spacing.md,
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
      paddingVertical: spacing.md,
    },
    dateFieldText: { ...typography.bodySm, color: colors.textPrimary },
    itemsEmpty: { ...typography.bodySm, color: colors.textSecondary, marginBottom: spacing.sm },
    // No border/radius/margin of its own anymore -- the card around it
    // already establishes the boundary, so a bordered box per row was a
    // box inside a box. A hairline bottom divider between rows (skipped
    // on the last one) replaces it.
    itemsList: { marginBottom: spacing.xs },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingVertical: spacing.sm,
    },
    itemRowLast: { borderBottomWidth: 0 },
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
      marginTop: spacing.xs,
    },
    addItemButtonText: { ...typography.bodySm, color: colors.primary, fontWeight: '600' },
    totalsBlock: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.md,
      padding: spacing.md,
      marginTop: spacing.md,
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