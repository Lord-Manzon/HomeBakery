import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

  // Today / Tomorrow / the day after, as one-tap pills above the date/time
  // fields -- covers the two dates a baker checks constantly without
  // opening the native date picker just to pick "today." Computed once on
  // mount, not per-render, since "today" doesn't change within one form
  // session.
  const quickDates = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(today);
    dayAfter.setDate(dayAfter.getDate() + 2);
    return [
      { date: today, label: 'Today' },
      { date: tomorrow, label: 'Tomorrow' },
      { date: dayAfter, label: dayAfter.toLocaleDateString('en-US', { weekday: 'short' }) },
    ];
  }, []);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [itemSheetOpen, setItemSheetOpen] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  // Which item row is currently showing its "Remove this item?" inline
  // confirm, if any -- long-press triggers this instead of deleting
  // immediately, closing the gap where the old X button had no
  // confirmation step at all (see CODING_STANDARDS.md).
  const [confirmRemoveIndex, setConfirmRemoveIndex] = useState<number | null>(null);
  // Real rendered height of the sticky footer below, captured via
  // onLayout -- drives the ScrollView's bottom padding directly instead
  // of a guessed constant, so the reserved space always matches the
  // footer exactly regardless of its content or the device's safe-area
  // inset (both already baked into this measured height).
  const [footerHeight, setFooterHeight] = useState(0);

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

  // Quick +/- directly on an already-added item, without reopening the
  // full Add/Edit item sheet just to bump a quantity. Clamped at 1, same
  // floor as the sheet's own stepper (see OrderItemSheet.tsx) -- going to
  // 0 stays the row's explicit × button's job, not something a stray
  // extra tap on "-" should trigger silently.
  const handleAdjustItemQuantity = (index: number, delta: number) => {
    setItems((prev) => {
      const next = [...prev];
      const current = next[index];
      next[index] = { ...current, quantity: Math.max(1, current.quantity + delta) };
      return next;
    });
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

  const insets = useSafeAreaInsets();

  return (
    <>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.scrollView}
          // Screen.tsx deliberately skips bottom safe-area padding, relying
          // on the floating tab nav to reserve that space -- but this
          // screen hides that nav (useHideFloatingNav), so nothing else
          // accounts for the device's on-screen nav bar. Adding insets.bottom
          // here specifically, rather than in Screen.tsx globally, since
          // this is the one screen type that actually needs it.
          contentContainerStyle={[styles.scrollContent, { paddingBottom: spacing.sm + footerHeight }]}
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
            <View style={styles.quickDateRow}>
              {quickDates.map((qd) => {
                const isSelected = toISODateString(scheduledDate) === toISODateString(qd.date);
                return (
                  <Pressable
                    key={qd.label}
                    onPress={() => setScheduledDate(qd.date)}
                    style={[styles.quickDateChip, isSelected && styles.quickDateChipSelected]}
                  >
                    <Text style={[styles.quickDateChipText, isSelected && styles.quickDateChipTextSelected]}>
                      {qd.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
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
              <>
                <Text style={styles.itemsHint}>Tap to edit · hold to remove</Text>
                <View style={styles.itemsList}>
                  {items.map((item, index) => {
                    const isConfirmingRemove = confirmRemoveIndex === index;
                    return (
                      <Pressable
                        key={`${item.variant_id}-${index}`}
                        style={[styles.itemRow, index === items.length - 1 && styles.itemRowLast]}
                        onPress={() => {
                          if (isConfirmingRemove) return;
                          setEditingItemIndex(index);
                          setItemSheetOpen(true);
                        }}
                        onLongPress={() => setConfirmRemoveIndex(index)}
                      >
                        {isConfirmingRemove ? (
                          <View style={styles.itemConfirmRow}>
                            <Text style={styles.itemConfirmText} numberOfLines={1}>
                              Remove {item.product_name}?
                            </Text>
                            <View style={styles.itemConfirmActions}>
                              <Pressable
                                onPress={() => setConfirmRemoveIndex(null)}
                                hitSlop={8}
                                style={styles.itemConfirmCancel}
                              >
                                <Text style={styles.itemConfirmCancelText}>Cancel</Text>
                              </Pressable>
                              <Pressable
                                onPress={() => {
                                  handleRemoveItem(index);
                                  setConfirmRemoveIndex(null);
                                }}
                                hitSlop={8}
                                style={styles.itemConfirmRemove}
                              >
                                <Text style={styles.itemConfirmRemoveText}>Remove</Text>
                              </Pressable>
                            </View>
                          </View>
                        ) : (
                          <>
                            <View style={styles.itemRowText}>
                              <Text style={styles.itemName} numberOfLines={1}>
                                {item.product_name} ({item.variant_name})
                              </Text>
                              <Text style={styles.itemPrice}>
                                {formatCurrency(item.quantity * item.selling_price, baker?.currency)}
                              </Text>
                            </View>
                            <View style={styles.itemStepper}>
                              <Pressable
                                onPress={() => handleAdjustItemQuantity(index, -1)}
                                hitSlop={8}
                                style={styles.itemStepperButton}
                              >
                                <Ionicons name="remove" size={14} color={colors.textPrimary} />
                              </Pressable>
                              <Text style={styles.itemStepperValue}>{item.quantity}</Text>
                              <Pressable
                                onPress={() => handleAdjustItemQuantity(index, 1)}
                                hitSlop={8}
                                style={[styles.itemStepperButton, styles.itemStepperButtonPrimary]}
                              >
                                <Ionicons name="add" size={14} color={colors.textInverse} />
                              </Pressable>
                            </View>
                          </>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </>
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

        </ScrollView>
      </KeyboardAvoidingView>

      <View
        style={[styles.footer, { paddingBottom: spacing.md + insets.bottom }]}
        onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
      >
        <View style={styles.footerSummaryRow}>
          <Text style={styles.footerSummaryLabel}>
            {items.length === 0 ? 'No items yet' : `${items.length} item${items.length === 1 ? '' : 's'}`}
          </Text>
          <View style={styles.footerTotalRow}>
            <Text style={styles.footerTotalLabel}>Total</Text>
            <Text style={[styles.footerTotalValue, items.length === 0 && styles.footerTotalValueMuted]}>
              {formatCurrency(total, baker?.currency)}
            </Text>
          </View>
        </View>
        <PrimaryButton
          title={isSubmitting ? 'Saving…' : submitLabel}
          onPress={handleSave}
          disabled={!canSave}
          isLoading={isSubmitting}
        />
      </View>

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
    quickDateRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
    quickDateChip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    quickDateChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    quickDateChipText: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '600' },
    quickDateChipTextSelected: { color: colors.textInverse },
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
    itemStepper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingVertical: 4,
      paddingHorizontal: spacing.sm,
      marginRight: spacing.sm,
    },
    itemStepperButton: {
      width: 22,
      height: 22,
      borderRadius: radii.sm,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemStepperButtonPrimary: { backgroundColor: colors.primary },
    itemStepperValue: {
      ...typography.bodySm,
      color: colors.textPrimary,
      fontWeight: '600',
      minWidth: 14,
      textAlign: 'center',
    },
    itemsHint: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },
    itemConfirmRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    itemConfirmText: { ...typography.bodySm, color: colors.textPrimary, flex: 1, marginRight: spacing.sm },
    itemConfirmActions: { flexDirection: 'row', gap: spacing.sm },
    itemConfirmCancel: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    itemConfirmCancelText: { ...typography.bodySm, color: colors.textSecondary, fontWeight: '600' },
    itemConfirmRemove: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.sm,
      backgroundColor: colors.danger,
    },
    itemConfirmRemoveText: { ...typography.bodySm, color: colors.textInverse, fontWeight: '600' },
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
    // Sticky footer -- Total + Save always visible regardless of scroll
    // position. Sits outside Screen.tsx/the ScrollView, so it needs its
    // own bottom-inset handling, same reasoning as Step 8's insets.bottom
    // fix, applied here a second time.
    //
    // Rounded top corners + upward shadow, no border -- reuses
    // FloatingTabBar's unifiedCard treatment (this app's one existing
    // "floating bar docked to the bottom of the screen" pattern) rather
    // than inventing a second, flatter bottom-bar language.
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      elevation: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.1,
      shadowRadius: 10,
    },
    footerSummaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    footerSummaryLabel: { ...typography.bodySm, color: colors.textSecondary },
    footerTotalRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
    footerTotalLabel: { ...typography.caption, color: colors.textSecondary },
    footerTotalValue: { ...typography.titleSm, color: colors.textPrimary, fontWeight: '600' },
    footerTotalValueMuted: { color: colors.textSecondary },
  });
}