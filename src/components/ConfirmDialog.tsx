import { useMemo, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../theme/ThemeContext';
import { radii, spacing, typography } from '../theme';
import type { ColorToken } from '../theme/colors';

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  /** Plain-text body -- the default for simple confirmations (e.g.
   * ingredient deletion). Ignored when `children` is provided. */
  message?: string;
  /** Structured body content for cases a single string can't represent
   * well (e.g. a scannable per-item list instead of a run-on paragraph).
   * When set, this renders in place of `message` -- see Production's
   * insufficient-ingredients confirm for the motivating case,
   * 2026-08-31. */
  children?: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Centered modal dialog for destructive, high-stakes confirmations.
 * Per docs/UI_UX.md, inline confirm (swap the trigger button in place)
 * is the DEFAULT pattern for deletes in this app — this modal dialog is
 * the explicitly-reserved exception for cases called out as needing more
 * ceremony. Used for ingredient deletion per direct request 2026-08-15 —
 * docs/UI_UX.md and docs/DECISIONS.md need a follow-up note reflecting
 * this as an intentional exception, not an oversight.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  children,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {children ? children : <Text style={styles.message}>{message}</Text>}
          <View style={styles.buttonRow}>
            <Pressable style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.confirmButton} onPress={onConfirm}>
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// See FormField.tsx for why styles are built per-render from the theme
// palette instead of a static module-level StyleSheet.create().
function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    card: {
      width: '100%',
      maxWidth: 340,
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      padding: spacing.xl,
    },
    title: { ...typography.titleLg, color: colors.textPrimary, marginBottom: spacing.sm },
    message: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xl },
    buttonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
    cancelButton: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radii.md,
      minHeight: 44,
      justifyContent: 'center',
    },
    cancelText: { ...typography.body, color: colors.textPrimary },
    confirmButton: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radii.md,
      backgroundColor: colors.danger,
      minHeight: 44,
      justifyContent: 'center',
    },
    confirmText: { ...typography.body, color: colors.textInverse, fontWeight: '600' },
  });
}
