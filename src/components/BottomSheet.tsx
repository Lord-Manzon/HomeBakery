import { Modal, Pressable, StyleSheet, View, type ModalProps } from 'react-native';
import { colors, radii, spacing } from '../theme';

type BottomSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
  /** Set true while a save is in progress to block tap-outside dismiss,
   * per docs/UI_UX.md: "sheet can't be dismissed mid-save." */
  dismissDisabled?: boolean;
};

/**
 * Built on React Native's built-in Modal — no new dependency, matches
 * docs/AGENTS.md's dependency policy. Not a true native bottom sheet
 * (no drag-to-dismiss gesture), but satisfies the spec's requirements:
 * dismissible by tap-outside, primary action area pinned at the bottom.
 */
export function BottomSheet({ visible, onDismiss, children, dismissDisabled }: BottomSheetProps) {
  const handleBackdropPress = () => {
    if (!dismissDisabled) onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleBackdropPress}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={handleBackdropPress}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    // ASSUMPTION: radii.lg = 16px, matching docs/UI_UX.md section F
    // ("cards and sheets 16px"). Haven't seen src/theme/radii.ts directly
    // — if this key doesn't exist under this name, swap for whatever your
    // actual token is called.
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.xl,
    maxHeight: '85%',
  },
});
