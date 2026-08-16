import { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '../theme';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const DISMISS_THRESHOLD = 120; // px dragged down before we treat it as "let go"

type BottomSheetProps = {
  visible: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
  /** Blocks tap-outside AND drag-to-dismiss while a save is in progress,
   * per docs/UI_UX.md: "sheet can't be dismissed mid-save." */
  dismissDisabled?: boolean;
};

/**
 * Rebuilt 2026-08-15 to fix two problems with the original version:
 * (1) Modal's built-in animationType="slide" animated the backdrop dim
 * together with the sheet, making the dim visibly "rise" up the screen
 * instead of fading in place — backdrop fade and sheet slide are now two
 * independent Animated values, driven manually instead of by Modal.
 * (2) Added real drag-to-dismiss via PanResponder (React Native core, no
 * new dependency) — dragging the sheet down past a threshold dismisses
 * it, not just tapping outside.
 * Also wraps children in a ScrollView so content can't silently get
 * clipped when it's taller than the sheet's max height (Android in
 * particular clips overflow content in a bounded View by default).
 *
 * FIXED 2026-08-16: bottom padding was a fixed spacing.xxl, which isn't
 * enough to clear a gesture-nav or 3-button nav bar on some devices —
 * the primary action button (Save, Add ingredient, etc.) ended up
 * sitting almost behind the system nav bar. Now adds
 * useSafeAreaInsets().bottom on top of the fixed padding so it always
 * clears the system bar regardless of device/nav style.
 */
export function BottomSheet({ visible, onDismiss, children, dismissDisabled }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    if (visible) {
      sheetTranslateY.setValue(SCREEN_HEIGHT);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(sheetTranslateY, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const animateOutAndDismiss = () => {
    if (dismissDisabled) return;
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(sheetTranslateY, { toValue: SCREEN_HEIGHT, duration: 200, useNativeDriver: true }),
    ]).start(() => onDismiss());
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) sheetTranslateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > DISMISS_THRESHOLD) {
          animateOutAndDismiss();
        } else {
          Animated.spring(sheetTranslateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={animateOutAndDismiss}
      statusBarTranslucent
    >
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={animateOutAndDismiss} />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: spacing.xxl + insets.bottom },
          { transform: [{ translateY: sheetTranslateY }] },
        ]}
      >
        <View style={styles.dragHandleArea} {...panResponder.panHandlers}>
          <View style={styles.dragHandle} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    maxHeight: '85%',
  },
  dragHandleArea: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
});
