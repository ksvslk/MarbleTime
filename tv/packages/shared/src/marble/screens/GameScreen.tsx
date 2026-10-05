import React, {useEffect, useMemo, useState} from 'react';
import {Image, View} from 'react-native';
import {ART, FitText, Focusable, Icon, MarbleRow, ShapeView, Sparkle, T} from '../components';
import {Choice, KidId, Picture, questionsFor} from '../data';
import {CAPS_WIDTH, CHAR_WIDTH, fitFontSize} from '../fit';
import {useStore} from '../state';
import {t} from '../i18n';
import {colors, s} from '../theme';
import {capsOf, styles} from './KidScreens';

/**
 * Screen 10–13 · the one template every brain game uses (docs/03 §11):
 * topic + progress + reward on top, the question (read aloud), a picture, three answers in one row.
 */
export function GameScreen({kidId, gameId}: {kidId: KidId; gameId: string}) {
  const {state, dispatch} = useStore();
  const lang = state.lang;
  const caps = capsOf(state);
  const kid = state.family.kids.find(k => k.id === kidId) ?? state.family.kids[0];
  const game = (state.family.games[kidId] ?? []).find(g => g.id === gameId) ?? state.family.games[kidId][0];
  const questions = useMemo(() => questionsFor(game.topic, kid.age, lang), [game.topic, kid.age, lang]);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<{choice: number; right: boolean} | null>(null);
  const [wrong, setWrong] = useState<number[]>([]);
  const q = questions[index];

  useEffect(() => {
    if (!result?.right) return;
    const t = setTimeout(() => {
      if (index + 1 < questions.length) {
        setIndex(index + 1);
        setResult(null);
        setWrong([]);
      } else {
        dispatch({type: 'gameDone', kidId, marbles: game.marbles, gameId: game.id});
      }
    }, 1600);
    return () => clearTimeout(t);
  }, [result, index, questions.length, dispatch, kidId, game]);

  const pick = (i: number) => {
    if (result?.right || wrong.includes(i)) return;
    const right = i === q.answer;
    setResult({choice: i, right});
    if (!right) setWrong([...wrong, i]);
  };

  return (
    <View style={[styles.screen, {alignItems: 'center'}]}>
      <View style={[styles.row, {alignSelf: 'stretch', height: s(100)}]}>
        <View style={[styles.row, {flex: 1}]}>
          <View style={{width: s(96), height: s(96), borderRadius: s(28), backgroundColor: game.color, alignItems: 'center', justifyContent: 'center'}}>
            {game.topic === 'puzzles' ? <Icon name="shapes" size={s(60)} /> : <T style={{fontSize: s(36), color: colors.ink, fontWeight: '700'}}>{game.label}</T>}
          </View>
          <FitText text={t(lang, game.title)} caps={caps} width={s(520)} max={s(52)} min={s(30)} style={{marginLeft: s(22)}} />
        </View>
        <View style={styles.row}>
          {questions.map((_, i) => (
            <View key={i} style={{width: i === index ? s(56) : s(20), height: s(20), borderRadius: s(10), marginHorizontal: s(7), backgroundColor: i <= index ? colors.white : 'rgba(255,255,255,0.3)'}} />
          ))}
        </View>
        <View style={{flex: 1, alignItems: 'flex-end'}}>
          <MarbleRow count={game.marbles} size={s(40)} />
        </View>
      </View>

      <View style={[styles.row, {marginTop: s(36)}]}>
        <Focusable label={t(lang, 'sayAgain')} style={{width: s(124), height: s(124), borderRadius: s(62), backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center'}}>
          <Icon name="speaker" size={s(54)} color={colors.white} />
        </Focusable>
        <PromptLine lead={result?.right ? t(lang, 'yes') : ''} text={result?.right ? q.praise : result && !result.right ? t(lang, 'tryAgain') : q.prompt} caps={caps} />
      </View>

      <View style={{flex: 1, alignSelf: 'stretch', marginVertical: s(36), borderRadius: s(56), backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center'}}>
        <PictureView picture={q.picture} counted={!!result?.right} caps={caps} />
      </View>

      <View key={index} style={[styles.row, {paddingBottom: s(20)}]}>
        {q.choices.map((choice, i) => {
          const isRight = result?.right && result.choice === i;
          const faded = wrong.includes(i) || (result?.right && !isRight);
          return (
            <Focusable
              key={i}
              preferred={i === 0}
              label={choice.kind === 'text' ? choice.text : choice.shape}
              onPress={() => pick(i)}
              // The ring sits on the Focusable; the white tile is inside with a gap, so the ring shows on white.
              style={{borderRadius: s(66), padding: s(8), marginHorizontal: s(16), opacity: faded ? 0.35 : 1}}>
              <View style={{width: s(380), height: s(210), borderRadius: s(48), backgroundColor: colors.tile, alignItems: 'center', justifyContent: 'center'}}>
                <ChoiceView choice={choice} caps={caps} />
              </View>
              {isRight ? (
                <View style={{position: 'absolute', top: s(-30), right: s(-30), width: s(92), height: s(92), borderRadius: s(46), backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center'}}>
                  <Icon name="check" size={s(52)} color={colors.white} />
                </View>
              ) : null}
            </Focusable>
          );
        })}
      </View>
      {result?.right ? <Sparkle size={s(44)} style={{position: 'absolute', bottom: s(160), left: s(780)}} /> : null}
    </View>
  );
}

/** "Yes! 4 apples!": one line that fits, with the first word in gold. */
function PromptLine({lead, text, caps}: {lead: string; text: string; caps: string | false}) {
  const shown = caps ? `${lead} ${text}`.toLocaleUpperCase(caps) : `${lead} ${text}`;
  const size = fitFontSize(shown.trim(), s(1420), s(92), s(44), 2, caps ? CAPS_WIDTH : CHAR_WIDTH);
  const up = (x: string) => (caps ? x.toLocaleUpperCase(caps) : x);
  return (
    <T style={{fontSize: size, lineHeight: Math.round(size * 1.15), marginLeft: s(32), maxWidth: s(1420)}} numberOfLines={2}>
      {lead ? <T style={{fontSize: size, color: colors.gold}}>{up(lead)} </T> : null}
      {up(text)}
    </T>
  );
}

function ChoiceView({choice, caps}: {choice: Choice; caps: string | false}) {
  if (choice.kind === 'shape') return <ShapeView shape={choice.shape} size={s(124)} color={colors.ink} />;
  // Numbers stay big; words shrink to fit the tile, whatever the language or the AI wrote.
  return <FitText text={choice.text} caps={caps} width={s(340)} max={choice.text.length <= 3 ? s(140) : s(84)} min={s(34)} style={{color: colors.ink}} />;
}

function PictureView({picture, counted, caps}: {picture: Picture; counted: boolean; caps: string | false}) {
  if (picture.kind === 'count') {
    return (
      <View style={styles.row}>
        {Array.from({length: picture.n}).map((_, i) => (
          <View key={i} style={{alignItems: 'center', marginHorizontal: s(36)}}>
            <Image source={ART.apple} style={{width: s(170), height: s(170)}} />
            {counted ? <T style={{fontSize: s(64), marginTop: s(6)}}>{i + 1}</T> : null}
          </View>
        ))}
      </View>
    );
  }
  if (picture.kind === 'sequence') {
    return (
      <View style={styles.row}>
        {picture.shapes.map((sh, i) => (
          <View key={i} style={{marginHorizontal: s(20)}}>
            <ShapeView shape={sh} size={s(130)} color={colors.white} />
          </View>
        ))}
        <View style={{width: s(160), height: s(160), borderRadius: s(40), marginLeft: s(20), backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center'}}>
          <T style={{fontSize: s(104)}}>?</T>
        </View>
      </View>
    );
  }
  // A sentence with a gap: one font size for the whole sentence, so long AI sentences still fit (3 lines max).
  const up = (x: string) => (caps ? x.toLocaleUpperCase(caps) : x);
  const size = fitFontSize(up(`${picture.before} __________ ${picture.after}`), s(1600), s(76), s(36), 3, caps ? CAPS_WIDTH : CHAR_WIDTH);
  return (
    <View style={[styles.row, {flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: s(60)}]}>
      <T style={{fontSize: size, lineHeight: Math.round(size * 1.3), fontWeight: '500'}}>{up(picture.before)}</T>
      <View style={{width: size * 3.4, height: size * 1.35, borderRadius: size * 0.34, backgroundColor: 'rgba(255,255,255,0.16)', marginHorizontal: size * 0.3}} />
      {picture.after ? <T style={{fontSize: size, lineHeight: Math.round(size * 1.3), fontWeight: '500'}}>{up(picture.after)}</T> : null}
    </View>
  );
}
