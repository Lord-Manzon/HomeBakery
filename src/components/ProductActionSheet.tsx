import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { BottomSheet } from './BottomSheet';
import { usePressScale } from '../hooks/usePressScale';
import { useThemeColors } from '../theme/ThemeContext';
import { radii, spacing, typography } from '../theme';
import type { ColorToken } from '../theme/colors';

type ProductActionSheetProps = {
  visible: boolean;
  productName: string;
  productImageUrl?: string | null;
  onDismiss: () => void;
  onDuplicate: () => void;
  onDeactivate: () => void;
};

/**
 * Long-press quick actions for a product card on the Products list — see
 * DuplicateProductSheet.tsx for what happens after tapping Duplicate,
 * and the product detail screen's own ConfirmDialog for the matching
 * "Deactivate this product?" copy this reuses the same wording for.
 */
export function ProductActionSheet({
  visible,
  productName,
  productImageUrl,
  onDismiss,
  onDuplicate,
  onDeactivate,
}: ProductActionSheetProps) {
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss}>
      <View style={styles.header}>
        {productImageUrl ? (
          <Image source={{ uri: productImageUrl }} style={styles.thumbnail} />
        ) : (
          <View style={styles.thumbnailPlaceholder}>
            <Ionicons name="image-outline" size={20} color={colors.textSecondary} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName} numberOfLines={1}>
            {productName}
          </Text>
          <Text style={styles.headerSubtitle}>Tap an action below</Text>
        </View>
      </View>

      <ActionRow icon="copy-outline" label="Duplicate" onPress={onDuplicate} styles={styles} colors={colors} />
      <ActionRow
        icon="ban-outline"
        label="Deactivate"
        destructive
        onPress={onDeactivate}
        styles={styles}
        colors={colors}
      />
    </BottomSheet>
  );
}

function ActionRow({
  icon,
  label,
  destructive,
  onPress,
  styles,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  destructive?: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  colors: Record<ColorToken, string>;
}) {
  const press = usePressScale();
  const tint = destructive ? colors.danger : colors.textPrimary;

  return (
    <Pressable onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="button">
      <Animated.View
        style={[styles.row, destructive ? styles.rowDestructive : styles.rowDefault, press.style]}
      >
        <View style={styles.iconTile}>
          <Ionicons name={icon} size={17} color={tint} />
        </View>
        <Text style={[styles.rowLabel, { color: tint }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    thumbnail: {
      width: 48,
      height: 48,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceMuted,
    },
    thumbnailPlaceholder: {
      width: 48,
      height: 48,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerName: { ...typography.titleSm, color: colors.textPrimary },
    headerSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      minHeight: 56,
      borderRadius: radii.md,
      marginBottom: spacing.sm,
    },
    rowDefault: { backgroundColor: colors.surfaceMuted },
    rowDestructive: { backgroundColor: colors.dangerMuted },
    iconTile: {
      width: 32,
      height: 32,
      borderRadius: radii.sm,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowLabel: { ...typography.body, fontWeight: '600' },
  });
}