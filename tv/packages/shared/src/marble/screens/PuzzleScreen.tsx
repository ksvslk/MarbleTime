import React, {useEffect, useRef, useState} from 'react';
import {Animated, View} from 'react-native';
import {api, ServerPuzzle} from '../api';
import {Button, FitText, Focusable, Icon, Sparkle, T} from '../components';
import {KidId} from '../data';
import {CAPS_WIDTH, CHAR_WIDTH, fitFontSize} from '../fit';
import {numberWord, t} from '../i18n';
import {Appear, Beat, Flip, Twinkle} from '../motion';
import {Sound} from '../sound';
import {narration, useSay} from '../speech';
import {afterAnswer, puzzlesOf, useStore} from '../state';
import {colors, s} from '../theme';
import {capsOf, styles} from './KidScreens';

/** A press this soon after a question came in is a guess: it is ignored until the kid had a moment to look (docs/08 §3.3). */
const LOOK_MS = 900;
/** How long the answer stays up before the next question: a moment for "Yes!", longer after a miss, so the kid can take the right one in. */
const AFTER_RIGHT_MS = 1500;
const AFTER_MISS_MS = 3800;

type Session = {questions: ServerPuzzle[]; spare?: ServerPuzzle};

/**
 * A day's puzzle session. The puzzles come from the backend's bank (written by a model ahead of time, and checked),
 * picked for this kid's age and level; the TV only shows them and marks the answers. With no session to play (no
 * network, or no puzzles in the family's language yet) the kid is simply back on their board.
 */
export function PuzzleScreen({kidId}: {kidId: KidId}) {
  const {state, dispatch} = useStore();
  const {lang, apiUrl} = state;
  const token = state.link?.token;
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    let alive = true;
    const back = () => alive && dispatch({type: 'go', screen: {name: 'board', kidId}});
    if (!token) return void back();
    api.puzzleSession(apiUrl, token, kidId).then(fresh => (fresh?.questions.length ? alive && setSession(fresh) : back()), back);
    return () => {
      alive = false;
    };
  }, [apiUrl, token, kidId, dispatch]);
  if (!session) {
    return (
      <View style={[styles.screen, {alignItems: 'center', justifyContent: 'center'}]}>
        <Flip every={1400}>
          <Icon name="hourglass" size={s(120)} color={colors.soft} />
        </Flip>
        <FitText text={t(lang, 'puzzles')} caps={capsOf(state)} width={s(1200)} max={s(72)} min={s(40)} style={{marginTop: s(30), color: colors.soft}} />
      </View>
    );
  }
  return <Play kidId={kidId} session={session} />;
}

/** A word answer as it is read aloud: a number said as a word, so the voice and its check agree. */
const spoken = (lang: Parameters<typeof numberWord>[0], text: string) => (/^\d{1,2}$/.test(text) && Number(text) <= 20 ? numberWord(lang, Number(text)) : text);

/**
 * Playing a session, in the one shape every puzzle has: the question (read aloud), a row of pictures, three answers
 * in one row. One answer counts: a right one gets its "Yes!" and the session moves on; a miss is marked calmly, the
 * right answer is shown with its reason, and the session moves on (no "try until right", which teaches guessing;
 * docs/08 §3.2). It ends on a right answer: after a miss on the last question the spare one comes, a level easier.
 */
function Play({kidId, session}: {kidId: KidId; session: Session}) {
  const {state, dispatch} = useStore();
  const {lang, apiUrl} = state;
  const caps = capsOf(state);
  const token = state.link?.token;
  const saved = puzzlesOf(state, kidId);
  const [list, setList] = useState(session.questions);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const answers = useRef<{id: string; right: boolean}[]>([]);
  const shownAt = useRef(Date.now());
  const say = useSay();
  const q = list[index];
  const right = picked === q.answer;
  // What is shown and said once the kid has answered (logic.ts): "Yes!", or "Look:" and the reason after a miss.
  const answered = afterAnswer(right, {yes: t(lang, 'puzzleYes'), look: t(lang, 'puzzleLook'), reason: q.reason});

  // The narrator makes a line the first time it is asked for, which can take a while: ask for the session's lines
  // ahead, in the order they'll be needed, so most are ready when their question comes.
  useEffect(() => {
    if (!state.voice || !token) return;
    const lines = [...session.questions, ...(session.spare ? [session.spare] : [])].flatMap(p => [p.prompt, p.reason, ...p.choices.flatMap(c => (c.text ? [spoken(lang, c.text)] : []))]);
    let alive = true;
    lines.reduce((done, line) => done.then(() => (alive ? narration({base: apiUrl, token}, lang, line).then(() => undefined) : undefined)), Promise.resolve());
    return () => {
      alive = false;
    };
  }, [session, state.voice, token, apiUrl, lang]);

  // Each question is read out once it has come in.
  useEffect(() => {
    shownAt.current = Date.now();
    const timer = setTimeout(() => say([q.prompt]), 450);
    return () => clearTimeout(timer);
  }, [index, q.prompt, say]);

  useEffect(() => {
    if (picked === null) return;
    const timer = setTimeout(() => {
      answers.current.push({id: q.id, right});
      const last = index + 1 >= list.length;
      // End on a success: the spare question, a level easier, after a miss on the last one.
      if (last && !right && session.spare && !list.includes(session.spare)) setList([...list, session.spare]);
      else if (last) return void dispatch({type: 'puzzleDone', kidId, answers: answers.current});
      setIndex(index + 1);
      setPicked(null);
    }, right ? AFTER_RIGHT_MS : AFTER_MISS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked]);

  const pick = (i: number) => {
    if (picked !== null || Date.now() - shownAt.current < LOOK_MS) return;
    const hit = i === q.answer;
    // A bright ding for a right answer; a miss makes no sound at all.
    if (hit) Sound.play('right');
    say(afterAnswer(hit, {yes: t(lang, 'puzzleYes'), look: t(lang, 'puzzleLook'), reason: q.reason}).say);
    setPicked(i);
  };

  // A word answer is read when the D-pad moves onto it (not when the question first comes in: that is the question's turn).
  const moved = useRef(false);
  useEffect(() => {
    moved.current = false;
  }, [index]);
  const readChoice = (i: number) => {
    const text = q.choices[i].text;
    if (!moved.current) return void (moved.current = true);
    if (text && picked === null) say([spoken(lang, text)]);
  };

  return (
    <View style={[styles.screen, {alignItems: 'center'}]}>
      <View style={[styles.row, {alignSelf: 'stretch', height: s(100)}]}>
        <View style={[styles.row, {flex: 1}]}>
          <View style={{width: s(96), height: s(96), borderRadius: s(28), backgroundColor: colors.lilac, alignItems: 'center', justifyContent: 'center'}}>
            <Icon name="puzzle" size={s(64)} />
          </View>
          <FitText text={t(lang, 'puzzles')} caps={caps} width={s(520)} max={s(52)} min={s(30)} style={{marginLeft: s(22)}} />
        </View>
        <View style={styles.row}>
          {list.map((_, i) => (
            <View key={i} style={{width: i === index ? s(56) : s(20), height: s(20), borderRadius: s(10), marginHorizontal: s(7), backgroundColor: i <= index ? colors.white : 'rgba(255,255,255,0.3)'}} />
          ))}
        </View>
        <View style={{flex: 1, alignItems: 'flex-end'}}>
          <StarRow stars={saved.stars} needed={saved.starsNeeded} coming size={s(44)} color={colors.white} />
        </View>
      </View>

      <View style={[styles.row, {marginTop: s(30), minHeight: s(190)}]}>
        <Focusable label={t(lang, 'sayAgain')} onPress={() => say(picked === null ? [q.prompt] : answered.say)} style={{width: s(124), height: s(124), borderRadius: s(62), backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center'}}>
          <Icon name="speaker" size={s(54)} color={colors.white} />
        </Focusable>
        {/* New words come in each time: the question, then "Yes!" or "Look: A dog barks." */}
        <Appear key={`${index}-${picked === null ? 'q' : 'a'}`} from="up" distance={s(16)}>
          <PromptLine lead={picked === null ? '' : answered.lead} gold={right} text={picked === null ? q.prompt : answered.text} caps={caps} />
        </Appear>
      </View>

      {/* Keyed by having a picture: a panel that changes its background keeps square corners on Fire OS. */}
      <View key={q.picture.length ? 'picture' : 'none'} style={{flex: 1, alignSelf: 'stretch', marginVertical: s(26), borderRadius: s(56), overflow: 'hidden', backgroundColor: q.picture.length ? 'rgba(255,255,255,0.08)' : 'transparent', alignItems: 'center', justifyContent: 'center'}}>
        <Appear key={index} from="right" distance={s(80)}>
          <PictureRow picture={q.picture} />
        </Appear>
      </View>

      <View key={index} style={[styles.row, {paddingBottom: s(20)}]}>
        {q.choices.map((choice, i) => (
          <ChoiceTile
            key={i}
            index={i}
            choice={choice}
            caps={caps}
            // One size for the three: big for numbers and single letters, smaller as soon as one is a word.
            big={q.choices.every(c => [...(c.text ?? '')].length <= 3)}
            // After an answer the right tile is marked whichever was picked; a missed pick fades, the third steps back.
            look={picked === null ? 'idle' : i === q.answer ? 'right' : i === picked ? 'missed' : 'faded'}
            onPress={() => pick(i)}
            onFocus={() => readChoice(i)}
          />
        ))}
      </View>
      {right ? (
        <Twinkle style={{position: 'absolute', bottom: s(160), left: s(780)}}>
          <Sparkle size={s(44)} />
        </Twinkle>
      ) : null}
    </View>
  );
}

/**
 * Stars toward the next character: earned ones are filled in, the ones to come are outlines (the next one a little
 * brighter where a round is about to give it: `coming`), and the sparkle at the end is the character. Not gold:
 * gold is only time and the main button.
 */
export function StarRow({stars, needed, coming = false, pulse = false, end = 'sparkle', size, color}: {stars: number; needed: number; coming?: boolean; pulse?: boolean; end?: 'sparkle' | 'none'; size: number; color: string}) {
  return (
    <View style={styles.row}>
      {Array.from({length: needed}).map((_, i) => {
        const next = coming && i === stars;
        const star = <Icon name={i < stars ? 'starfull' : 'star'} size={size} color={color} />;
        return (
          <View key={i} style={{opacity: i < stars ? 1 : next ? (pulse ? 1 : 0.6) : 0.3, marginHorizontal: size * 0.06}}>
            {/* `pulse`: the star a selected card would give beats. */}
            {next && pulse ? <Beat>{star}</Beat> : star}
          </View>
        );
      })}
      {/* `end`: the homepage ends the row with the next character itself, not a sparkle. */}
      {end === 'sparkle' ? (
        <View style={{marginLeft: size * 0.2}}>
          <Icon name="sparkle" size={size} color={color} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * The question, or "Yes! A dog barks." with the first word in gold (a right answer is the screen's main moment): one
 * font size for the whole text, small enough that up to three lines fit, in capitals too.
 */
function PromptLine({lead, text, gold, caps}: {lead: string; text: string; gold: boolean; caps: string | false}) {
  const up = (x: string) => (caps ? x.toLocaleUpperCase(caps) : x);
  const shown = up(`${lead} ${text}`.trim());
  const size = fitFontSize(shown, s(1500), s(84), s(36), 3, caps ? CAPS_WIDTH : CHAR_WIDTH);
  return (
    <T style={{fontSize: size, lineHeight: Math.round(size * 1.22), marginLeft: s(32), width: s(1500)}} numberOfLines={3}>
      {lead ? <T style={{fontSize: size, color: gold ? colors.gold : colors.soft}}>{up(lead)} </T> : null}
      {up(text)}
    </T>
  );
}

/** One answer: the right one grows a little and gets a check once the kid has answered; a missed pick just fades. */
function ChoiceTile({choice, index, caps, big, look, onPress, onFocus}: {choice: {text?: string; emoji?: string}; index: number; caps: string | false; big: boolean; look: 'idle' | 'right' | 'missed' | 'faded'; onPress: () => void; onFocus: () => void}) {
  const fade = useRef(new Animated.Value(1)).current;
  const grow = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(fade, {toValue: look === 'missed' ? 0.3 : look === 'faded' ? 0.45 : 1, duration: 300, useNativeDriver: true}).start();
    Animated.spring(grow, {toValue: look === 'right' ? 1.08 : 1, speed: 14, bounciness: 12, useNativeDriver: true}).start();
  }, [look, fade, grow]);
  const text = choice.text ?? '';
  return (
    <Appear from="up" distance={s(60)} delay={120 + index * 90}>
      <Animated.View style={{opacity: fade, transform: [{scale: grow}]}}>
        <Focusable
          preferred={index === 0}
          label={choice.emoji ?? text}
          onPress={onPress}
          onFocusChange={focused => focused && onFocus()}
          // The ring sits on the Focusable; the white tile is inside with a gap, so the ring shows on white.
          style={{borderRadius: s(66), padding: s(8), marginHorizontal: s(16)}}>
          <View style={{width: s(460), height: s(210), borderRadius: s(48), backgroundColor: colors.tile, alignItems: 'center', justifyContent: 'center'}}>
            {choice.emoji ? (
              <T style={{fontSize: s(120), lineHeight: s(150), includeFontPadding: false, textAlignVertical: 'center'}}>{choice.emoji}</T>
            ) : (
              // Words and short phrases shrink to fit the tile, on two lines if need be.
              <FitText text={text} caps={caps} width={s(410)} height={s(180)} max={big ? s(130) : s(68)} min={s(28)} lines={2} style={{color: colors.ink, textAlign: 'center'}} />
            )}
          </View>
          {look === 'right' ? (
            <Appear from="pop" style={{position: 'absolute', top: s(-30), right: s(-30)}}>
              <View style={{width: s(92), height: s(92), borderRadius: s(46), backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center'}}>
                <Icon name="check" size={s(52)} color={colors.white} />
              </View>
            </Appear>
          ) : null}
        </Focusable>
      </Animated.View>
    </Appear>
  );
}

/** The pictures a question is about, in one row: fewer are bigger, and ten still fit. */
function PictureRow({picture}: {picture: string[]}) {
  if (!picture.length) return null;
  const size = picture.length <= 4 ? s(170) : picture.length <= 6 ? s(140) : picture.length <= 8 ? s(116) : s(96);
  return (
    <View style={styles.row}>
      {picture.map((emoji, i) => (
        <T key={i} style={{fontSize: size, lineHeight: Math.round(size * 1.3), marginHorizontal: size * 0.12}}>{emoji}</T>
      ))}
    </View>
  );
}

/** A session is finished: the star it earned pops in, and the last star needed brings a new character. */
export function PuzzleDoneScreen({kidId, star, character, marks = []}: {kidId: KidId; star: boolean; character: boolean; marks?: boolean[]}) {
  const {state, dispatch} = useStore();
  const {lang} = state;
  const caps = capsOf(state);
  const now = puzzlesOf(state, kidId);
  // With the character earned the row starts again; it is shown full here, as the kid just filled it.
  const stars = character ? now.starsNeeded : now.stars;
  // One line under the stars when they just brought a character.
  const extra = character ? t(lang, 'starsCharacter', {n: now.starsNeeded}) : null;
  const say = useSay();
  useEffect(() => {
    Sound.play('yay');
    const timer = setTimeout(() => say(extra ? [t(lang, 'yay'), extra] : [t(lang, 'yay')]), 900);
    return () => clearTimeout(timer);
  }, [say, lang, extra]);
  return (
    <View style={[styles.screen, {alignItems: 'center', justifyContent: 'center'}]}>
      <Appear from="pop" delay={150}>
        <FitText text={t(lang, 'yay')} caps={caps} width={s(1200)} max={s(200)} min={s(110)} style={{color: colors.gold, fontWeight: '700', textAlign: 'center'}} />
      </Appear>
      {/* How the round went: one mark per question in the order they came, and the count. Plain facts, no grade:
          the star is for finishing, whatever the score (docs/08 §3.1). */}
      {marks.length ? (
        <Appear from="up" delay={260} style={{marginTop: s(10)}}>
          <View style={styles.row}>
            {marks.map((right, i) => (
              <View key={i} style={{width: s(56), height: s(56), borderRadius: s(28), marginHorizontal: s(8), alignItems: 'center', justifyContent: 'center', backgroundColor: right ? colors.white : 'transparent', borderWidth: s(5), borderColor: right ? colors.white : 'rgba(255,255,255,0.35)'}}>
                {right ? <Icon name="check" size={s(36)} color={colors.ink} /> : null}
              </View>
            ))}
            <T style={{fontSize: s(48), marginLeft: s(22), color: colors.white}}>
              {marks.filter(Boolean).length} / {marks.length}
            </T>
          </View>
        </Appear>
      ) : null}
      <Appear from="up" delay={320} style={{marginTop: s(34)}}>
        <View style={styles.row}>
          {Array.from({length: now.starsNeeded}).map((_, i) => (
            // The star this session earned pops in last. Earned stars are filled in; the ones to come are outlines.
            <Appear key={i} from="pop" delay={star && i === stars - 1 ? 900 : 380 + i * 60} style={{opacity: i < stars ? 1 : 0.3, marginHorizontal: s(10)}}>
              <Icon name={i < stars ? 'starfull' : 'star'} size={s(120)} color={colors.white} />
            </Appear>
          ))}
          <Twinkle style={{marginLeft: s(24), opacity: character ? 1 : 0.4}}>
            <Sparkle size={s(110)} />
          </Twinkle>
        </View>
      </Appear>
      {extra ? (
        <Appear from="pop" delay={1100}>
          <FitText text={extra} caps={caps} width={s(1500)} max={s(56)} min={s(32)} lines={2} style={{marginTop: s(30), textAlign: 'center'}} />
        </Appear>
      ) : null}
      <Appear delay={700} style={{marginTop: s(44)}}>
        <Button title={t(lang, 'ok')} primary preferred onPress={() => dispatch({type: 'go', screen: {name: 'board', kidId}})} />
      </Appear>
    </View>
  );
}
