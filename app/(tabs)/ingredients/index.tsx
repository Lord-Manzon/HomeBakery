import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCreateIngredient, useIngredients } from '../../../src/hooks/useIngredients';
import { isLowStock, type Ingredient } from '../../../src/types/ingredient';
import { ErrorBanner } from '../../../src/components/ErrorBanner';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { IngredientFormSheet } from '../../../src/components/IngredientFormSheet';
import { Screen } from '../../../src/components/Screen';
import { colors, radii, spacing, typography } from '../../../src/theme';

export default function IngredientsListScreen() {
  const router = useRouter();
  const { data: ingredients, isLoading, isError, refetch } = useIngredients();
  const [search, setSearch] = useState('');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const createIngredient = useCreateIngredient();

  const lowStockCount = (ingredients ?? []).filter(isLowStock).length;

  const filtered = (ingredients ?? [])
    .filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    .filter((i) => (showLowStockOnly ? isLowStock(i) : true))
    // low-stock items surface first, per docs/UI_UX.md
    .sort((a, b) => Number(isLowStock(b)) - Number(isLowStock(a)));

  const handleAddSubmit = (input: Parameters<typeof createIngredient.mutate>[0]) => {
    createIngredient.mutate(input, {
      onSuccess: () => setIsAddOpen(false),
    });
  };

  if (isLoading) {
    return (
      <Screen style={styles.container}>
        <Text style={styles.title}>Ingredients</Text>
        {[1, 2, 3, 4].map((n) => (
          <View key={n} style={styles.skeletonCard} />
        ))}
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen style={styles.container}>
        <Text style={styles.title}>Ingredients</Text>
        <ErrorBanner message="Couldn't load your ingredients." />
        <PrimaryButton title="Try again" onPress={() => refetch()} />
      </Screen>
    );
  }

  const isEmpty = !ingredients || ingredients.length === 0;

  return (
    <Screen style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Ingredients</Text>
      </View>

      {isEmpty ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No ingredients yet</Text>
          <Text style={styles.emptyNote}>Add one to start tracking your stock.</Text>
          <View style={styles.emptyButton}>
            <PrimaryButton title="Add ingredient" onPress={() => setIsAddOpen(true)} />
          </View>
        </View>
      ) : (
        <>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search ingredients"
              placeholderTextColor={colors.textSecondary}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>

          {lowStockCount > 0 && (
            <Pressable
              style={styles.attentionBanner}
              onPress={() => setShowLowStockOnly((v) => !v)}
            >
              <Ionicons name="alert-circle" size={18} color={colors.danger} />
              <Text style={styles.attentionText}>
                {lowStockCount} ingredient{lowStockCount === 1 ? '' : 's'} need
                {lowStockCount === 1 ? 's' : ''} attention · tap to {showLowStockOnly ? 'show all' : 'view'}
              </Text>
            </Pressable>
          )}

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: spacing.xl }}
            ListEmptyComponent={
              <Text style={styles.noMatch}>No ingredients match "{search}"</Text>
            }
            renderItem={({ item }) => (
              <IngredientCard
                ingredient={item}
                onPress={() => router.push(`/ingredients/${item.id}`)}
              />
            )}
          />
        </>
      )}

      {!isEmpty && (
        <Pressable onPress={() => setIsAddOpen(true)} style={styles.fab}>
          <Ionicons name="add" size={28} color={colors.textInverse} />
        </Pressable>
      )}

      <IngredientFormSheet
        visible={isAddOpen}
        onDismiss={() => setIsAddOpen(false)}
        onSubmit={handleAddSubmit}
        isSaving={createIngredient.isPending}
        errorMessage={createIngredient.isError ? "Couldn't save. Try again." : null}
      />
    </Screen>
  );
}

function IngredientCard({ ingredient, onPress }: { ingredient: Ingredient; onPress: () => void }) {
  const lowStock = isLowStock(ingredient);
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardName}>{ingredient.name}</Text>
        {ingredient.category ? (
          <Text style={styles.cardCategory}>{ingredient.category}</Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.cardStock}>
          {ingredient.current_stock} {ingredient.unit}
        </Text>
        {lowStock ? (
          <View style={styles.lowStockBadge}>
            <Text style={styles.lowStockBadgeText}>Low stock</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: { ...typography.titleLg, color: colors.textPrimary },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonLabel: { color: colors.textInverse, fontSize: 22, lineHeight: 24 },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  skeletonCard: {
    height: 64,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    marginBottom: spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    height: 44,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, ...typography.body, color: colors.textPrimary, padding: 0 },
  attentionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerMuted,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  attentionText: { ...typography.bodySm, color: colors.danger, flex: 1 },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    minHeight: 44,
  },
  cardName: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  cardCategory: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xxs },
  cardStock: { ...typography.body, color: colors.textPrimary },
  lowStockBadge: {
    backgroundColor: colors.dangerMuted,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: spacing.xxs,
  },
  lowStockBadgeText: { ...typography.caption, color: colors.danger },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { ...typography.titleLg, color: colors.textPrimary, marginBottom: spacing.xs },
  emptyNote: {
    ...typography.bodySm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  emptyButton: { width: '100%' },
  noMatch: { ...typography.bodySm, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
});
