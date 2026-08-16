import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../theme';

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message: string;
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
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
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

const styles = StyleSheet.create({
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
