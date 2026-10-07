import React, {memo, useEffect, useMemo, useRef} from 'react';
import {Animated, Easing, StyleSheet} from 'react-native';
import {SvgXml} from 'react-native-svg';
import type {CharacterArt, CharacterPart, Speech} from './api';
import {mouthFrames, placer, riderOf} from './characters';
import {useForever, wave as thereAndBack} from './motion';
import {Sound} from './sound';

/**
 * A kid's character, alive. Each layer is one small SVG from the backend; named parts move around their pivots:
 * idle, it breathes, blinks, tilts its head and sways its arms (unless `still`); `cheer` and `wave` (counters) make
 * it hop twice or wave each time they change; with `speech`, the mouth follows the line's viseme marks while the line
 * plays.
 * Like the rest of the app's motion: transforms only, single native timings, smooth on the stick.
 */

type Point = readonly [number, number];
// React Native's transform list, with animated values in it.
type Transform = Record<string, unknown>[];

/** Transforms that act around the point p of a size × size view (React Native's act around its centre). */
const around = ([x, y]: Point, size: number, inner: Transform): Transform => [
  {translateX: x - size / 2},
  {translateY: y - size / 2},
  ...inner,
  {translateX: size / 2 - x},
  {translateY: size / 2 - y},
];


/** An angle that follows v through keyframes (degrees), for a native rotate. */
const turn = (v: Animated.Value, inputRange: number[], degrees: number[]) => v.interpolate({inputRange, outputRange: degrees.map(d => `${d}deg`)});
const LOOP = Array.from({length: 9}, (_, i) => i / 8);
const swing = (amplitude: number, phase = 0) => LOOP.map(x => amplitude * Math.sin(2 * Math.PI * x + phase));
// Arms only wiggle around the pose they were drawn in (hanging, held out or raised: any way reads as joy);
// the right arm mirrors the left. A cheer flaps both during the hops; a wave wiggles the right one.
const FLAP_AT = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.85, 1];
const FLAP = [0, 20, -14, 20, -14, 20, -14, 16, -6, 0];
const WAVE_AT = [0, 0.12, 0.25, 0.38, 0.5, 0.62, 0.75, 0.88, 1];
const WAVE = [0, -22, 16, -22, 16, -22, 16, -10, 0];

export const CharacterView = memo(function CharacterView({
  art,
  size,
  cheer = 0,
  wave = 0,
  still = false,
  speech,
}: {
  art: CharacterArt;
  size: number;
  cheer?: number;
  wave?: number;
  /** No idle motion (a gallery card that isn't selected): cheaper when many are on screen. */
  still?: boolean;
  speech?: Speech | null;
}) {
  const breath = useForever(3200, 0, !still);
  const blink = useForever(4300, 700, !still);
  const sway = useForever(5200, 300, !still);
  const hop = useRef(new Animated.Value(1)).current; // 0 → 1 plays one cheer; 1 is at rest
  const lift = useRef(new Animated.Value(0)).current; // 0 → 1 plays one wave
  const talk = useRef(new Animated.Value(0)).current; // ms into the line

  useEffect(() => {
    if (!cheer) return;
    hop.setValue(0);
    const anim = Animated.timing(hop, {toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true});
    anim.start();
    return () => anim.stop();
  }, [cheer, hop]);

  useEffect(() => {
    if (!wave) return;
    lift.setValue(0);
    const anim = Animated.timing(lift, {toValue: 1, delay: 300, duration: 2200, easing: Easing.linear, useNativeDriver: true});
    anim.start();
    return () => anim.stop();
  }, [wave, lift]);

  // The mouth moves while this character's own line plays (the read-aloud before it leaves the mouth shut).
  const frames = useMemo(() => (speech ? mouthFrames(speech) : null), [speech]);
  useEffect(() => {
    if (!speech || !frames) return;
    const end = frames.times[frames.times.length - 1];
    let anim: Animated.CompositeAnimation | undefined;
    const off = Sound.onLine(event => {
      if (event.uri !== speech.audioUrl) return;
      anim?.stop();
      talk.setValue(0);
      if (event.state !== 'start') return;
      anim = Animated.timing(talk, {toValue: end, duration: end, easing: Easing.linear, useNativeDriver: true});
      anim.start();
    });
    return () => {
      off();
      anim?.stop();
      talk.setValue(0);
    };
  }, [speech, frames, talk]);

  const place = useMemo(() => placer(art.viewBox, size), [art.viewBox, size]);
  const pivotOf = (part: CharacterPart) => art.layers.find(l => l.part === part && !l.parent && l.pivot)?.pivot;
  const neck = pivotOf('head');
  // Without a body pivot it breathes from the bottom centre of its box.
  const box = art.viewBox.split(/[\s,]+/).map(Number);
  const feet: Point = pivotOf('body') ?? (box.length === 4 && box.every(Number.isFinite) ? [box[0] + box[2] / 2, box[1] + box[3]] : [256, 512]);

  const motion = useMemo(() => {
    const eyes = blink.interpolate({inputRange: [0, 0.6, 0.62, 0.64, 0.88, 0.9, 0.92, 1], outputRange: [1, 1, 0.1, 1, 1, 0.1, 1, 1]});
    return {
      eyes,
      armLeft: [{rotate: turn(sway, LOOP, swing(3))}, {rotate: turn(hop, FLAP_AT, FLAP)}],
      armRight: [{rotate: turn(sway, LOOP, swing(-3))}, {rotate: turn(hop, FLAP_AT, FLAP.map(d => -d))}, {rotate: turn(lift, WAVE_AT, WAVE)}],
      tilt: turn(sway, LOOP, swing(2, 1)),
      jump: hop.interpolate({inputRange: [0, 0.2, 0.4, 0.5, 0.7, 0.9, 1], outputRange: [0, -1, 0, 0, -0.7, 0, 0].map(k => k * size * 0.1)}),
      breatheX: thereAndBack(breath, 1, 0.992),
      breatheY: thereAndBack(breath, 1, 1.02),
    };
  }, [blink, hop, sway, lift, breath, size]);

  const mouth = useMemo(
    () =>
      frames
        ? {
            x: talk.interpolate({inputRange: frames.times, outputRange: frames.wide.map(w => 1 + 0.2 * w), extrapolate: 'clamp'}),
            y: talk.interpolate({inputRange: frames.times, outputRange: frames.open.map(o => 1 + 0.9 * o), extrapolate: 'clamp'}),
          }
        : {x: 1, y: 1},
    [frames, talk],
  );

  const layers = useMemo(() => {
    /** How a part moves, around its pivot. */
    const moves = (part: CharacterPart | undefined, pivot: Point | undefined): Transform => {
      if (!part || !pivot) return [];
      const p = place(pivot);
      switch (part) {
        case 'head':
          return around(p, size, [{rotate: motion.tilt}]);
        case 'eye-left':
        case 'eye-right':
          return around(p, size, [{scaleY: motion.eyes}]);
        case 'mouth':
          return around(p, size, [{scaleX: mouth.x}, {scaleY: mouth.y}]);
        case 'arm-left':
          return around(p, size, motion.armLeft);
        case 'arm-right':
          return around(p, size, motion.armRight);
        default:
          return [];
      }
    };
    return art.layers.map((layer, i) => {
      // A layer drawn inside another part (eyes in the head, a held thing in a hand) first moves with that part.
      const rider = riderOf(layer, neck);
      const transform: Transform = [...(rider ? moves(rider, pivotOf(rider)) : []), ...moves(layer.part, layer.pivot)];
      return (
        // eslint-disable-next-line react/no-array-index-key -- layers never reorder
        <Animated.View key={i} pointerEvents="none" style={[StyleSheet.absoluteFill, {transform} as object]}>
          <SvgXml xml={layer.svg} width={size} height={size} onError={() => {}} />
        </Animated.View>
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pivotOf and neck follow art.layers
  }, [art.layers, place, size, motion, mouth]);

  const body: Transform = [{translateY: motion.jump}, ...around(place(feet), size, [{scaleX: motion.breatheX}, {scaleY: motion.breatheY}])];
  return (
    <Animated.View pointerEvents="none" style={[{width: size, height: size}, {transform: body} as object]}>
      {layers}
    </Animated.View>
  );
});
