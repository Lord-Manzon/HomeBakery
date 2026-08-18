import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../theme/ThemeContext';
import { radii, spacing, motionDuration, motionEasingCurve, motionSpring } from '../theme';
import type { ColorToken } from '../theme/colors';

// BottomSheet's drag-to-dismiss is tied to PanResponder + core RN
// `Animated`, not Reanimated — see docs/DECISIONS.md's 2026-08-17 entry
// for why this stayed as-is rather than being rewritten. Durations and
// curve shape still come from the shared Motion tokens (theme/motion.ts)
// via motionEasingCurve, since core Animated's Easing.bezier() and
// Reanimated's are different objects but accept the same numbers.
const sheetEasingIn = Easing.bezier(...motionEasingCurve.decelerate);
const sheetEasingOut = Easing.bezier(...motionEasingCurve.accelerate);

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
 *
 * FIXED 2026-08-17: the numeric keyboard was covering whichever field
 * was focused (Quantity, Low-stock alert, Restock's Total cost paid,
 * Use/waste's Quantity, etc.) — nothing here was reacting to the
 * keyboard opening at all. Two different fixes, one per platform,
 * because they need genuinely different approaches:
 * - iOS: ScrollView's `automaticallyAdjustKeyboardInsets` (core RN,
 *   0.71+) — the ScrollView itself insets its content around the
 *   keyboard. No manual listener needed.
 * - Android: `automaticallyAdjustKeyboardInsets` is iOS-only. Android
 *   Modals render as a separate Dialog window that does NOT
 *   automatically inherit the Activity's adjustResize behavior — this
 *   is a well-known RN Modal limitation, not something fixable via
 *   app.json alone. Instead, a Keyboard listener tracks the keyboard's
 *   height and the sheet's `bottom` offset is shifted up by that amount
 *   (and `maxHeight` recalculated) so the sheet visually rises above the
 *   keyboard instead of being covered by it.
 *
 * MERGED 2026-08-18: combined with the theme-reactive / motion-token
 * rewrite from the product-screen branch (colors via useThemeColors(),
 * easing/spring values from theme/motion.ts) — see docs/DECISIONS.md.
 * Neither branch's fix is dropped: this file has both the Android
 * keyboard handling AND the theme-reactive styling.
 */
export function BottomSheet({ visible, onDismiss, children, dismissDisabled }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const [androidKeyboardHeight, setAndroidKeyboardHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const showSub = Keyboard.addListener('keyboardDidShow', (e) =>
      setAndroidKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setAndroidKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (visible) {
      sheetTranslateY.setValue(SCREEN_HEIGHT);
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: motionDuration.medium,
          easing: sheetEasingIn,
          useNativeDriver: true,
        }),
        Animated.timing(sheetTranslateY, {
          toValue: 0,
          duration: motionDuration.medium,
          easing: sheetEasingIn,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const animateOutAndDismiss = () => {
    if (dismissDisabled) return;
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: motionDuration.fast,
        easing: sheetEasingOut,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: SCREEN_HEIGHT,
        duration: motionDuration.medium,
        easing: sheetEasingOut,
        useNativeDriver: true,
      }),
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
          Animated.spring(sheetTranslateY, {
            toValue: 0,
            damping: motionSpring.gentle.damping,
            stiffness: motionSpring.gentle.stiffness,
            mass: motionSpring.gentle.mass,
            useNativeDriver: true,
          }).start();
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
          {
            paddingBottom: spacing.xxl + insets.bottom,
            bottom: androidKeyboardHeight,
            maxHeight:
              androidKeyboardHeight > 0
                ? SCREEN_HEIGHT - androidKeyboardHeight - insets.top - spacing.xl
                : '85%',
          },
          { transform: [{ translateY: sheetTranslateY }] },
        ]}
      >
        <View style={styles.dragHandleArea} {...panResponder.panHandlers}>
          <View style={styles.dragHandle} />
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets
        >
          {children}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// See FormField.tsx for why styles are built per-render from the theme
// palette instead of a static module-level StyleSheet.create().
function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
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
}
