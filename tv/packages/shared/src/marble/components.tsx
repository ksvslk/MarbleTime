import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Animated, Easing, Image, ImageStyle, StyleProp, StyleSheet, Text, TextStyle, TouchableOpacity, View, ViewStyle} from 'react-native';
import {IconName, Shape} from './data';
import {CAPS_WIDTH, CHAR_WIDTH, fitFontSize} from './fit';
import {colors, s} from './theme';

const ICONS: Record<IconName, number> = {
  toys: require('../assets/icons/toys.png'),
  cat: require('../assets/icons/cat.png'),
  tooth: require('../assets/icons/tooth.png'),
  moon: require('../assets/icons/moon.png'),
  hourglass: require('../assets/icons/hourglass.png'),
  thumbs: require('../assets/icons/thumbs.png'),
  play: require('../assets/icons/play.png'),
  speaker: require('../assets/icons/speaker.png'),
  check: require('../assets/icons/check.png'),
  lock: require('../assets/icons/lock.png'),
  lockopen: require('../assets/icons/lockopen.png'),
  undo: require('../assets/icons/undo.png'),
  broom: require('../assets/icons/broom.png'),
  clock: require('../assets/icons/clock.png'),
  shapes: require('../assets/icons/shapes.png'),
  message: require('../assets/icons/message.png'),
  sparkle: require('../assets/icons/sparkle.png'),
};

export const ART = {
  bear: require('../assets/icons/bear.png'),
  bunny: require('../assets/icons/bunny.png'),
  apple: require('../assets/icons/apple.png'),
  logo: require('../assets/icons/logo.png'),
};

/** Monochrome icon from the design, recoloured with tintColor. */
export function Icon({name, size, color = colors.ink, style}: {name: IconName; size: number; color?: string; style?: StyleProp<ImageStyle>}) {
  return <Image source={ICONS[name]} style={[{width: size, height: size, tintColor: color}, style]} resizeMode="contain" />;
}

export function T({style, children, numberOfLines}: {style?: StyleProp<TextStyle>; children: React.ReactNode; numberOfLines?: number}) {
  return <Text style={[styles.text, style]} numberOfLines={numberOfLines}>{children}</Text>;
}

/**
 * Text that always fits its box: the largest size (≤ max) at which it fits `width` in `lines` lines;
 * only at `min` does it cut off with "…". Use it for anything a parent, the AI or a translation can make long.
 * Sizes and width are device px (pass s(designPx)).
 */
export function FitText({text: raw, width, max, min, lines = 1, caps, style}: {text: string; width: number; max: number; min?: number; lines?: number; caps?: string | false; style?: StyleProp<TextStyle>}) {
  // caps = the language tag when kid text is shown in CAPITALS (locale-aware: ß → SS, etc.)
  const text = caps ? raw.toLocaleUpperCase(caps) : raw;
  const minSize = min ?? Math.round(max * 0.45);
  const estimate = useMemo(() => fitFontSize(text, width, max, minSize, lines, caps ? CAPS_WIDTH : CHAR_WIDTH), [text, width, max, minSize, lines, caps]);
  const [size, setSize] = useState(estimate);
  useEffect(() => setSize(estimate), [estimate]);
  return (
    <Text
      style={[styles.text, style, {fontSize: size, lineHeight: Math.round(size * 1.15), maxWidth: width}]}
      numberOfLines={lines}
      ellipsizeMode="tail"
      onTextLayout={e => {
        // Where the platform reports real layout: if the visible lines lost text, step the size down.
        const shown = e.nativeEvent.lines.map(l => l.text).join('');
        if (shown.replace(/\s/g, '').length < text.replace(/\s/g, '').length && size > minSize) {
          setSize(Math.max(minSize, Math.floor(size * 0.9)));
        }
      }}>
      {text}
    </Text>
  );
}

/**
 * A D-pad focusable element. Focus = the white ring (docs/03 §12: the white ring only ever means "selected").
 * `children` can be a function of the focus state.
 */
export function Focusable(props: {
  onPress?: () => void;
  preferred?: boolean;
  style?: StyleProp<ViewStyle>;
  focusedStyle?: StyleProp<ViewStyle>;
  label?: string;
  disabled?: boolean;
  onFocusChange?: (focused: boolean) => void;
  children: React.ReactNode | ((focused: boolean) => React.ReactNode);
}) {
  const [focused, setFocused] = useState(false);
  const change = (f: boolean) => {
    setFocused(f);
    props.onFocusChange?.(f);
  };
  return (
    <TouchableOpacity
      // 1 = no dimming: on TV builds TouchableOpacity also fades on *focus*, which made selected cards look washed out.
      activeOpacity={1}
      onPress={props.onPress}
      onFocus={() => change(true)}
      onBlur={() => change(false)}
      hasTVPreferredFocus={props.preferred}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      disabled={props.disabled}
      style={[styles.ringOff, props.style, focused && styles.ringOn, focused && props.focusedStyle]}>
      {typeof props.children === 'function' ? props.children(focused) : props.children}
    </TouchableOpacity>
  );
}

/** Big pill button: gold = the main action, glass = secondary. */
export function Button({title, icon, onPress, primary, preferred, size = 1}: {title: string; icon?: IconName; onPress: () => void; primary?: boolean; preferred?: boolean; size?: number}) {
  const fg = primary ? colors.ink : colors.white;
  return (
    <Focusable
      preferred={preferred}
      onPress={onPress}
      label={title}
      style={[styles.button, {height: s(124 * size), borderRadius: s(62 * size), paddingHorizontal: s(60 * size), backgroundColor: primary ? colors.gold : colors.chip}]}>
      {icon ? <Icon name={icon} size={s(52 * size)} color={fg} style={{marginRight: s(18 * size)}} /> : null}
      <FitText text={title} width={s(520 * size)} max={s(54 * size)} min={s(30 * size)} style={{color: fg, fontWeight: '700'}} />
    </Focusable>
  );
}

/** One gold marble: 5 minutes of TV. */
export function Marble({size, style}: {size: number; style?: StyleProp<ViewStyle>}) {
  return (
    <View style={[{width: size, height: size, borderRadius: size / 2, backgroundColor: '#E2A92A', borderWidth: Math.max(1, size * 0.04), borderColor: colors.goldEdge, overflow: 'hidden'}, style]}>
      <View style={{position: 'absolute', left: -size * 0.04, top: -size * 0.06, width: size * 0.92, height: size * 0.92, borderRadius: size, backgroundColor: colors.gold}} />
      <View style={{position: 'absolute', left: size * 0.2, top: size * 0.16, width: size * 0.3, height: size * 0.2, borderRadius: size, backgroundColor: 'rgba(255,255,255,0.7)'}} />
    </View>
  );
}

export function MarbleRow({count, size}: {count: number; size: number}) {
  return (
    <View style={[styles.rewardPill, {paddingHorizontal: size * 0.45, paddingVertical: size * 0.3, borderRadius: size}]}>
      {Array.from({length: count}).map((_, i) => (
        <Marble key={i} size={size} style={{marginLeft: i ? size * 0.25 : 0}} />
      ))}
    </View>
  );
}

const JAR_INNER = 384; // design px inside the glass
const PILE_JITTER = [0, 2, -1, 1, -2, 1, -1, 2];

function pile(n: number) {
  const out: {left: number; bottom: number}[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 4);
    const col = i % 4;
    const inRow = Math.min(4, n - row * 4);
    const width = (inRow - 1) * 78 + 72;
    const shift = inRow === 4 ? (row % 2 === 0 ? -20 : 20) : 0;
    out.push({left: (JAR_INNER - width) / 2 + col * 78 + shift, bottom: 14 + row * 70 + PILE_JITTER[i % PILE_JITTER.length]});
  }
  return out;
}

/** The marble jar. `fresh` marbles (the newest) drop in from above with a bounce. */
export function Jar({marbles, fresh = 0, k = 1}: {marbles: number; fresh?: number; k?: number}) {
  const shown = Math.min(marbles, 24);
  const spots = useMemo(() => pile(shown), [shown]);
  const drops = useRef(Array.from({length: Math.max(fresh, 0)}, () => new Animated.Value(-s(560 * k)))).current;
  useEffect(() => {
    Animated.stagger(
      280,
      drops.map(v => Animated.timing(v, {toValue: 0, duration: 900, easing: Easing.bounce, useNativeDriver: true})),
    ).start();
  }, [drops]);
  const d = (px: number) => s(px * k);
  return (
    <View style={{alignItems: 'center'}}>
      <View style={{width: d(300), height: d(60), borderRadius: d(22), backgroundColor: colors.coral, zIndex: 2}} />
      <View style={{width: d(280), height: d(20), borderLeftWidth: d(8), borderRightWidth: d(8), borderColor: colors.glassEdge, backgroundColor: colors.glass}} />
      <View
        style={{
          width: d(400),
          height: d(480),
          borderWidth: d(8),
          borderColor: colors.glassEdge,
          backgroundColor: colors.glass,
          borderTopLeftRadius: d(72),
          borderTopRightRadius: d(72),
          borderBottomLeftRadius: d(96),
          borderBottomRightRadius: d(96),
          overflow: 'hidden',
        }}>
        {spots.map((p, i) => {
          const dropIndex = i - (shown - drops.length);
          const anim = dropIndex >= 0 ? {transform: [{translateY: drops[dropIndex]}]} : null;
          return (
            <Animated.View key={i} style={[{position: 'absolute', left: d(p.left), bottom: d(p.bottom)}, anim]}>
              <Marble size={d(72)} />
            </Animated.View>
          );
        })}
        <View style={{position: 'absolute', left: d(26), top: d(40), width: d(20), height: d(160), borderRadius: d(10), backgroundColor: 'rgba(255,255,255,0.25)'}} />
      </View>
      <View style={{width: d(380), height: d(26), marginTop: d(8), borderRadius: d(190), backgroundColor: 'rgba(10,16,60,0.35)'}} />
    </View>
  );
}

export function Avatar({art, bg, size}: {art: keyof typeof ART; bg: string; size: number}) {
  return (
    <View style={{width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center'}}>
      <Image source={ART[art]} style={{width: size * 0.8, height: size * 0.8}} resizeMode="contain" />
    </View>
  );
}

export function ShapeView({shape, size, color}: {shape: Shape; size: number; color: string}) {
  if (shape === 'circle') return <View style={{width: size, height: size, borderRadius: size / 2, backgroundColor: color}} />;
  if (shape === 'square') return <View style={{width: size * 0.84, height: size * 0.84, margin: size * 0.08, borderRadius: size * 0.12, backgroundColor: color}} />;
  return (
    <View style={{width: size, height: size, alignItems: 'center', justifyContent: 'center'}}>
      <View style={{width: 0, height: 0, borderLeftWidth: size / 2, borderRightWidth: size / 2, borderBottomWidth: size * 0.86, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color}} />
    </View>
  );
}

export function Sparkle({size, style}: {size: number; style?: StyleProp<ImageStyle>}) {
  return <Icon name="sparkle" size={size} color={colors.white} style={style} />;
}

const styles = StyleSheet.create({
  text: {color: colors.white, fontWeight: '600'},
  ringOff: {borderWidth: s(10), borderColor: 'transparent'},
  ringOn: {borderColor: colors.white, transform: [{scale: 1.04}]},
  button: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center'},
  rewardPill: {flexDirection: 'row', backgroundColor: colors.white, alignSelf: 'center'},
});
