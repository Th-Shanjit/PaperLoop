import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions,
  Animated, Platform, Modal, StatusBar
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radii, shadows } from '../core/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const PADDING = 8; // Extra breathing room around the highlighted element

export interface TourStep {
  refKey: string;
  title: string;
  description: string;
  tooltipPosition: 'top' | 'bottom';
}

interface SpotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SpotlightTourProps {
  steps: TourStep[];
  refs: Record<string, React.RefObject<any>>;
  visible: boolean;
  onFinish: () => void;
}

const OVERLAY_COLOR = 'rgba(0, 0, 0, 0.72)';
const TOOLTIP_WIDTH = Math.min(SCREEN_W - 48, 340);

export default function SpotlightTour({ steps, refs, visible, onFinish }: SpotlightTourProps) {
  const insets = useSafeAreaInsets();
  const [stepIndex, setStepIndex] = useState(0);
  const [spotRect, setSpotRect] = useState<SpotRect | null>(null);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  const currentStep = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  // Measure the target element and compute the spotlight rect
  const measureTarget = useCallback(() => {
    const ref = refs[currentStep?.refKey];
    if (!ref?.current) {
      // If ref not available, show without spotlight (centered)
      setSpotRect(null);
      return;
    }
    // Delay to ensure layout is settled after step change or modal slide-up animation
    setTimeout(() => {
      try {
        ref.current.measure((x: number, y: number, width: number, height: number, pageX: number, pageY: number) => {
          if (width === 0 && height === 0) {
            setSpotRect(null);
            return;
          }
          
          setSpotRect({
            x: pageX - PADDING,
            y: pageY - PADDING,
            width: width + PADDING * 2,
            height: height + PADDING * 2,
          });
        });
      } catch {
        setSpotRect(null);
      }
    }, stepIndex === 0 ? 450 : 150); // Give modal slide-up time to finish on step 0
  }, [currentStep, refs, stepIndex]);

  // Animate in on show, re-measure on step change
  useEffect(() => {
    if (!visible) {
      fadeAnim.setValue(0);
      setStepIndex(0);
      setSpotRect(null);
      return;
    }
    measureTarget();
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [visible, stepIndex]);

  // Pulsing ring around spotlight
  useEffect(() => {
    if (!visible || !spotRect) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [spotRect, visible]);

  const handleNext = () => {
    if (isLast) {
      onFinish();
    } else {
      setStepIndex(i => i + 1);
    }
  };

  const handlePrev = () => {
    if (stepIndex > 0) setStepIndex(i => i - 1);
  };

  if (!visible || !currentStep) return null;

  // Compute the 4 overlay rectangles
  const spot = spotRect ?? {
    x: SCREEN_W / 2 - 80,
    y: SCREEN_H / 2 - 40,
    width: 160,
    height: 80,
  };

  const rects = {
    top:    { top: 0,                   left: 0,         width: SCREEN_W, height: Math.max(0, spot.y) },
    bottom: { top: spot.y + spot.height, left: 0,        width: SCREEN_W, height: Math.max(0, SCREEN_H - spot.y - spot.height) },
    left:   { top: spot.y,              left: 0,         width: Math.max(0, spot.x),                  height: spot.height },
    right:  { top: spot.y,              left: spot.x + spot.width, width: Math.max(0, SCREEN_W - spot.x - spot.width), height: spot.height },
  };

  // Decide where to place the tooltip card
  const spotCenterX = spot.x + spot.width / 2;
  const spaceAbove = spot.y;
  const spaceBelow = SCREEN_H - spot.y - spot.height;
  const tooltipPreferredPos = currentStep.tooltipPosition;

  let tooltipTop: number;
  if (tooltipPreferredPos === 'top' && spaceAbove > 160) {
    tooltipTop = spot.y - 160;
  } else if (spaceBelow > 160) {
    tooltipTop = spot.y + spot.height + 16;
  } else {
    tooltipTop = spot.y - 160;
  }

  const tooltipLeft = Math.max(16, Math.min(spotCenterX - TOOLTIP_WIDTH / 2, SCREEN_W - TOOLTIP_WIDTH - 16));

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.root, { opacity: fadeAnim }]}
        pointerEvents="box-none"
      >
        {/* ---- 4-RECT OVERLAY (creates the hole) ---- */}
        <View style={[styles.overlayRect, rects.top]} pointerEvents="none" />
        <View style={[styles.overlayRect, rects.bottom]} pointerEvents="none" />
        <View style={[styles.overlayRect, rects.left]} pointerEvents="none" />
        <View style={[styles.overlayRect, rects.right]} pointerEvents="none" />

        {/* ---- PULSING RING around the spotlight ---- */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pulseRing,
            {
              top: spot.y - 3,
              left: spot.x - 3,
              width: spot.width + 6,
              height: spot.height + 6,
              borderRadius: 12,
              transform: [{ scale: pulseAnim }],
            },
          ]}
        />

        {/* ---- TOOLTIP CARD ---- */}
        <View
          style={[
            styles.tooltipCard,
            {
              top: tooltipTop,
              left: tooltipLeft,
              width: TOOLTIP_WIDTH,
            },
          ]}
        >
          {/* Arrow indicator pointing toward the spotlight */}
          <View style={styles.tooltipHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepCounter}>{stepIndex + 1} of {steps.length}</Text>
              <Text style={styles.tooltipTitle}>{currentStep.title}</Text>
            </View>
            <TouchableOpacity onPress={onFinish} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <Text style={styles.tooltipDesc}>{currentStep.description}</Text>

          {/* Progress dots */}
          <View style={styles.dotsRow}>
            {steps.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === stepIndex && styles.dotActive]}
              />
            ))}
          </View>

          {/* Navigation buttons */}
          <View style={styles.navRow}>
            {stepIndex > 0 ? (
              <TouchableOpacity onPress={handlePrev} style={styles.prevBtn}>
                <Ionicons name="arrow-back" size={16} color="#6B7280" />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 36 }} />
            )}

            <TouchableOpacity onPress={handleNext} style={styles.nextBtn}>
              <Text style={styles.nextBtnText}>{isLast ? 'Finish Tour' : 'Next'}</Text>
              {!isLast && <Ionicons name="arrow-forward" size={15} color="white" style={{ marginLeft: 4 }} />}
            </TouchableOpacity>
          </View>
        </View>

        {/* Full-screen tap area (tap outside tooltip to advance) */}
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={handleNext}
        />
        {/* But make the tooltip itself not propagate taps upward */}
        <View
          style={[
            styles.tooltipTapBlocker,
            { top: tooltipTop, left: tooltipLeft, width: TOOLTIP_WIDTH },
          ]}
          pointerEvents="box-none"
        />
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    zIndex: 9999,
    elevation: 9999,
  },
  overlayRect: {
    position: 'absolute',
    backgroundColor: OVERLAY_COLOR,
  },
  pulseRing: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
  },
  tooltipCard: {
    position: 'absolute',
    backgroundColor: colors.background.normal,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 20,
    zIndex: 10000,
  },
  tooltipTapBlocker: {
    position: 'absolute',
    height: 220,
    zIndex: 10001,
  },
  tooltipHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  stepCounter: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary.normal,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  tooltipTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.label.normal,
    lineHeight: 24,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.background.alternative,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  tooltipDesc: {
    fontSize: 14,
    color: colors.label.alternative,
    lineHeight: 21,
    marginBottom: 16,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    marginBottom: 14,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.line.normal,
  },
  dotActive: {
    width: 18,
    backgroundColor: colors.primary.normal,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  prevBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background.alternative,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextBtn: {
    flex: 1,
    height: 42,
    backgroundColor: colors.primary.normal,
    borderRadius: 21,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary.normal,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  nextBtnText: {
    color: colors.background.normal,
    fontSize: 14,
    fontWeight: '700',
  },
});
