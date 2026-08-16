import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  useDeleteIngredient,
  useIngredient,
  useMovementHistory,
  useRecordUseOrWaste,
  useRestockIngredient,
  useUpdateIngredient,
} from '../../../../src/hooks/useIngredients';
import { isLowStock, type InventoryMovement } from '../../../../src/types/ingredient';
import { ErrorBanner } from '../../../../src/components/ErrorBanner';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import { IngredientFormSheet } from '../../../../src/components/IngredientFormSheet';
import { UseWasteSheet } from '../../../../src/components/UseWasteSheet';
import { RestockSheet } from '../../../../src/components/RestockSheet';
import { ConfirmDialog } from '../../../../src/components/ConfirmDialog';
import { Screen } from '../../../../src/components/Screen';
import { colors, radii, spacing, typography } from '../../../../src/theme';

export default function IngredientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: ingredient, isLoading, isError } = useIngredient(id);
  const { data: history } = useMovementHistory(id);
  const updateIngredient = useUpdateIngredient(id);
  const recordUseOrWaste = useRecordUseOrWaste(id);
  const restockIngredient = useRestockIngredient(id);
  const deleteIngredient = useDeleteIngredient();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isUseWasteOpen, setIsUseWasteOpen] = useState(false);
  const [isRestockOpen, setIsRestockOpen] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const lowStock = isLowStock(ingredient);

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
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </Pressable>
        <Pressable
          onPress={() => setIsConfirmingDelete(true)}
          hitSlop={12}
          style={styles.deleteButton}
        >
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
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

      <View style={styles.statGrid}>
        <StatTile label="Current stock" value={`${ingredient.current_stock} ${ingredient.unit}`} />
        <StatTile
          label="Status"
          value={lowStock ? 'Low stock' : 'In stock'}
          valueColor={lowStock ? colors.danger : colors.success}
        />
        <StatTile label="Cost per unit" value={ingredient.cost_per_unit.toFixed(2)} />
        <StatTile
          label="Low-stock alert"
          value={
            ingredient.low_stock_threshold != null ? String(ingredient.low_stock_threshold) : '—'
          }
        />
      </View>

      <View style={styles.actionRow}>
        <View style={{ flex: 1, marginRight: spacing.sm }}>
          <PrimaryButton title="Restock" onPress={() => setIsRestockOpen(true)} />
        </View>
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <PrimaryButton title="Use / waste" onPress={() => setIsUseWasteOpen(true)} />
        </View>
      </View>
      <Pressable onPress={() => setIsEditOpen(true)} style={styles.editLink}>
        <Text style={styles.editLinkText}>Edit ingredient</Text>
      </Pressable>

      <Text style={styles.historyTitle}>Stock history</Text>
      <FlatList
        data={history ?? []}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.noHistory}>No stock changes yet.</Text>}
        renderItem={({ item }) => <HistoryRow movement={item} unit={ingredient.unit} />}
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
      />
    </Screen>
  );
}

function StatTile({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

// Reason labels shown to the baker, per docs/UI_UX.md — never the raw
// movement_type enum.
function movementLabel(movement: InventoryMovement): string {
  if (movement.movement_type === 'restock') return 'Restocked';
  if (movement.movement_type === 'adjustment') return movement.note ?? 'Manual correction';
  return movement.note ?? (movement.movement_type === 'usage' ? 'Used' : 'Wasted');
}

function HistoryRow({ movement, unit }: { movement: InventoryMovement; unit: string }) {
  const isPositive = movement.quantity_change > 0;
  const date = new Date(movement.created_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  return (
    <View style={styles.historyRow}>
      <View>
        <Text style={styles.historyLabel}>{movementLabel(movement)}</Text>
        <Text style={styles.historyDate}>{date}</Text>
      </View>
      <Text style={[styles.historyQty, { color: isPositive ? colors.success : colors.danger }]}>
        {isPositive ? '+' : ''}
        {movement.quantity_change} {unit}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: colors.dangerMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { ...typography.titleLg, color: colors.textPrimary },
  category: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xxs },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  statTile: {
    width: '48%',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  statLabel: { ...typography.caption, color: colors.textSecondary },
  statValue: { ...typography.titleSm, color: colors.textPrimary, marginTop: spacing.xxs },
  actionRow: { flexDirection: 'row', marginBottom: spacing.sm },
  editLink: { alignItems: 'center', paddingVertical: spacing.sm, marginBottom: spacing.lg },
  editLinkText: { ...typography.bodySm, color: colors.primary },
  historyTitle: { ...typography.titleSm, color: colors.textPrimary, marginBottom: spacing.sm },
  noHistory: { ...typography.bodySm, color: colors.textSecondary },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyLabel: { ...typography.body, color: colors.textPrimary },
  historyDate: { ...typography.caption, color: colors.textSecondary },
  historyQty: { ...typography.body, fontWeight: '600' },
});
