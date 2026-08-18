import { useMemo, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useProducts } from '../../../../src/hooks/useProducts';
import { useBakerProfile } from '../../../../src/hooks/useBakerProfile';
import { useThemeColors } from '../../../../src/theme/ThemeContext';
import { ErrorBanner } from '../../../../src/components/ErrorBanner';
import { Screen } from '../../../../src/components/Screen';
import { formatCurrency } from '../../../../src/utils/currency';
import { spacing, radii, typography } from '../../../../src/theme';
import type { ColorToken } from '../../../../src/theme/colors';
import type { ProductWithVariants } from '../../../../src/types/product';

export default function ProductsListScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { data: products, isLoading, isError, refetch } = useProducts();
  const { data: baker } = useBakerProfile();
  const [search, setSearch] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
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
    return products
      .filter((p) => (selectedCategory === 'All' ? true : p.category === selectedCategory))
      .filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));
  }, [products, selectedCategory, search]);

  const isEmptyCatalog = !products || products.length === 0;

  return (
    <Screen style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Products</Text>
        <Pressable
          onPress={() => setIsSearchOpen((v) => !v)}
          style={styles.iconButton}
          accessibilityLabel="Search products"
        >
          <Ionicons name="search" size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      {isSearchOpen ? (
        <TextInput
          style={styles.searchInput}
          placeholder="Search products"
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
          autoFocus
        />
      ) : (
        <Text style={styles.helperLine}>Tap a product to see its variants</Text>
      )}

      {categories.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryRow}
          contentContainerStyle={styles.categoryRowContent}
        >
          {['All', ...categories].map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
              >
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
        <View>
          {[0, 1, 2].map((i) => (
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

const MAX_VISIBLE_VARIANT_CHIPS = 3;

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
          <Ionicons name="image-outline" size={22} color={colors.textSecondary} />
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardName}>{product.name}</Text>
        {product.variants.length > 0 ? (
          <View style={styles.variantChipRow}>
            {visibleVariants.map((v) => (
              <View key={v.id} style={styles.variantChip}>
                <Text style={styles.variantChipText}>{v.name}</Text>
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
    helperLine: {
      ...typography.bodySm,
      color: colors.textSecondary,
      marginBottom: spacing.md,
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
    categoryRow: { height: 40, maxHeight: 40, flexGrow: 0, flexShrink: 0, marginBottom: spacing.md },
    categoryRowContent: { flexGrow: 0, alignItems: 'flex-start', paddingRight: spacing.xl },
    categoryChip: {
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
    card: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.lg,
      marginBottom: spacing.md,
      gap: spacing.md,
    },
    cardSkeleton: { height: 88, backgroundColor: colors.surfaceMuted, borderColor: colors.surfaceMuted },
    cardImage: {
      width: 56,
      height: 56,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceMuted,
    },
    cardImagePlaceholder: {
      width: 56,
      height: 56,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardBody: { flex: 1, justifyContent: 'center' },
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
