import React, {useEffect, useRef} from 'react';
import {Animated, Easing, StyleProp, ViewStyle} from 'react-native';
import {s} from './theme';

/**
 * Motion for the key moments: things arrive, pop, shake ("not that one") or twinkle.
 * Short, and transform/opacity only, so every animation runs on the native driver and stays smooth
 * on a 32-bit TV stick. Loops are single native timings (no Animated.sequence, which loops on JS).
 */

type From = 'fade' | 'up' | 'right' | 'pop';
type Props = {style?: StyleProp<ViewStyle>; children?: React.ReactNode};

/** Plays once when the component mounts. */
function useOnce(make: (v: Animated.Value) => Animated.CompositeAnimation) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = make(v);
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return v;
}

/** Repeats forever: v runs 0 → 1 over `period` ms, linearly, as one native loop (paused, at 0, while `run` is false). */
export function useForever(period: number, delay = 0, run = true) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!run) {
      v.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.timing(v, {toValue: 1, duration: period, easing: Easing.linear, useNativeDriver: true}));
    const timer = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [v, period, delay, run]);
  return v;
}

/** A smooth there-and-back (cosine) between `lo` and `hi` as v runs 0 → 1, for native loops. */
export function wave(v: Animated.Value, lo: number, hi: number) {
  const inputRange = Array.from({length: 9}, (_, i) => i / 8);
  return v.interpolate({inputRange, outputRange: inputRange.map(x => lo + ((hi - lo) * (1 - Math.cos(2 * Math.PI * x))) / 2)});
}

/** Comes in once on mount: fades in while sliding up, sliding in from the right, or popping (grows with a bounce). */
export function Appear({from = 'up', delay = 0, distance = s(40), style, children}: Props & {from?: From; delay?: number; distance?: number}) {
  const v = useOnce(value =>
    Animated.timing(value, {
      toValue: 1,
      delay,
      duration: from === 'pop' ? 460 : from === 'fade' ? 220 : 340,
      easing: from === 'pop' ? Easing.out(Easing.back(2)) : Easing.out(Easing.cubic),
      useNativeDriver: true,
    }),
  );
  const opacity = v.interpolate({inputRange: [0, 0.5, 1], outputRange: [0, 1, 1], extrapolate: 'clamp'});
  const transform =
    from === 'pop'
      ? [{scale: v.interpolate({inputRange: [0, 1], outputRange: [0.3, 1]})}]
      : from === 'up'
        ? [{translateY: v.interpolate({inputRange: [0, 1], outputRange: [distance, 0]})}]
        : from === 'right'
          ? [{translateX: v.interpolate({inputRange: [0, 1], outputRange: [distance, 0]})}]
          : [];
  return <Animated.View style={[style, {opacity, transform}]}>{children}</Animated.View>;
}

/** Shakes side to side, gently, each time `trigger` changes (not on mount). */
export function Shake({trigger, style, children}: Props & {trigger: unknown}) {
  const v = useRef(new Animated.Value(0)).current;
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    v.setValue(0);
    Animated.timing(v, {toValue: 1, duration: 420, easing: Easing.linear, useNativeDriver: true}).start();
  }, [trigger, v]);
  const translateX = v.interpolate({inputRange: [0, 0.14, 0.3, 0.46, 0.62, 0.8, 1], outputRange: [0, -1, 0.85, -0.6, 0.4, -0.15, 0].map(k => k * s(18))});
  return <Animated.View style={[style, {transform: [{translateX}]}]}>{children}</Animated.View>;
}

/** Pulses and turns a little, forever (sparkles on a moment's screen, not on the board). */
export function Twinkle({delay = 0, style, children}: Props & {delay?: number}) {
  const v = useForever(1500, delay);
  const transform = useRef([{scale: wave(v, 0.7, 1.15)}, {rotate: v.interpolate({inputRange: [0, 1], outputRange: ['0deg', '90deg']})}]).current;
  return <Animated.View style={[style, {transform}]}>{children}</Animated.View>;
}

/** Beats gently: "this is the one you would get" (the next star, the next character). */
export function Beat({style, children}: Props) {
  const v = useForever(900);
  const transform = useRef([{scale: wave(v, 0.85, 1.2)}]).current;
  return <Animated.View style={[style, {transform}]}>{children}</Animated.View>;
}

/** Turns over every few seconds, like an hourglass: "waiting". (Our hourglass icon looks the same upside down.) */
export function Flip({every = 2600, style, children}: Props & {every?: number}) {
  const turn = 700;
  const v = useForever(every + turn);
  const h = every / (every + turn);
  // Still, then an eased half-turn at the end of each period.
  const rotate = v.interpolate({
    inputRange: [0, h, h + (1 - h) * 0.25, h + (1 - h) * 0.5, h + (1 - h) * 0.75, 1],
    outputRange: ['0deg', '0deg', '22deg', '90deg', '158deg', '180deg'],
  });
  return <Animated.View style={[style, {transform: [{rotate}]}]}>{children}</Animated.View>;
}
