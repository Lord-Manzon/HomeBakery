import { useMemo, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useProductCategories, useProducts } from '../../../../src/hooks/useProducts';
import { useBakerProfile } from '../../../../src/hooks/useBakerProfile';
import { useThemeColors } from '../../../../src/theme/ThemeContext';
import { ErrorBanner } from '../../../../src/components/ErrorBanner';
import { Screen } from '../../../../src/components/Screen';
import { formatCurrency } from '../../../../src/utils/currency';
import { getCategoryVisual } from '../../../../src/utils/productCategoryIcon';
import { spacing, radii, typography, motionDuration, motionEasing } from '../../../../src/theme';
import type { ColorToken } from '../../../../src/theme/colors';
import type { ProductWithVariants } from '../../../../src/types/product';

type SortOption = 'name-asc' | 'name-desc' | 'newest';

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'Name (A–Z)', value: 'name-asc' },
  { label: 'Name (Z–A)', value: 'name-desc' },
  { label: 'Newest first', value: 'newest' },
];

export default function ProductsListScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { data: products, isLoading, isError, refetch } = useProducts();
  const { data: baker } = useBakerProfile();
  const { data: productCategories } = useProductCategories();
  const [search, setSearch] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('name-asc');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Category chips are derived dynamically from whatever categories are
  // currently in use — no fixed/curated list. See docs/PRODUCT.md and
  // docs/DECISIONS.md's 2026-08-17 entry.
  const categories = useMemo(() => {
    if (!products) return [];
    const distinct = new Set<string>();
    for (const p of products) {
      if (p.category) distinct.add(p.category);
    }
    return Array.from(distinct).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const filtered = useMemo(() => {
    if (!products) return [];
    const matches = products
      .filter((p) => (selectedCategory === 'All' ? true : p.category === selectedCategory))
      .filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));

    return [...matches].sort((a, b) => {
      if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
      if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [products, selectedCategory, search, sortBy]);

  const isEmptyCatalog = !products || products.length === 0;

  return (
    <Screen style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Products</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setIsFilterOpen((v) => !v)}
            style={styles.iconButton}
            accessibilityLabel="Sort products"
          >
            <Ionicons name="options-outline" size={20} color={colors.textPrimary} />
          </Pressable>
          <Pressable
            onPress={() => setIsSearchOpen((v) => !v)}
            style={styles.iconButton}
            accessibilityLabel="Search products"
          >
            <Ionicons name="search" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      {isFilterOpen ? (
        <>
          <Pressable style={styles.filterScrim} onPress={() => setIsFilterOpen(false)} />
          <Animated.View
            entering={FadeIn.duration(motionDuration.fast).easing(motionEasing.decelerate)}
            style={styles.filterMenu}
          >
            {SORT_OPTIONS.map((opt) => {
              const isSelected = sortBy === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={styles.filterRow}
                  onPress={() => {
                    setSortBy(opt.value);
                    setIsFilterOpen(false);
                  }}
                >
                  <Text style={[styles.filterRowText, isSelected && styles.filterRowTextSelected]}>
                    {opt.label}
                  </Text>
                  {isSelected ? <Ionicons name="checkmark" size={16} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </Animated.View>
        </>
      ) : null}

      {isSearchOpen ? (
        <TextInput
          style={styles.searchInput}
          placeholder="Search products"
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
          autoFocus
        />
      ) : null}

      {categories.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryRow}
          contentContainerStyle={styles.categoryRowContent}
        >
          {['All', ...categories].map((cat) => {
            const isSelected = selectedCategory === cat;
            const visual = cat !== 'All' ? getCategoryVisual(cat, productCategories ?? []) : null;
            return (
              <Pressable
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                style={[
                  styles.categoryChip,
                  isSelected &&
                    (visual
                      ? { backgroundColor: visual.color, borderColor: visual.color }
                      : styles.categoryChipSelected),
                ]}
              >
                {visual ? (
                  <Ionicons
                    name={visual.icon as keyof typeof Ionicons.glyphMap}
                    size={14}
                    color={isSelected ? colors.textInverse : colors.textSecondary}
                  />
                ) : null}
                <Text
                  style={[styles.categoryChipText, isSelected && styles.categoryChipTextSelected]}
                >
                  {cat}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {isError ? <ErrorBanner message="Couldn't load products. Pull down to retry." /> : null}

      {isLoading ? (
        <View style={styles.skeletonGrid}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.card, styles.cardSkeleton]} />
          ))}
        </View>
      ) : filtered.length === 0 ? (
        products && products.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="pricetags-outline" size={40} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>Add your first product</Text>
            <Text style={styles.emptyBody}>
              Products are what your customers buy — add one to start building your catalog.
            </Text>
            <Pressable
              style={styles.emptyButton}
              onPress={() => router.push('/more/products/new')}
            >
              <Text style={styles.emptyButtonText}>Add product</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No products match "{search}"</Text>
            <Pressable style={styles.emptyButton} onPress={() => setSearch('')}>
              <Text style={styles.emptyButtonText}>Clear search</Text>
            </Pressable>
          </View>
        )
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          onRefresh={refetch}
          refreshing={isLoading}
          showsVerticalScrollIndicator={false}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              styles={styles}
              colors={colors}
              currency={baker?.currency}
              onPress={() => router.push(`/more/products/${item.id}`)}
            />
          )}
        />
      )}

      {!isLoading && !isEmptyCatalog ? (
        <Pressable
          onPress={() => router.push('/more/products/new')}
          style={styles.fab}
          accessibilityLabel="Add product"
        >
          <Ionicons name="add" size={28} color={colors.textInverse} />
        </Pressable>
      ) : null}
    </Screen>
  );
}

const MAX_VISIBLE_VARIANT_CHIPS = 2;

function ProductCard({
  product,
  styles,
  colors,
  currency,
  onPress,
}: {
  product: ProductWithVariants;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
  currency: string | null | undefined;
  onPress: () => void;
}) {
  const visibleVariants = product.variants.slice(0, MAX_VISIBLE_VARIANT_CHIPS);
  const hiddenCount = product.variants.length - visibleVariants.length;

  return (
    <Pressable style={styles.card} onPress={onPress}>
      {product.image_url ? (
        <Image source={{ uri: product.image_url }} style={styles.cardImage} />
      ) : (
        <View style={styles.cardImagePlaceholder}>
          <Ionicons name="image-outline" size={28} color={colors.textSecondary} />
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={1}>
          {product.name}
        </Text>
        {product.variants.length > 0 ? (
          <View style={styles.variantChipRow}>
            {visibleVariants.map((v) => (
              <View key={v.id} style={styles.variantChip}>
                <Text style={styles.variantChipText} numberOfLines={1}>
                  {v.name}
                </Text>
                <Text style={styles.variantChipPrice}>
                  {formatCurrency(v.selling_price, currency)}
                </Text>
              </View>
            ))}
            {hiddenCount > 0 ? (
              <View style={styles.variantChipMore}>
                <Text style={styles.variantChipMoreText}>+{hiddenCount} more</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <Text style={styles.cardNoVariants}>No sizes yet</Text>
        )}
      </View>
    </Pressable>
  );
}

// See src/components/FormField.tsx for why styles are built per-render
// from the theme palette instead of a static module-level
// StyleSheet.create() — this screen is theme-reactive per the Phase 4
// rule in docs/DECISIONS.md (2026-08-15 entry).
function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xl,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    title: { ...typography.displaySm, color: colors.textPrimary },
    headerActions: { flexDirection: 'row', gap: spacing.sm },
    iconButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterScrim: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 5,
    },
    filterMenu: {
      position: 'absolute',
      top: 56,
      right: 52,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      overflow: 'hidden',
      zIndex: 10,
      elevation: 6,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
      minWidth: 170,
    },
    filterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      minHeight: 44,
    },
    filterRowText: { ...typography.bodySm, color: colors.textPrimary },
    filterRowTextSelected: { color: colors.primary, fontWeight: '600' },
    searchInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      fontSize: typography.body.fontSize,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
      marginBottom: spacing.md,
    },
    categoryRow: { height: 40, maxHeight: 40, flexGrow: 0, flexShrink: 0, marginBottom: spacing.md },
    categoryRowContent: { flexGrow: 0, alignItems: 'flex-start', paddingRight: spacing.xl },
    categoryChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.full,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginRight: spacing.sm,
      backgroundColor: colors.surface,
    },
    categoryChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    categoryChipText: { ...typography.bodySm, color: colors.textPrimary },
    categoryChipTextSelected: { color: colors.textInverse },
    listContent: { paddingBottom: spacing.xxxl + 56 },
    skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    gridRow: { gap: spacing.md },
    card: {
      width: '47%',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      overflow: 'hidden',
      marginBottom: spacing.md,
    },
    cardSkeleton: { height: 208, backgroundColor: colors.surfaceMuted, borderColor: colors.surfaceMuted },
    cardImage: {
      width: '100%',
      aspectRatio: 1,
      backgroundColor: colors.surfaceMuted,
    },
    cardImagePlaceholder: {
      width: '100%',
      aspectRatio: 1,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardBody: { padding: spacing.md },
    cardName: { ...typography.titleSm, color: colors.textPrimary, marginBottom: spacing.xs },
    cardNoVariants: { ...typography.bodySm, color: colors.textSecondary },
    variantChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    variantChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xxs,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xxs + 1,
      backgroundColor: colors.surfaceMuted,
    },
    variantChipText: { ...typography.caption, color: colors.textPrimary },
    variantChipPrice: { ...typography.caption, color: colors.textSecondary },
    variantChipMore: {
      justifyContent: 'center',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xxs + 1,
    },
    variantChipMoreText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
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
    emptyState: {
      alignItems: 'center',
      paddingTop: spacing.xxxl,
      paddingHorizontal: spacing.xl,
    },
    emptyTitle: {
      ...typography.titleSm,
      color: colors.textPrimary,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
      textAlign: 'center',
    },
    emptyBody: {
      ...typography.bodySm,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.lg,
    },
    emptyButton: {
      backgroundColor: colors.primary,
      borderRadius: radii.md,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      minHeight: 44,
      justifyContent: 'center',
    },
    emptyButtonText: { ...typography.titleSm, color: colors.textInverse },
  });
}
