import { useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  useDeleteProductCategory,
  useProductCategories,
  useProducts,
} from '../../../../src/hooks/useProducts';
import { useBakerProfile } from '../../../../src/hooks/useBakerProfile';
import { useThemeColors } from '../../../../src/theme/ThemeContext';
import { ErrorBanner } from '../../../../src/components/ErrorBanner';
import { Screen } from '../../../../src/components/Screen';
import { ConfirmDialog } from '../../../../src/components/ConfirmDialog';
import { formatCurrency } from '../../../../src/utils/currency';
import { getCategoryVisual } from '../../../../src/utils/productCategoryIcon';
import {
  spacing,
  radii,
  typography,
  motionDuration,
  motionEasing,
  motionStagger,
} from '../../../../src/theme';
import type { ColorToken } from '../../../../src/theme/colors';
import type { ProductCategory, ProductWithVariants } from '../../../../src/types/product';

type SortOption = 'name-asc' | 'name-desc' | 'newest';
type ViewMode = 'grid' | 'list';

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'Name (A–Z)', value: 'name-asc' },
  { label: 'Name (Z–A)', value: 'name-desc' },
  { label: 'Newest first', value: 'newest' },
];

const DISPLAY_OPTIONS: { label: string; value: ViewMode; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'Grid', value: 'grid', icon: 'grid-outline' },
  { label: 'List', value: 'list', icon: 'list-outline' },
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
  // Grid is the default — it's what actually shows product photos at a
  // usable size. List stays available for scanning names/prices more
  // densely.
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isEditingCategories, setIsEditingCategories] = useState(false);
  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<ProductCategory | null>(
    null
  );
  const deleteCategory = useDeleteProductCategory();

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
      <Pressable
        style={styles.editDismissWrapper}
        onPress={() => {
          if (isEditingCategories) setIsEditingCategories(false);
        }}
      >
      <View style={styles.headerRow}>
        {isSearchOpen ? (
          <>
            <Pressable
              onPress={() => {
                setIsSearchOpen(false);
                setSearch('');
              }}
              style={styles.iconButton}
              accessibilityLabel="Close search"
            >
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </Pressable>
            <TextInput
              style={styles.searchInputInline}
              placeholder="Search products"
              placeholderTextColor={colors.textSecondary}
              value={search}
              onChangeText={setSearch}
              autoFocus
            />
            <Pressable
              onPress={() => setIsFilterOpen((v) => !v)}
              style={styles.iconButton}
              accessibilityLabel="Sort products"
            >
              <Ionicons name="options-outline" size={20} color={colors.textPrimary} />
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.title}>Products</Text>
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => setIsSearchOpen(true)}
                style={styles.iconButton}
                accessibilityLabel="Search products"
              >
                <Ionicons name="search" size={20} color={colors.textPrimary} />
              </Pressable>
              <Pressable
                onPress={() => setIsFilterOpen((v) => !v)}
                style={styles.iconButton}
                accessibilityLabel="Sort products"
              >
                <Ionicons name="options-outline" size={20} color={colors.textPrimary} />
              </Pressable>
            </View>
          </>
        )}
      </View>

      {isFilterOpen ? (
        <>
          <Pressable style={styles.filterScrim} onPress={() => setIsFilterOpen(false)} />
          <Animated.View
            entering={FadeIn.duration(motionDuration.fast).easing(motionEasing.decelerate)}
            style={styles.filterMenu}
          >
            <Text style={styles.filterSectionLabel}>Display</Text>
            {DISPLAY_OPTIONS.map((opt) => {
              const isSelected = viewMode === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={styles.filterRow}
                  onPress={() => {
                    setViewMode(opt.value);
                    setIsFilterOpen(false);
                  }}
                >
                  <Ionicons
                    name={opt.icon}
                    size={16}
                    color={isSelected ? colors.primary : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.filterRowText,
                      styles.filterRowTextWithIcon,
                      isSelected && styles.filterRowTextSelected,
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {isSelected ? <Ionicons name="checkmark" size={16} color={colors.primary} /> : null}
                </Pressable>
              );
            })}

            <View style={styles.filterDivider} />

            <Text style={styles.filterSectionLabel}>Sort by</Text>
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

      

      {categories.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryRow}
          contentContainerStyle={styles.categoryRowContent}
        >
          <Pressable
            onPress={isEditingCategories ? undefined : () => setSelectedCategory('All')}
            style={[
              styles.categoryChip,
              selectedCategory === 'All' && styles.categoryChipSelected,
            ]}
          >
            <Text
              style={[
                styles.categoryChipText,
                selectedCategory === 'All' && styles.categoryChipTextSelected,
              ]}
            >
              All
            </Text>
          </Pressable>
          {categories.map((cat) => {
            const matched = (productCategories ?? []).find(
              (c) => c.name.toLowerCase() === cat.toLowerCase()
            );
            return (
              <FilterCategoryChip
                key={cat}
                name={cat}
                isSelected={selectedCategory === cat}
                isEditing={isEditingCategories}
                canDelete={!!matched}
                onSelect={() => setSelectedCategory(cat)}
                onLongPress={() => setIsEditingCategories(true)}
                onRequestDelete={() => matched && setPendingDeleteCategory(matched)}
                styles={styles}
                colors={colors}
                productCategories={productCategories ?? []}
              />
            );
          })}
          <Pressable
            onPress={
              isEditingCategories ? undefined : () => router.push('/more/products/categories/new')
            }
            style={[styles.categoryChipNew, isEditingCategories && styles.categoryChipNewDisabled]}
          >
            <Ionicons name="add" size={14} color={colors.primary} />
            <Text style={styles.categoryChipNewText}>New</Text>
          </Pressable>
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
          // Forcing a remount on view-mode change is the standard RN fix
          // for FlatList's restriction against changing `numColumns`
          // after the first render.
          key={viewMode}
          data={filtered}
          keyExtractor={(item) => item.id}
          onRefresh={refetch}
          refreshing={isLoading}
          showsVerticalScrollIndicator={false}
          numColumns={viewMode === 'grid' ? 2 : 1}
          columnWrapperStyle={viewMode === 'grid' ? styles.gridRow : undefined}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }) =>
            viewMode === 'grid' ? (
              <ProductCard
                product={item}
                index={index}
                styles={styles}
                colors={colors}
                currency={baker?.currency}
                onPress={() => router.push(`/more/products/${item.id}`)}
              />
            ) : (
              <ProductListCard
                product={item}
                index={index}
                styles={styles}
                colors={colors}
                currency={baker?.currency}
                onPress={() => router.push(`/more/products/${item.id}`)}
              />
            )
          }
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

      <ConfirmDialog
        visible={!!pendingDeleteCategory}
        title="Delete this category?"
        message={
          pendingDeleteCategory
            ? (() => {
                const affected = (products ?? []).filter(
                  (p) => p.category === pendingDeleteCategory.name
                ).length;
                return affected > 0
                  ? `"${pendingDeleteCategory.name}" will be removed, and cleared from ${affected} product${affected === 1 ? '' : 's'} currently using it. This can't be undone.`
                  : `"${pendingDeleteCategory.name}" will be removed. No products are currently using it.`;
              })()
            : ''
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (!pendingDeleteCategory) return;
          if (selectedCategory === pendingDeleteCategory.name) setSelectedCategory('All');
          deleteCategory.mutate({ id: pendingDeleteCategory.id, name: pendingDeleteCategory.name });
          setPendingDeleteCategory(null);
        }}
        onCancel={() => setPendingDeleteCategory(null)}
      />
      </Pressable>
    </Screen>
  );
}

const MAX_VISIBLE_VARIANT_CHIPS = 2;

function ProductCard({
  product,
  index,
  styles,
  colors,
  currency,
  onPress,
}: {
  product: ProductWithVariants;
  index: number;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
  currency: string | null | undefined;
  onPress: () => void;
}) {
  const visibleVariants = product.variants.slice(0, MAX_VISIBLE_VARIANT_CHIPS);
  const hiddenCount = product.variants.length - visibleVariants.length;
  // Staggered entrance per motion.ts's motionStagger — capped so a long
  // catalog doesn't make the last cards look sluggishly late.
  const delay = Math.min(index, motionStagger.maxStaggeredItems) * motionStagger.listItem;

  return (
    <Animated.View
      entering={FadeInDown.duration(motionDuration.medium).delay(delay).easing(motionEasing.decelerate)}
      style={styles.gridCardWrap}
    >
      <Pressable style={styles.card} onPress={onPress}>
        {product.image_url ? (
          <Image source={{ uri: product.image_url }} style={styles.cardImage} />
        ) : (
          <View style={styles.cardImagePlaceholder}>
            <Ionicons name="image-outline" size={28} color={colors.textSecondary} />
          </View>
        )}
        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={2}>
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
            <Text style={styles.cardNoVariants}>Tap to add a price</Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

// List-mode counterpart — same row layout the screen used before the
// grid rework, kept for anyone who wants to scan names/prices more
// densely than the photo-first grid allows. Reuses the same variant
// chip styles as the grid card so both modes read as one design.
function ProductListCard({
  product,
  index,
  styles,
  colors,
  currency,
  onPress,
}: {
  product: ProductWithVariants;
  index: number;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
  currency: string | null | undefined;
  onPress: () => void;
}) {
  const visibleVariants = product.variants.slice(0, MAX_VISIBLE_VARIANT_CHIPS + 1);
  const hiddenCount = product.variants.length - visibleVariants.length;
  const delay = Math.min(index, motionStagger.maxStaggeredItems) * motionStagger.listItem;

  return (
    <Animated.View
      entering={FadeInDown.duration(motionDuration.medium).delay(delay).easing(motionEasing.decelerate)}
    >
      <Pressable style={styles.listCard} onPress={onPress}>
        {product.image_url ? (
          <Image source={{ uri: product.image_url }} style={styles.listCardImage} />
        ) : (
          <View style={styles.listCardImagePlaceholder}>
            <Ionicons name="image-outline" size={22} color={colors.textSecondary} />
          </View>
        )}
        <View style={styles.listCardBody}>
          <Text style={styles.listCardName} numberOfLines={1}>
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
            <Text style={styles.cardNoVariants}>Tap to add a price</Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

// See src/components/FormField.tsx for why styles are built per-render
// from the theme palette instead of a static module-level
// StyleSheet.create() — this screen is theme-reactive per the Phase 4
// rule in docs/DECISIONS.md (2026-08-15 entry).
// Same wiggle-on-long-press / x-to-delete pattern as New Product's
// CategoryChip (see docs/DECISIONS.md's 2026-08-18 entry) — kept as a
// separate component here rather than shared, since this one has to
// handle the "All" pseudo-category and legacy categories with no
// matching product_categories row (canDelete=false: still wiggles for
// visual consistency with its siblings, just never grows a badge, since
// there's no row here to delete).
function FilterCategoryChip({
  name,
  isSelected,
  isEditing,
  canDelete,
  onSelect,
  onLongPress,
  onRequestDelete,
  styles,
  colors,
  productCategories,
}: {
  name: string;
  isSelected: boolean;
  isEditing: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onLongPress: () => void;
  onRequestDelete: () => void;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
  productCategories: ProductCategory[];
}) {
  const visual = getCategoryVisual(name, productCategories);
  const wiggle = useSharedValue(0);

  useEffect(() => {
    if (isEditing) {
      wiggle.value = withRepeat(
        withSequence(
          withTiming(-1, { duration: motionDuration.instant, easing: motionEasing.standard }),
          withTiming(1, { duration: motionDuration.instant * 2, easing: motionEasing.standard }),
          withTiming(0, { duration: motionDuration.instant, easing: motionEasing.standard })
        ),
        -1
      );
    } else {
      wiggle.value = withTiming(0, { duration: motionDuration.fast });
    }
  }, [isEditing]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${wiggle.value * 2}deg` }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={isEditing ? undefined : onSelect}
        onLongPress={isEditing ? undefined : onLongPress}
        style={[
          styles.categoryChip,
          isSelected && { backgroundColor: visual.color, borderColor: visual.color },
        ]}
      >
        <Ionicons
          name={visual.icon as keyof typeof Ionicons.glyphMap}
          size={14}
          color={isSelected ? colors.textInverse : colors.textSecondary}
        />
        <Text style={[styles.categoryChipText, isSelected && styles.categoryChipTextSelected]}>
          {name}
        </Text>
      </Pressable>
      {isEditing && canDelete ? (
        <Pressable onPress={onRequestDelete} style={styles.categoryChipDeleteBadge} hitSlop={8}>
          <Ionicons name="close" size={10} color={colors.textInverse} />
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
    },
    editDismissWrapper: { flex: 1 },
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
    filterRowTextWithIcon: { flex: 1 },
    filterRowTextSelected: { color: colors.primary, fontWeight: '600' },
    filterSectionLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xxs,
    },
    filterDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: spacing.xs,
    },
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
    searchInputInline: {
      flex: 1,
      fontSize: typography.body.fontSize,
      color: colors.textPrimary,
      paddingHorizontal: spacing.sm,
    },
    // Height bumped from a flat 40 and a top inset added to
    // categoryRowContent — a horizontal ScrollView clips anything
    // outside its own box height, and the delete badge (categoryChipDeleteBadge,
    // offset top: -6 with an 18px diameter) pokes about 15px above a
    // chip's top edge. Without this room, that badge was rendering
    // clipped off — looked like it was "hidden under the header."
    categoryRow: { height: 52, maxHeight: 52, flexGrow: 0, flexShrink: 0, marginBottom: spacing.md },
    categoryRowContent: {
      flexGrow: 0,
      alignItems: 'flex-start',
      paddingTop: spacing.lg,
      paddingRight: spacing.xl,
    },
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
    categoryChipNew: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: radii.full,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginRight: spacing.sm,
    },
    categoryChipNewText: { ...typography.bodySm, color: colors.primary, fontWeight: '600' },
    categoryChipNewDisabled: { opacity: 0.4 },
    categoryChipDeleteBadge: {
      position: 'absolute',
      top: -6,
      right: -6,
      width: 18,
      height: 18,
      borderRadius: radii.full,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.background,
    },
    listContent: { paddingBottom: spacing.xxxl + 120 },
    skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    gridRow: { gap: spacing.md },
    gridCardWrap: { width: '47%' },
    card: {
      width: '100%',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      overflow: 'hidden',
      marginBottom: spacing.md,
    },
    // --- List view ---
    listCard: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.lg,
      marginBottom: spacing.md,
      gap: spacing.md,
    },
    listCardImage: {
      width: 56,
      height: 56,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceMuted,
    },
    listCardImagePlaceholder: {
      width: 56,
      height: 56,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    listCardBody: { flex: 1, justifyContent: 'center' },
    listCardName: { ...typography.titleSm, color: colors.textPrimary, marginBottom: spacing.xs },
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
    cardNoVariants: { ...typography.bodySm, color: colors.primary, fontWeight: '600' },
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