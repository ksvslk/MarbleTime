import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Animated, Easing, Image, ImageStyle, StyleProp, StyleSheet, Text, TextStyle, TouchableOpacity, View, ViewStyle} from 'react-native';
import {IconName} from './data';
import {CAPS_WIDTH, CHAR_WIDTH, fitFontSize, LINE_HEIGHT, linesAllowed} from './fit';
import {Sound} from './sound';
import {JAR, JAR_CAPACITY, jarDrops, radiusFor} from './physics';
import {colors, s} from './theme';

const ICONS: Record<IconName, number> = {
  // Job icons (JOB_ICONS in data.ts).
  toys: require('../assets/icons/toys.png'),
  cat: require('../assets/icons/cat.png'),
  tooth: require('../assets/icons/tooth.png'),
  moon: require('../assets/icons/moon.png'),
  broom: require('../assets/icons/broom.png'),
  bed: require('../assets/icons/bed.png'),
  shirt: require('../assets/icons/shirt.png'),
  laundry: require('../assets/icons/laundry.png'),
  trash: require('../assets/icons/trash.png'),
  recycle: require('../assets/icons/recycle.png'),
  table: require('../assets/icons/table.png'),
  cook: require('../assets/icons/cook.png'),
  wash: require('../assets/icons/wash.png'),
  shower: require('../assets/icons/shower.png'),
  bath: require('../assets/icons/bath.png'),
  dog: require('../assets/icons/dog.png'),
  fish: require('../assets/icons/fish.png'),
  bird: require('../assets/icons/bird.png'),
  rabbit: require('../assets/icons/rabbit.png'),
  plant: require('../assets/icons/plant.png'),
  leaf: require('../assets/icons/leaf.png'),
  snow: require('../assets/icons/snow.png'),
  book: require('../assets/icons/book.png'),
  pencil: require('../assets/icons/pencil.png'),
  backpack: require('../assets/icons/backpack.png'),
  music: require('../assets/icons/music.png'),
  paint: require('../assets/icons/paint.png'),
  puzzle: require('../assets/icons/puzzle.png'),
  bike: require('../assets/icons/bike.png'),
  shoes: require('../assets/icons/shoes.png'),
  car: require('../assets/icons/car.png'),
  shopping: require('../assets/icons/shopping.png'),
  spray: require('../assets/icons/spray.png'),
  sofa: require('../assets/icons/sofa.png'),
  lamp: require('../assets/icons/lamp.png'),
  baby: require('../assets/icons/baby.png'),
  heart: require('../assets/icons/heart.png'),
  water: require('../assets/icons/water.png'),
  fruit: require('../assets/icons/fruit.png'),
  veggie: require('../assets/icons/veggie.png'),
  sun: require('../assets/icons/sun.png'),
  mail: require('../assets/icons/mail.png'),
  star: require('../assets/icons/star.png'),
  // Interface icons.
  hourglass: require('../assets/icons/hourglass.png'),
  thumbs: require('../assets/icons/thumbs.png'),
  play: require('../assets/icons/play.png'),
  speaker: require('../assets/icons/speaker.png'),
  check: require('../assets/icons/check.png'),
  lock: require('../assets/icons/lock.png'),
  lockopen: require('../assets/icons/lockopen.png'),
  undo: require('../assets/icons/undo.png'),
  clock: require('../assets/icons/clock.png'),
  shapes: require('../assets/icons/shapes.png'),
  message: require('../assets/icons/message.png'),
  sparkle: require('../assets/icons/sparkle.png'),
  home: require('../assets/icons/home.png'),
  games: require('../assets/icons/games.png'),
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

/**
 * Fredoka (docs/03 §12), one file per weight: the family name picks the weight, so the platform adds no fake bold.
 * A build without the files (Vega, for now) falls back to the system font.
 */
const FREDOKA: Record<string, string> = {
  '300': 'Fredoka-Regular',
  '400': 'Fredoka-Regular',
  normal: 'Fredoka-Regular',
  '500': 'Fredoka-Medium',
  '600': 'Fredoka-SemiBold',
  '700': 'Fredoka-Bold',
  '800': 'Fredoka-Bold',
  '900': 'Fredoka-Bold',
  bold: 'Fredoka-Bold',
};
function fredoka(style: StyleProp<TextStyle>): TextStyle {
  const {fontWeight, ...rest} = StyleSheet.flatten(style) ?? {};
  return {...rest, fontFamily: FREDOKA[String(fontWeight ?? '600')] ?? 'Fredoka-SemiBold'};
}

export function T({style, children, numberOfLines}: {style?: StyleProp<TextStyle>; children: React.ReactNode; numberOfLines?: number}) {
  return <Text style={fredoka([styles.text, style])} numberOfLines={numberOfLines}>{children}</Text>;
}

/**
 * Text that always fits its box: the largest size (≤ max) at which it fits `width` in `lines` lines (and, with
 * `height`, in that height too); only at `min` does it cut off with "…". Use it for anything a parent, the AI or
 * a translation can make long. Sizes, width and height are device px (pass s(designPx)).
 */
export function FitText({text: raw, width, height, max, min, lines = 1, caps, style}: {text: string; width: number; height?: number; max: number; min?: number; lines?: number; caps?: string | false; style?: StyleProp<TextStyle>}) {
  // caps = the language tag when kid text is shown in CAPITALS (locale-aware: ß → SS, etc.)
  const text = caps ? raw.toLocaleUpperCase(caps) : raw;
  // Android won't wrap after a hyphen in a long name ("MAXIMILIAN-ALEXA / NDER"); a zero-width space lets it.
  const shownText = text.replace(/-(?=\S)/g, '-\u200B');
  const minSize = min ?? Math.round(max * 0.45);
  const estimate = useMemo(() => fitFontSize(text, width, max, minSize, lines, caps ? CAPS_WIDTH : CHAR_WIDTH, height), [text, width, max, minSize, lines, caps, height]);
  const [size, setSize] = useState(estimate);
  useEffect(() => setSize(estimate), [estimate]);
  return (
    <Text
      style={fredoka([styles.text, style, {fontSize: size, lineHeight: Math.round(size * LINE_HEIGHT), maxWidth: width}])}
      numberOfLines={linesAllowed(size, lines, height)}
      ellipsizeMode="tail"
      onTextLayout={e => {
        // Where the platform reports real layout: if the visible lines lost text, step the size down.
        const shown = e.nativeEvent.lines.map(l => l.text).join('');
        if (shown.replace(/\s/g, '').length < shownText.replace(/\s/g, '').length && size > minSize) {
          setSize(Math.max(minSize, Math.floor(size * 0.9)));
        }
      }}>
      {shownText}
    </Text>
  );
}

/**
 * A D-pad focusable element. Focus = the white ring (docs/03 §12: the white ring only ever means "selected"),
 * and it springs up a little; pressing squishes it. `children` can be a function of the focus state.
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
  const scale = useRef(new Animated.Value(1)).current;
  const springTo = (toValue: number, quick = false) =>
    Animated.spring(scale, {toValue, speed: quick ? 40 : 20, bounciness: quick ? 0 : 9, useNativeDriver: true}).start();
  const change = (f: boolean) => {
    setFocused(f);
    springTo(f ? FOCUS_SCALE : 1);
    props.onFocusChange?.(f);
  };
  return (
    <TouchableOpacity
      // 1 = no dimming: on TV builds TouchableOpacity also fades on *focus*, which made selected cards look washed out.
      activeOpacity={1}
      onPress={() => {
        Sound.play('tap', 0.5);
        props.onPress?.();
      }}
      onPressIn={() => springTo(0.94, true)}
      onPressOut={() => springTo(focused ? FOCUS_SCALE : 1)}
      onFocus={() => change(true)}
      onBlur={() => change(false)}
      hasTVPreferredFocus={props.preferred}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      disabled={props.disabled}
      style={[styles.ringOff, props.style, focused && styles.ringOn, focused && props.focusedStyle, {transform: [{scale}]}]}>
      {typeof props.children === 'function' ? props.children(focused) : props.children}
    </TouchableOpacity>
  );
}

const FOCUS_SCALE = 1.04;

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
  // Drawn once into a texture: round clipping is costly on the stick, and marbles move or sit under animations.
  return (
    <View renderToHardwareTextureAndroid style={[{width: size, height: size, borderRadius: size / 2, backgroundColor: '#E2A92A', borderWidth: Math.max(1, size * 0.04), borderColor: colors.goldEdge, overflow: 'hidden'}, style]}>
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

/**
 * The marble jar. Marbles sit where the physics put them (physics.ts). `fresh` marbles (the newest)
 * are played back falling in: the lid pops open, each marble drops through the neck, bounces and
 * rolls into place with a clink at every knock, then the lid closes. All native-driver animation.
 * `onLand(landed, of)` fires as each fresh marble lands.
 */
/**
 * The jar. `size` is today's ceiling in marbles: its empty places show as faint slots, exactly where the next
 * marbles will land (the drop physics is deterministic), so a kid sees how much today's jar holds.
 */
export function Jar({marbles, size = 0, fresh = 0, k = 1, onLand}: {marbles: number; size?: number; fresh?: number; k?: number; onLand?: (landed: number, of: number) => void}) {
  const d = (px: number) => s(px * k);
  // The marbles' size follows the jar's: a full jar of any size is full to the top.
  const capacity = size > 0 ? Math.min(size, JAR_CAPACITY) : JAR_CAPACITY;
  const r = size > 0 ? radiusFor(capacity) : JAR.radius;
  const count = Math.min(marbles, capacity);
  const drops = useMemo(() => jarDrops(count, r), [count, r]);
  const slots = useMemo(() => (capacity > count ? jarDrops(capacity, r).slice(count) : []), [capacity, count, r]);
  const freshCount = Math.max(0, Math.min(fresh, count));
  const firstFresh = count - freshCount;
  const lid = useRef(new Animated.Value(0)).current;
  const progress = useRef(Array.from({length: freshCount}, () => new Animated.Value(0))).current;

  useEffect(() => {
    if (!freshCount) return;
    const OPEN = 280;
    const stagger = freshCount <= 3 ? 650 : 420;
    const mine = drops.slice(firstFresh);
    const starts = mine.map((_, i) => OPEN + i * stagger);
    const timers: ReturnType<typeof setTimeout>[] = [];
    Sound.play('lidOpen');
    Animated.timing(lid, {toValue: 1, duration: 240, easing: Easing.out(Easing.back(2)), useNativeDriver: true}).start();
    Animated.parallel(
      progress.map((p, i) =>
        Animated.sequence([
          Animated.delay(starts[i]),
          Animated.timing(p, {toValue: 1, duration: mine[i].duration * 1000, easing: Easing.linear, useNativeDriver: true}),
        ]),
      ),
    ).start();
    mine.forEach((drop, i) => {
      drop.impacts.forEach(hit => timers.push(setTimeout(() => Sound.play('clink', 0.35 + 0.65 * hit.strength), starts[i] + hit.t * 1000)));
      // "Lands" = its first knock on the pile or the glass.
      timers.push(setTimeout(() => onLand?.(i + 1, mine.length), starts[i] + (drop.impacts[0]?.t ?? drop.duration) * 1000));
    });
    // Close the lid once the last marble is through the neck (its first knock), not while it's still in it.
    const last = mine[mine.length - 1];
    const closeAt = starts[starts.length - 1] + ((last.impacts[0]?.t ?? 0.4) * 1000) + 160;
    timers.push(setTimeout(() => {
      Sound.play('lidClose');
      Animated.timing(lid, {toValue: 0, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true}).start();
    }, closeAt));
    return () => timers.forEach(clearTimeout);
    // The animation plays once per mount (the Yay screen mounts a fresh jar).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marbles are drawn in an overlay above the glass (so falling ones are visible in the neck);
  // the overlay origin is the inside of the glass: 60 lid + 20 neck + 8 border down, 8 border in.
  const originTop = 88;
  const originLeft = 8;
  return (
    <View style={{alignItems: 'center', width: d(400)}}>
      <Animated.View
        style={{
          width: d(300),
          height: d(60),
          borderRadius: d(22),
          backgroundColor: colors.coral,
          zIndex: 3,
          transform: [
            {translateY: lid.interpolate({inputRange: [0, 1], outputRange: [0, -d(52)]})},
            {translateX: lid.interpolate({inputRange: [0, 1], outputRange: [0, -d(46)]})},
            {rotate: lid.interpolate({inputRange: [0, 1], outputRange: ['0deg', '-16deg']})},
          ],
        }}
      />
      <View style={{width: d(280), height: d(20), borderLeftWidth: d(8), borderRightWidth: d(8), borderColor: colors.glassEdge, backgroundColor: colors.glass}} />
      <View
        renderToHardwareTextureAndroid
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
        }}
      />
      <View pointerEvents="none" style={{position: 'absolute', left: d(originLeft), top: d(originTop), width: d(JAR.width), height: d(JAR.height), zIndex: 2}}>
        {slots.map((slot, i) => (
          <View key={`slot-${i}`} style={{position: 'absolute', left: d(slot.final.x - r), top: d(slot.final.y - r), width: d(2 * r), height: d(2 * r), borderRadius: d(r), backgroundColor: colors.jarSlot}} />
        ))}
        {drops.map((drop, i) => {
          if (i < firstFresh) {
            return <Marble key={i} size={d(2 * r)} style={{position: 'absolute', left: d(drop.final.x - r), top: d(drop.final.y - r)}} />;
          }
          const p = progress[i - firstFresh];
          const keys = drop.path.filter((_, j) => j % 2 === 0 || j === drop.path.length - 1);
          const input = keys.map((_, j) => (keys.length === 1 ? 0 : j / (keys.length - 1)));
          return (
            <Animated.View
              key={i}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                transform: [
                  {translateX: p.interpolate({inputRange: input, outputRange: keys.map(q => d(q.x - r))})},
                  {translateY: p.interpolate({inputRange: input, outputRange: keys.map(q => d(q.y - r))})},
                ],
              }}>
              <Marble size={d(2 * r)} />
            </Animated.View>
          );
        })}
        {/* The glass's reflection sits on top of the marbles. */}
        <View style={{position: 'absolute', left: d(18), top: d(32), width: d(20), height: d(160), borderRadius: d(10), backgroundColor: 'rgba(255,255,255,0.22)'}} />
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

export function Sparkle({size, style}: {size: number; style?: StyleProp<ImageStyle>}) {
  return <Icon name="sparkle" size={size} color={colors.white} style={style} />;
}

const styles = StyleSheet.create({
  text: {color: colors.white, fontWeight: '600'},
  ringOff: {borderWidth: s(10), borderColor: 'transparent'},
  ringOn: {borderColor: colors.white},
  button: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center'},
  rewardPill: {flexDirection: 'row', backgroundColor: colors.white, alignSelf: 'center'},
});
