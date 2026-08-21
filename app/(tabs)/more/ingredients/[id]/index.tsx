import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import {
  useDeleteIngredient,
  useIngredient,
  useMovementHistory,
  useRecordUseOrWaste,
  useRestockIngredient,
  useUpdateIngredient,
} from '../../../../../src/hooks/useIngredients';
import { useBakerProfile } from '../../../../../src/hooks/useBakerProfile';
import { usePressScale } from '../../../../../src/hooks/usePressScale';
import { useThemeColors } from '../../../../../src/theme/ThemeContext';
import type { InventoryMovement, MovementType } from '../../../../../src/types/ingredient';
import { ErrorBanner } from '../../../../../src/components/ErrorBanner';
import { PrimaryButton } from '../../../../../src/components/PrimaryButton';
import { StockGauge } from '../../../../../src/components/StockGauge';
import { IngredientFormSheet } from '../../../../../src/components/IngredientFormSheet';
import { UseWasteSheet } from '../../../../../src/components/UseWasteSheet';
import { RestockSheet } from '../../../../../src/components/RestockSheet';
import { ConfirmDialog } from '../../../../../src/components/ConfirmDialog';
import { Screen } from '../../../../../src/components/Screen';
import { getIngredientGauge, type GaugeSensitivity } from '../../../../../src/services/stockGauge';
import {
  radii,
  spacing,
  typography,
  motionDuration,
  motionEasing,
  motionStagger,
} from '../../../../../src/theme';
import type { ColorToken } from '../../../../../src/theme/colors';

export default function IngredientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { data: ingredient, isLoading, isError } = useIngredient(id);
  const { data: history } = useMovementHistory(id);
  const { data: baker } = useBakerProfile();
  const updateIngredient = useUpdateIngredient(id);
  const recordUseOrWaste = useRecordUseOrWaste(id);
  const restockIngredient = useRestockIngredient(id);
  const deleteIngredient = useDeleteIngredient();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isUseWasteOpen, setIsUseWasteOpen] = useState(false);
  const [isRestockOpen, setIsRestockOpen] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const backPress = usePressScale();
  const deletePress = usePressScale();
  const editLinkPress = usePressScale();

  if (isLoading) {
    return (
      <Screen style={styles.container}>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }

  if (isError || !ingredient) {
    return (
      <Screen style={styles.container}>
        <ErrorBanner message="Couldn't load this ingredient." />
      </Screen>
    );
  }

  const sensitivity: GaugeSensitivity = baker?.gauge_sensitivity ?? 'balanced';
  const gauge = getIngredientGauge(ingredient, sensitivity);
  const statusLabel =
    gauge.status === 'out' ? 'Out of stock' : gauge.status === 'low' ? 'Low stock' : 'In stock';
  const statusColor =
    gauge.status === 'out' || gauge.status === 'low' ? colors.danger : colors.success;

  // history is already sorted created_at desc (see getMovementHistory), so
  // the first 'restock' row is the most recent one — no extra query
  // needed for RestockSheet's "Last time" chip.
  const lastRestockQuantity =
    history?.find((m) => m.movement_type === 'restock')?.quantity_change ?? null;

  const handleDelete = () => {
    setDeleteError(null);
    deleteIngredient.mutate(ingredient.id, {
      onSuccess: () => router.back(),
      onError: (err: any) => {
        // Postgres 'on delete restrict' violation — recipe_ingredients
        // still references this ingredient. Show the plain-language
        // message from the Phase 5 spec instead of the raw DB error.
        const isRestrictViolation =
          err?.code === '23503' || String(err?.message ?? '').includes('foreign key');
        setDeleteError(
          isRestrictViolation
            ? "This ingredient is used in a recipe and can't be deleted. Remove it from the recipe first."
            : "Couldn't delete this ingredient. Try again."
        );
        setIsConfirmingDelete(false);
      },
    });
  };

  return (
    <Screen style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          onPressIn={backPress.onPressIn}
          onPressOut={backPress.onPressOut}
          hitSlop={12}
        >
          <Animated.View style={backPress.style}>
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </Animated.View>
        </Pressable>
        <Pressable
          onPress={() => setIsConfirmingDelete(true)}
          onPressIn={deletePress.onPressIn}
          onPressOut={deletePress.onPressOut}
          hitSlop={12}
        >
          <Animated.View style={[styles.deleteButton, deletePress.style]}>
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
          </Animated.View>
        </Pressable>
      </View>

      <ConfirmDialog
        visible={isConfirmingDelete}
        title="Delete this ingredient?"
        message={`This removes "${ingredient.name}" and its stock history. This can't be undone.`}
        confirmLabel="Delete"
        onCancel={() => setIsConfirmingDelete(false)}
        onConfirm={handleDelete}
      />

      {deleteError ? <ErrorBanner message={deleteError} /> : null}

      <Text style={styles.name}>{ingredient.name}</Text>
      {ingredient.category ? <Text style={styles.category}>{ingredient.category}</Text> : null}

      <Animated.View
        entering={FadeIn.duration(motionDuration.medium).easing(motionEasing.decelerate)}
        style={styles.heroCard}
      >
        <View style={styles.heroTopRow}>
          <View>
            <Text style={styles.heroLabel}>Current stock</Text>
            <Text style={styles.heroValue}>
              {ingredient.current_stock} {ingredient.unit}
            </Text>
          </View>
          <View style={[styles.statusChip, { backgroundColor: `${statusColor}1F` }]}>
            <Text style={[styles.statusChipText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>
        <StockGauge percent={gauge.percent} status={gauge.status} />
        {ingredient.low_stock_threshold != null ? (
          <Text style={styles.heroFootnote}>
            Alert set at {ingredient.low_stock_threshold} {ingredient.unit}
          </Text>
        ) : null}
      </Animated.View>

      <View style={styles.statGrid}>
        <StatTile label="Cost per unit" value={ingredient.cost_per_unit.toFixed(2)} styles={styles} />
        <StatTile
          label="Low-stock alert"
          value={
            ingredient.low_stock_threshold != null ? String(ingredient.low_stock_threshold) : '—'
          }
          onPress={() => setIsEditOpen(true)}
          styles={styles}
          colors={colors}
        />
      </View>

      <View style={styles.actionRow}>
        <View style={{ flex: 1, marginRight: spacing.sm }}>
          <PrimaryButton title="Restock" onPress={() => setIsRestockOpen(true)} />
        </View>
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <PrimaryButton
            title="Use / waste"
            variant="secondary"
            onPress={() => setIsUseWasteOpen(true)}
          />
        </View>
      </View>
      <Pressable
        onPress={() => setIsEditOpen(true)}
        onPressIn={editLinkPress.onPressIn}
        onPressOut={editLinkPress.onPressOut}
        style={styles.editLink}
      >
        <Animated.Text style={[styles.editLinkText, editLinkPress.style]}>
          Edit ingredient
        </Animated.Text>
      </Pressable>

      <Text style={styles.historyTitle}>Stock history</Text>
      <FlatList
        data={history ?? []}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.xxxl + 96 }}
        ListEmptyComponent={<Text style={styles.noHistory}>No stock changes yet.</Text>}
        renderItem={({ item, index }) => (
          <HistoryRow movement={item} unit={ingredient.unit} index={index} styles={styles} colors={colors} />
        )}
      />

      <IngredientFormSheet
        visible={isEditOpen}
        onDismiss={() => setIsEditOpen(false)}
        onSubmit={(input) =>
          updateIngredient.mutate(input, { onSuccess: () => setIsEditOpen(false) })
        }
        isSaving={updateIngredient.isPending}
        errorMessage={updateIngredient.isError ? "Couldn't save. Try again." : null}
        initialValue={ingredient}
      />

      <UseWasteSheet
        visible={isUseWasteOpen}
        onDismiss={() => setIsUseWasteOpen(false)}
        currentStock={ingredient.current_stock}
        unit={ingredient.unit}
        onSubmit={(quantity, reason) =>
          recordUseOrWaste.mutate(
            { quantity, reason },
            { onSuccess: () => setIsUseWasteOpen(false) }
          )
        }
        isSaving={recordUseOrWaste.isPending}
        errorMessage={recordUseOrWaste.isError ? "Couldn't save. Try again." : null}
      />

      <RestockSheet
        visible={isRestockOpen}
        onDismiss={() => setIsRestockOpen(false)}
        ingredient={ingredient}
        onSubmit={(input) =>
          restockIngredient.mutate(input, { onSuccess: () => setIsRestockOpen(false) })
        }
        isSaving={restockIngredient.isPending}
        errorMessage={restockIngredient.isError ? "Couldn't save. Try again." : null}
        lastRestockQuantity={lastRestockQuantity}
      />
    </Screen>
  );
}

function StatTile({
  label,
  value,
  valueColor,
  onPress,
  styles,
  colors,
}: {
  label: string;
  value: string;
  valueColor?: string;
  /** When set, the tile becomes tappable (e.g. Low-stock alert -> Edit
   * ingredient) and shows a small pencil affordance so it doesn't look
   * tappable-but-secretly-isn't. */
  onPress?: () => void;
  styles: ReturnType<typeof makeStyles>;
  colors?: Record<ColorToken, string>;
}) {
  const press = usePressScale();

  const content = (
    <>
      <View style={styles.statLabelRow}>
        <Text style={styles.statLabel}>{label}</Text>
        {onPress && colors ? (
          <Ionicons name="pencil-outline" size={12} color={colors.textSecondary} />
        ) : null}
      </View>
      <Text style={[styles.statValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${label.toLowerCase()}`}
        style={{ flex: 1.1 }}
      >
        <Animated.View style={[styles.statTile, press.style]}>{content}</Animated.View>
      </Pressable>
    );
  }

  return <View style={styles.statTile}>{content}</View>;
}

// Reason labels shown to the baker, per docs/UI_UX.md — never the raw
// movement_type enum.
function movementLabel(movement: InventoryMovement): string {
  if (movement.movement_type === 'restock') return 'Restocked';
  if (movement.movement_type === 'adjustment') return movement.note ?? 'Manual correction';
  return movement.note ?? (movement.movement_type === 'usage' ? 'Used' : 'Wasted');
}

// Icon + tint per movement type, so Stock history reads at a glance
// (restock = green truck, usage = red flame, waste = red trash,
// adjustment = neutral pencil) instead of relying on text alone.
function movementIcon(
  colors: Record<ColorToken, string>,
  type: MovementType
): { name: keyof typeof Ionicons.glyphMap; color: string } {
  switch (type) {
    case 'restock':
      return { name: 'cube-outline', color: colors.success };
    case 'usage':
      return { name: 'flame-outline', color: colors.danger };
    case 'waste':
      return { name: 'trash-outline', color: colors.danger };
    case 'adjustment':
      return { name: 'create-outline', color: colors.textSecondary };
  }
}

function HistoryRow({
  movement,
  unit,
  index,
  styles,
  colors,
}: {
  movement: InventoryMovement;
  unit: string;
  index: number;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
}) {
  const isPositive = movement.quantity_change > 0;
  const icon = movementIcon(colors, movement.movement_type);
  const date = new Date(movement.created_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  const delay = Math.min(index, motionStagger.maxStaggeredItems) * motionStagger.listItem;

  return (
    <Animated.View
      entering={FadeInDown.duration(motionDuration.medium).delay(delay).easing(motionEasing.decelerate)}
      style={styles.historyRow}
    >
      <View style={[styles.historyIconTile, { backgroundColor: `${icon.color}1F` }]}>
        <Ionicons name={icon.name} size={14} color={icon.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.historyLabel}>{movementLabel(movement)}</Text>
        <Text style={styles.historyDate}>{date}</Text>
      </View>
      <Text style={[styles.historyQty, { color: isPositive ? colors.success : colors.danger }]}>
        {isPositive ? '+' : ''}
        {movement.quantity_change} {unit}
      </Text>
    </Animated.View>
  );
}

function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    container: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    deleteButton: {
      width: 36,
      height: 36,
      borderRadius: radii.full,
      backgroundColor: colors.dangerMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    name: { ...typography.displaySm, color: colors.textPrimary },
    category: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xxs },
    heroCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.lg,
      marginTop: spacing.lg,
      marginBottom: spacing.md,
    },
    heroTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: spacing.md,
    },
    heroLabel: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xxs },
    heroValue: { fontSize: 24, lineHeight: 30, fontWeight: '600', color: colors.textPrimary },
    statusChip: {
      borderRadius: radii.full,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    statusChipText: { ...typography.bodySm, fontWeight: '600' },
    heroFootnote: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm },
    statGrid: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    statTile: {
      flex: 1,
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.md,
      padding: spacing.md,
    },
    statLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    statLabel: { ...typography.caption, color: colors.textSecondary },
    statValue: { ...typography.titleSm, color: colors.textPrimary, marginTop: spacing.xxs },
    costHint: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: -spacing.md,
      marginBottom: spacing.lg,
    },
    actionRow: { flexDirection: 'row', marginBottom: spacing.sm },
    editLink: { alignItems: 'center', paddingVertical: spacing.sm, marginBottom: spacing.lg },
    editLinkText: { ...typography.bodySm, color: colors.primary },
    historyTitle: { ...typography.titleSm, color: colors.textPrimary, marginBottom: spacing.sm },
    noHistory: { ...typography.bodySm, color: colors.textSecondary },
    historyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    historyIconTile: {
      width: 28,
      height: 28,
      borderRadius: radii.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    historyLabel: { ...typography.body, color: colors.textPrimary },
    historyDate: { ...typography.caption, color: colors.textSecondary },
    historyQty: { ...typography.body, fontWeight: '600' },
  });
}