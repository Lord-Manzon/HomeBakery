import { useEffect, useMemo } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, runOnJS } from 'react-native-reanimated';
import { useThemeColors } from '../theme/ThemeContext';
import { radii, motionDuration, motionEasing } from '../theme';
import type { ColorToken } from '../theme/colors';

const DEFAULT_SNAP_POINTS = [0, 25, 50, 75, 100];
const SNAP_THRESHOLD = 4; // percent — how close a drag has to land to lock to a snap point
const THUMB_SIZE = 26;
const TRACK_HEIGHT = 8;

type UsageSliderProps = {
  /** Current value, 0-100. */
  percent: number;
  /** Fired continuously while dragging, and on tap-to-jump. Always an already-snapped, rounded integer. */
  onChange: (percent: number) => void;
  /** Points (0-100) the thumb snaps toward when a drag lands nearby. */
  snapPoints?: number[];
  disabled?: boolean;
  accessibilityLabel?: string;
};

function snapNearby(raw: number, snapPoints: number[]): number {
  'worklet';
  for (const point of snapPoints) {
    if (Math.abs(raw - point) < SNAP_THRESHOLD) return point;
  }
  return raw;
}

/**
 * Draggable 0-100% slider with soft snap points — built for
 * UseWasteSheet ("I used half of the thing" -> drag to the middle,
 * snaps cleanly to 50%) but kept generic/reusable. Tap anywhere on the
 * track to jump there, or drag the thumb from wherever it currently
 * is — both paths share the same onStart/onUpdate math (position-based,
 * not translation-based) so they can never disagree.
 *
 * Built on react-native-gesture-handler's modern Gesture API rather
 * than core RN's PanResponder (which BottomSheet.tsx intentionally
 * keeps for its own historical reasons — see docs/DECISIONS.md's
 * 2026-08-17 entry) — gesture-handler is Reanimated's paired gesture
 * library, matching "Reanimated is the standard going forward" for new
 * work.
 */
export function UsageSlider({
  percent,
  onChange,
  snapPoints = DEFAULT_SNAP_POINTS,
  disabled = false,
  accessibilityLabel = 'Amount',
}: UsageSliderProps) {
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const trackWidth = useSharedValue(0);
  const thumbPosition = useSharedValue(percent);

  // Keep the shared value in sync when `percent` changes from OUTSIDE a
  // drag — tapping a quick-chip or typing in the manual field both set
  // `percent` from the parent, and without this the thumb wouldn't move
  // to match.
  useEffect(() => {
    thumbPosition.value = withTiming(percent, {
      duration: motionDuration.fast,
      easing: motionEasing.standard,
    });
  }, [percent]);

  function updateFromX(x: number) {
    'worklet';
    if (trackWidth.value <= 0) return;
    const raw = Math.max(0, Math.min(100, (x / trackWidth.value) * 100));
    const snapped = snapNearby(raw, snapPoints);
    thumbPosition.value = snapped;
    runOnJS(onChange)(Math.round(snapped));
  }

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .onStart((e) => updateFromX(e.x))
    .onUpdate((e) => updateFromX(e.x));

  function handleLayout(e: LayoutChangeEvent) {
    trackWidth.value = e.nativeEvent.layout.width;
  }

  const thumbStyle = useAnimatedStyle(() => ({
    left: `${thumbPosition.value}%`,
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: `${thumbPosition.value}%`,
  }));

  return (
    <GestureDetector gesture={pan}>
      <View
        style={[styles.wrap, disabled && styles.wrapDisabled]}
        onLayout={handleLayout}
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(percent) }}
      >
        <View style={styles.track}>
          <Animated.View style={[styles.fill, fillStyle]} />
          {snapPoints
            .filter((p) => p !== 0 && p !== 100)
            .map((p) => (
              <View key={p} style={[styles.snapDot, { left: `${p}%` }]} pointerEvents="none" />
            ))}
          {/*
            Thumb lives INSIDE track (not as a sibling in `wrap`) so its
            `top: 50%` resolves against track's own fixed TRACK_HEIGHT
            (8px) rather than wrap's implicit/auto height (paddingVertical
            + track height, computed by Yoga) — percentage positioning
            against an auto-sized parent doesn't always resolve
            pixel-perfectly, which was making the thumb sit slightly off
            the track's centerline. `overflow: visible` isn't set on
            `track` (RN's View default), so the thumb — bigger than the
            8px track — still renders fully rather than getting clipped.
          */}
          <Animated.View style={[styles.thumb, thumbStyle]} pointerEvents="none" />
        </View>
      </View>
    </GestureDetector>
  );
}

function makeStyles(colors: Record<ColorToken, string>) {
  return StyleSheet.create({
    wrap: {
      paddingVertical: 14,
      justifyContent: 'center',
    },
    wrapDisabled: {
      opacity: 0.5,
    },
    track: {
      height: TRACK_HEIGHT,
      borderRadius: radii.full,
      backgroundColor: colors.border,
    },
    fill: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      borderRadius: radii.full,
      backgroundColor: colors.primary,
    },
    snapDot: {
      position: 'absolute',
      top: '50%',
      width: 3,
      height: 3,
      borderRadius: 2,
      backgroundColor: colors.surface,
      marginTop: -1.5,
      marginLeft: -1.5,
    },
    thumb: {
      position: 'absolute',
      top: '50%',
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      marginTop: -THUMB_SIZE / 2,
      marginLeft: -THUMB_SIZE / 2,
      borderRadius: THUMB_SIZE / 2,
      backgroundColor: colors.surface,
      borderWidth: 3,
      borderColor: colors.primary,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 3,
    },
  });
}