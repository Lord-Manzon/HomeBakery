import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { BottomSheet } from './BottomSheet';
import { usePressScale } from '../hooks/usePressScale';
import { useThemeColors } from '../theme/ThemeContext';
import { radii, spacing, typography } from '../theme';
import type { ColorToken } from '../theme/colors';

type OrderActionSheetProps = {
  visible: boolean;
  customerName: string;
  canRevertDelivered: boolean;
  canRevertPaid: boolean;
  canCancel: boolean;
  fulfillmentType: 'pickup' | 'delivery';
  onDismiss: () => void;
  onRevertDelivered: () => void;
  onRevertPaid: () => void;
  onCancel: () => void;
  onDelete: () => void;
};

/**
 * Long-press quick actions for an order card on the Orders list -- see
 * ProductActionSheet.tsx for the identical pattern this reuses. Replaces
 * the standalone orders/[id]/index.tsx Detail screen's header trash icon
 * and its inline-confirm rows for Cancel/Revert Delivered/Revert Paid.
 * Cancel and Delete each open a ConfirmDialog after this sheet closes --
 * see the Orders list screen for that wiring -- rather than
 * inline-confirm-in-place, since that pattern doesn't fit inside a list
 * row the way it did on a full-screen Detail view.
 */
export function OrderActionSheet({
  visible,
  customerName,
  canRevertDelivered,
  canRevertPaid,
  canCancel,
  fulfillmentType,
  onDismiss,
  onRevertDelivered,
  onRevertPaid,
  onCancel,
  onDelete,
}: OrderActionSheetProps) {
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss}>
      <View style={styles.header}>
        <Text style={styles.headerName} numberOfLines={1}>
          {customerName}
        </Text>
        <Text style={styles.headerSubtitle}>Tap an action below</Text>
      </View>

      {canRevertDelivered ? (
        <ActionRow
          icon="arrow-undo-outline"
          label={`Mark as not ${fulfillmentType === 'delivery' ? 'delivered' : 'picked up'}`}
          onPress={onRevertDelivered}
          styles={styles}
          colors={colors}
        />
      ) : null}
      {canRevertPaid ? (
        <ActionRow
          icon="arrow-undo-outline"
          label="Mark as unpaid"
          onPress={onRevertPaid}
          styles={styles}
          colors={colors}
        />
      ) : null}
      {canCancel ? (
        <ActionRow
          icon="close-circle-outline"
          label="Cancel order"
          destructive
          onPress={onCancel}
          styles={styles}
          colors={colors}
        />
      ) : null}
      <ActionRow icon="trash-outline" label="Delete order" destructive onPress={onDelete} styles={styles} colors={colors} />
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
    header: { marginBottom: spacing.lg },
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