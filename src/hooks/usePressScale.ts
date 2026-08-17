import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { motionDuration, motionEasing } from '../theme/motion';

/**
 * Shared "press gives a little" feedback, built on the Motion tokens
 * (see docs/DECISIONS.md's 2026-08-17 "Motion design token system"
 * entry). Wrap the pressable content in Reanimated's `Animated.View`
 * with the returned `style`, and pass `onPressIn`/`onPressOut` straight
 * to the Pressable.
 *
 * Example:
 *   const press = usePressScale();
 *   <Pressable onPressIn={press.onPressIn} onPressOut={press.onPressOut}>
 *     <Animated.View style={press.style}>...</Animated.View>
 *   </Pressable>
 *
 * Kept deliberately subtle (0.96 scale, `fast` duration) — this is meant
 * to read as tactile confirmation, not a bounce/toy animation.
 */
export function usePressScale(targetScale: number = 0.96) {
  const scale = useSharedValue(1);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPressIn = () => {
    scale.value = withTiming(targetScale, {
      duration: motionDuration.instant,
      easing: motionEasing.accelerate,
    });
  };

  const onPressOut = () => {
    scale.value = withTiming(1, {
      duration: motionDuration.fast,
      easing: motionEasing.decelerate,
    });
  };

  return { style, onPressIn, onPressOut };
}
