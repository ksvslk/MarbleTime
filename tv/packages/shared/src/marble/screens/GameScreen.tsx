import React, {useEffect, useMemo, useState} from 'react';
import {Image, View} from 'react-native';
import {ART, Focusable, Icon, MarbleRow, ShapeView, Sparkle, T} from '../components';
import {Choice, GAMES, KIDS, KidId, Picture, questionsFor} from '../data';
import {useStore} from '../state';
import {colors, s} from '../theme';
import {styles} from './KidScreens';

/**
 * Screen 10–13 · the one template every brain game uses (docs/03 §11):
 * topic + progress + reward on top, the question (read aloud), a picture, three answers in one row.
 */
export function GameScreen({kidId, gameId}: {kidId: KidId; gameId: string}) {
  const {dispatch} = useStore();
  const kid = KIDS.find(k => k.id === kidId)!;
  const game = GAMES[kidId].find(g => g.id === gameId)!;
  const questions = useMemo(() => questionsFor(game.topic, kid.age), [game.topic, kid.age]);
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
        dispatch({type: 'gameDone', kidId, marbles: game.marbles, title: game.title});
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
          <T style={{fontSize: s(52), marginLeft: s(22)}}>{game.title}</T>
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
        <Focusable label="Say it again" style={{width: s(124), height: s(124), borderRadius: s(62), backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center'}}>
          <Icon name="speaker" size={s(54)} color={colors.white} />
        </Focusable>
        <T style={{fontSize: s(92), marginLeft: s(32)}}>
          {result?.right ? <T style={{fontSize: s(92), color: colors.gold}}>Yes! </T> : null}
          {result?.right ? q.praise : result && !result.right ? 'Try again!' : q.prompt}
        </T>
      </View>

      <View style={{flex: 1, alignSelf: 'stretch', marginVertical: s(36), borderRadius: s(56), backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center'}}>
        <PictureView picture={q.picture} counted={!!result?.right} />
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
              style={{width: s(380), height: s(210), borderRadius: s(48), backgroundColor: colors.tile, marginHorizontal: s(28), alignItems: 'center', justifyContent: 'center', opacity: faded ? 0.35 : 1}}>
              <ChoiceView choice={choice} />
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

function ChoiceView({choice}: {choice: Choice}) {
  if (choice.kind === 'shape') return <ShapeView shape={choice.shape} size={s(124)} color={colors.ink} />;
  const big = choice.text.length <= 3;
  return <T style={{fontSize: big ? s(140) : s(84), lineHeight: big ? s(150) : s(96), color: colors.ink}}>{choice.text}</T>;
}

function PictureView({picture, counted}: {picture: Picture; counted: boolean}) {
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
  return (
    <View style={[styles.row, {flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: s(60)}]}>
      <T style={{fontSize: s(76), fontWeight: '500'}}>{picture.before}</T>
      <View style={{width: s(260), height: s(104), borderRadius: s(26), backgroundColor: 'rgba(255,255,255,0.16)', marginHorizontal: s(24)}} />
      {picture.after ? <T style={{fontSize: s(76), fontWeight: '500'}}>{picture.after}</T> : null}
    </View>
  );
}
