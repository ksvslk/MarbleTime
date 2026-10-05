import React, {useEffect, useState} from 'react';
import {Image, ScrollView, StyleSheet, View} from 'react-native';
import {Avatar, ART, Button, FitText, Focusable, Icon, Jar, Marble, MarbleRow, Sparkle, T} from '../components';
import {KidId, textOf} from '../data';
import {t} from '../i18n';
import {balanceOf, marblesIn, State, useStore, Why} from '../state';
import {colors, MIN_PER_MARBLE, s} from '../theme';

const kidOf = (state: State, id: KidId) => state.family.kids.find(k => k.id === id) ?? state.family.kids[0];
/** Kid-facing text goes through this: the language tag turns on CAPITALS when the grown-ups chose it. */
export const capsOf = (state: State) => (state.caps ? state.lang : false);

/** Screen 1 · "Who's here?" — any number of kids, any name length. */
export function WhoScreen() {
  const {state, dispatch} = useStore();
  const {lang} = state;
  const caps = capsOf(state);
  const kids = state.family.kids;
  const avatar = kids.length <= 2 ? 380 : kids.length === 3 ? 320 : 250;
  const gap = kids.length <= 2 ? 90 : 40;
  return (
    <View style={[styles.screen, {alignItems: 'center'}]}>
      <View style={styles.logoRow}>
        <Image source={ART.logo} style={{width: s(56), height: s(56)}} />
        <T style={{fontSize: s(40), marginLeft: s(14)}}>MarbleTime</T>
      </View>
      <FitText text={t(lang, 'whoTitle')} caps={caps} width={s(1600)} max={s(120)} min={s(64)} style={{marginTop: s(24), textAlign: 'center'}} />
      <View style={{flex: 1, flexDirection: 'row', alignItems: 'center'}}>
        {kids.map((kid, i) => (
          <View key={kid.id} style={{alignItems: 'center', marginHorizontal: s(gap), width: s(avatar + 40)}}>
            <Focusable
              preferred={i === 0}
              label={kid.name}
              onPress={() => dispatch({type: 'go', screen: {name: 'board', kidId: kid.id}})}
              style={{borderRadius: s(avatar), padding: s(6)}}>
              <Avatar art={kid.avatar} bg={kid.avatarBg} size={s(avatar)} />
            </Focusable>
            <FitText text={kid.name} caps={caps} width={s(avatar + 40)} max={s(84)} min={s(36)} lines={2} style={{marginTop: s(30), textAlign: 'center'}} />
          </View>
        ))}
      </View>
      <View style={{position: 'absolute', right: s(96), bottom: s(54)}}>
        <Focusable label={t(lang, 'grownups')} onPress={() => dispatch({type: 'go', screen: {name: 'pin'}})} style={styles.smallChip}>
          <Icon name="lock" size={s(30)} color={colors.white} />
          <FitText text={t(lang, 'grownups')} width={s(320)} max={s(30)} min={s(22)} style={{marginLeft: s(12), fontWeight: '500'}} />
        </Focusable>
      </View>
    </View>
  );
}

/** Screen 2 · the board: the jar and one row of cards (jobs from parents, games from AI). */
export function BoardScreen({kidId, focusId}: {kidId: KidId; focusId?: string}) {
  const {state, dispatch} = useStore();
  const {lang} = state;
  const caps = capsOf(state);
  const kid = kidOf(state, kidId);
  const [focused, setFocused] = useState<string | null>(null);

  useEffect(() => {
    const mine = state.celebrations.filter(c => c.kidId === kidId);
    if (mine.length) {
      dispatch({type: 'celebrated', kidId});
      dispatch({type: 'go', screen: {name: 'yay', kidId, marbles: mine.reduce((a, c) => a + c.marbles, 0), why: {kind: 'job', jobId: mine[mine.length - 1].jobId}}});
    }
  }, [state.celebrations, kidId, dispatch]);

  const waiting = (jobId: string) => state.claims.some(c => c.kidId === kidId && c.jobId === jobId && c.status === 'waiting');
  const cards = [
    ...(state.family.jobs[kidId] ?? []).map(j => ({id: `job:${j.id}`, kind: 'job' as const, title: textOf(j.title, lang), color: j.color, icon: j.icon, label: '', marbles: Math.max(1, Math.round(j.minutes / MIN_PER_MARBLE)), waiting: waiting(j.id), go: () => dispatch({type: 'claim', kidId, jobId: j.id})})),
    ...(state.family.games[kidId] ?? []).map(g => ({id: `game:${g.id}`, kind: 'game' as const, title: t(lang, g.title), color: g.color, icon: g.topic === 'puzzles' ? ('shapes' as const) : undefined, label: g.label, marbles: g.marbles, waiting: false, go: () => dispatch({type: 'go', screen: {name: 'game', kidId, gameId: g.id}})})),
  ];
  const preferredId = focusId ? (cards.find(c => c.id.endsWith(`:${focusId}`))?.id ?? cards[0]?.id) : cards[0]?.id;
  const minutes = balanceOf(state, kidId);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Avatar art={kid.avatar} bg={kid.avatarBg} size={s(104)} />
        <FitText text={kid.name} caps={caps} width={s(1400)} max={s(80)} min={s(44)} style={{marginLeft: s(28)}} />
      </View>
      <View style={{flex: 1, flexDirection: 'row', alignItems: 'center'}}>
        <View style={{width: s(460), alignItems: 'center'}}>
          <Jar marbles={marblesIn(minutes)} />
          <View style={[styles.smallChip, {marginTop: s(18)}]}>
            <Icon name="clock" size={s(40)} color={colors.white} />
            <T style={{fontSize: s(40), marginLeft: s(14)}}>{t(lang, 'minutes', {n: minutes})}</T>
          </View>
          {/* What one marble is worth, for parents and older kids. */}
          <View style={[styles.row, {marginTop: s(14)}]}>
            <Marble size={s(34)} />
            <T style={{fontSize: s(30), marginLeft: s(10), color: colors.muted, fontWeight: '500'}}>{t(lang, 'marbleValue', {n: MIN_PER_MARBLE})}</T>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginLeft: s(60)}} contentContainerStyle={{paddingVertical: s(30), paddingHorizontal: s(20)}}>
          {cards.map(card => (
            <View key={card.id} style={{alignItems: 'center', marginRight: s(30)}}>
              <Focusable
                preferred={card.id === preferredId}
                label={card.title}
                onPress={card.go}
                onFocusChange={f => setFocused(cur => (f ? card.id : cur === card.id ? null : cur))}
                style={[styles.card, {backgroundColor: card.color}]}>
                <View style={styles.cardArt}>
                  {card.icon ? <Icon name={card.icon} size={s(150)} /> : <T style={{fontSize: s(88), color: colors.ink, fontWeight: '700'}}>{card.label}</T>}
                </View>
                <View style={{flex: 1, justifyContent: 'center'}}>
                  <FitText text={card.title} caps={caps} width={s(280)} max={s(42)} min={s(22)} lines={3} style={{color: colors.ink, textAlign: 'center'}} />
                </View>
                <MarbleRow count={Math.min(card.marbles, 5)} size={s(40)} />
                {card.waiting ? (
                  <View style={styles.badge}>
                    <Icon name="hourglass" size={s(54)} />
                  </View>
                ) : null}
              </Focusable>
              <View style={{height: s(130), justifyContent: 'center'}}>
                {focused === card.id && !card.waiting ? (
                  <View style={styles.hint}>
                    <Icon name={card.kind === 'job' ? 'thumbs' : 'play'} size={s(46)} />
                    <FitText text={t(lang, card.kind === 'job' ? 'iDidIt' : 'letsPlay')} caps={caps} width={s(340)} max={s(46)} min={s(28)} style={{color: colors.ink, marginLeft: s(16)}} />
                  </View>
                ) : null}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

/** Screen 3 · "Great job!" — the claim is waiting for a grown-up. */
export function ClaimedScreen({kidId, jobId}: {kidId: KidId; jobId: string}) {
  const {state, dispatch} = useStore();
  const {lang} = state;
  const caps = capsOf(state);
  const kid = kidOf(state, kidId);
  const job = (state.family.jobs[kidId] ?? []).find(j => j.id === jobId);
  return (
    <View style={[styles.screen, styles.row]}>
      <View style={{flex: 1, paddingLeft: s(40)}}>
        {job ? (
          <View style={styles.row}>
            <View style={[styles.tile, {backgroundColor: job.color}]}>
              <Icon name={job.icon} size={s(100)} />
            </View>
            <FitText text={textOf(job.title, lang)} caps={caps} width={s(780)} max={s(56)} min={s(30)} lines={2} style={{marginLeft: s(28)}} />
          </View>
        ) : null}
        <FitText text={t(lang, 'greatJob', {name: kid.name})} caps={caps} width={s(980)} max={s(150)} min={s(64)} lines={3} style={{marginTop: s(40)}} />
        <View style={[styles.row, {marginTop: s(30)}]}>
          <Icon name="hourglass" size={s(64)} color={colors.soft} />
          <FitText text={t(lang, 'grownupWillCheck')} caps={caps} width={s(880)} max={s(60)} min={s(34)} lines={2} style={{color: colors.soft, marginLeft: s(22)}} />
        </View>
        <View style={[styles.row, {marginTop: s(50)}]}>
          <Button title={t(lang, 'ok')} primary preferred onPress={() => dispatch({type: 'go', screen: {name: 'board', kidId, focusId: jobId}})} />
          <View style={{width: s(32)}} />
          <Button title={t(lang, 'oops')} icon="undo" onPress={() => dispatch({type: 'undoClaim', kidId, jobId})} />
        </View>
      </View>
      <View style={{width: s(460), alignItems: 'center', marginRight: s(40)}}>
        <Jar marbles={marblesIn(balanceOf(state, kidId))} />
      </View>
    </View>
  );
}

/** Screen 4 · "Yay!" — new marbles drop into the jar. */
export function YayScreen({kidId, marbles, why}: {kidId: KidId; marbles: number; why: Why}) {
  const {state, dispatch} = useStore();
  const {lang} = state;
  const caps = capsOf(state);
  const job = why.kind === 'job' ? (state.family.jobs[kidId] ?? []).find(j => j.id === why.jobId) : undefined;
  const game = why.kind === 'game' ? (state.family.games[kidId] ?? []).find(g => g.id === why.gameId) : undefined;
  const reason =
    why.kind === 'job'
      ? t(lang, 'grownupSaidYes', {job: job ? textOf(job.title, lang) : ''})
      : why.kind === 'game'
        ? t(lang, 'finishedGame', {game: t(lang, game?.title ?? 'gameNumbers')})
        : t(lang, 'capReached');
  return (
    <View style={[styles.screen, styles.row, {justifyContent: 'center'}]}>
      <View style={{width: s(460), alignItems: 'center'}}>
        <Jar marbles={marblesIn(balanceOf(state, kidId))} fresh={marbles} />
        <Sparkle size={s(56)} style={{position: 'absolute', left: s(-20), top: s(380)}} />
        <Sparkle size={s(40)} style={{position: 'absolute', right: s(-10), top: s(300)}} />
      </View>
      <View style={{width: s(820), marginLeft: s(140)}}>
        <FitText text={marbles > 0 ? t(lang, 'yay') : t(lang, 'wellDone')} caps={caps} width={s(820)} max={s(260)} min={s(110)} style={{color: colors.gold, fontWeight: '700'}} />
        <FitText text={reason} caps={caps} width={s(820)} max={s(64)} min={s(34)} lines={3} style={{marginTop: s(20)}} />
        {marbles > 0 ? (
          <View style={[styles.row, {marginTop: s(36)}]}>
            <MarbleRow count={Math.min(marbles, 6)} size={s(56)} />
            <T style={{fontSize: s(56), marginLeft: s(20)}}>+{t(lang, 'minutes', {n: marbles * MIN_PER_MARBLE})}</T>
          </View>
        ) : null}
        <View style={[styles.row, {marginTop: s(50)}]}>
          <Button title={t(lang, 'ok')} primary preferred onPress={() => dispatch({type: 'go', screen: {name: 'board', kidId}})} />
        </View>
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.bg, paddingHorizontal: s(96), paddingVertical: s(54)},
  row: {flexDirection: 'row', alignItems: 'center'},
  header: {flexDirection: 'row', alignItems: 'center', height: s(110)},
  logoRow: {flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start'},
  smallChip: {flexDirection: 'row', alignItems: 'center', height: s(84), paddingHorizontal: s(32), borderRadius: s(42), backgroundColor: colors.chip},
  card: {width: s(340), height: s(480), borderRadius: s(48), paddingTop: s(30), paddingBottom: s(26), paddingHorizontal: s(20), alignItems: 'center'},
  cardArt: {width: s(230), height: s(230), borderRadius: s(115), backgroundColor: 'rgba(255,255,255,0.45)', alignItems: 'center', justifyContent: 'center'},
  badge: {position: 'absolute', top: s(-24), right: s(-24), width: s(100), height: s(100), borderRadius: s(50), backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center'},
  hint: {flexDirection: 'row', alignItems: 'center', height: s(96), paddingHorizontal: s(44), borderRadius: s(48), backgroundColor: colors.white},
  tile: {width: s(150), height: s(150), borderRadius: s(40), alignItems: 'center', justifyContent: 'center'},
});
