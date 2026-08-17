import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useProduct, useVariants } from '../../../../../src/hooks/useProducts';
import { useThemeColors } from '../../../../../src/theme/ThemeContext';
import { ErrorBanner } from '../../../../../src/components/ErrorBanner';
import { Screen } from '../../../../../src/components/Screen';
import { spacing, radii, typography } from '../../../../../src/theme';
import type { ColorToken } from '../../../../../src/theme/colors';

/**
 * Per docs/UI_UX_1.md section 6 — "Phase 4 scope (current): the screen
 * exists as a real, routed placeholder so the 'Recipe & costing' button
 * has somewhere to go, but shows no computed numbers yet." Phase 6 will
 * replace this with the actual ingredient list + cost breakdown.
 */
export default function RecipeAndCostingScreen() {
  const { id, variantId } = useLocalSearchParams<{ id: string; variantId: string }>();
  const router = useRouter();
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { data: product, isLoading: isLoadingProduct, isError: isProductError } = useProduct(id);
  const { data: variants, isLoading: isLoadingVariants } = useVariants(id);

  const variant = variants?.find((v) => v.id === variantId);
  const isLoading = isLoadingProduct || isLoadingVariants;

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          Recipe & costing
        </Text>
        <View style={styles.iconButton} />
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : isProductError || !product ? (
        <ErrorBanner message="Couldn't load this product." />
      ) : (
        <>
          <Text style={styles.subtitle}>
            {product.name}
            {variant ? ` — ${variant.name}` : ''}
          </Text>

          <View style={styles.placeholderCard}>
            <Ionicons name="calculator-outline" size={32} color={colors.textSecondary} />
            <Text style={styles.placeholderTitle}>Recipe & costing isn't set up yet</Text>
            <Text style={styles.placeholderBody}>
              This comes in a later phase. For now, you can still manage your product and variant
              details.
            </Text>
          </View>
        </>
      )}
    </Screen>
  );
}

function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.lg,
    },
    iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    title: { ...typography.displaySm, color: colors.textPrimary, flex: 1, textAlign: 'center' },
    subtitle: {
      ...typography.titleSm,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.xl,
    },
    placeholderCard: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.lg,
      padding: spacing.xxl,
    },
    placeholderTitle: {
      ...typography.titleSm,
      color: colors.textPrimary,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
      textAlign: 'center',
    },
    placeholderBody: {
      ...typography.bodySm,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
}
