import React, {useEffect, useState} from 'react';
import {Image, ScrollView, StyleSheet, View} from 'react-native';
import {Avatar, ART, Button, Focusable, Icon, Jar, MarbleRow, Sparkle, T} from '../components';
import {GAMES, JOBS, KIDS, KidId} from '../data';
import {marblesIn, useStore} from '../state';
import {colors, MIN_PER_MARBLE, s} from '../theme';

const kidOf = (id: KidId) => KIDS.find(k => k.id === id)!;

/** Screen 1 · "Who's here?" */
export function WhoScreen() {
  const {dispatch} = useStore();
  return (
    <View style={[styles.screen, {alignItems: 'center'}]}>
      <View style={styles.logoRow}>
        <Image source={ART.logo} style={{width: s(56), height: s(56)}} />
        <T style={{fontSize: s(40), marginLeft: s(14)}}>MarbleTime</T>
      </View>
      <T style={{fontSize: s(120), marginTop: s(24)}}>Who’s here?</T>
      <View style={{flex: 1, flexDirection: 'row', alignItems: 'center'}}>
        {KIDS.map((kid, i) => (
          <View key={kid.id} style={{alignItems: 'center', marginHorizontal: s(90)}}>
            <Focusable
              preferred={i === 0}
              label={kid.name}
              onPress={() => dispatch({type: 'go', screen: {name: 'board', kidId: kid.id}})}
              style={{borderRadius: s(220), padding: s(6)}}>
              <Avatar art={kid.avatar} bg={kid.avatarBg} size={s(380)} />
            </Focusable>
            <T style={{fontSize: s(84), marginTop: s(36)}}>{kid.name}</T>
          </View>
        ))}
      </View>
      <View style={{position: 'absolute', right: s(96), bottom: s(54)}}>
        <Focusable label="Grown-ups" onPress={() => dispatch({type: 'go', screen: {name: 'pin'}})} style={styles.smallChip}>
          <Icon name="lock" size={s(30)} color={colors.white} />
          <T style={{fontSize: s(30), marginLeft: s(12), fontWeight: '500'}}>Grown-ups</T>
        </Focusable>
      </View>
    </View>
  );
}

/** Screen 2 · the board: the jar and one row of cards (jobs from parents, games from AI). */
export function BoardScreen({kidId, focusId}: {kidId: KidId; focusId?: string}) {
  const {state, dispatch} = useStore();
  const kid = kidOf(kidId);
  const [focused, setFocused] = useState<string | null>(null);

  useEffect(() => {
    const mine = state.celebrations.filter(c => c.kidId === kidId);
    if (mine.length) {
      dispatch({type: 'celebrated', kidId});
      dispatch({type: 'go', screen: {name: 'yay', kidId, marbles: mine.reduce((a, c) => a + c.marbles, 0), reason: mine[mine.length - 1].reason}});
    }
  }, [state.celebrations, kidId, dispatch]);

  const waiting = (jobId: string) => state.claims.some(c => c.kidId === kidId && c.jobId === jobId && c.status === 'waiting');
  const cards = [
    ...JOBS[kidId].map(j => ({id: `job:${j.id}`, kind: 'job' as const, title: j.title, color: j.color, icon: j.icon, label: '', marbles: j.minutes / MIN_PER_MARBLE, waiting: waiting(j.id), go: () => dispatch({type: 'claim', kidId, jobId: j.id})})),
    ...GAMES[kidId].map(g => ({id: `game:${g.id}`, kind: 'game' as const, title: g.title, color: g.color, icon: g.topic === 'puzzles' ? ('shapes' as const) : undefined, label: g.label, marbles: g.marbles, waiting: false, go: () => dispatch({type: 'go', screen: {name: 'game', kidId, gameId: g.id}})})),
  ];
  const preferredId = focusId ? (cards.find(c => c.id.endsWith(`:${focusId}`))?.id ?? cards[0].id) : cards[0].id;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Avatar art={kid.avatar} bg={kid.avatarBg} size={s(104)} />
        <T style={{fontSize: s(80), marginLeft: s(28)}}>{kid.name}</T>
      </View>
      <View style={{flex: 1, flexDirection: 'row', alignItems: 'center'}}>
        <View style={{width: s(460), alignItems: 'center'}}>
          <Jar marbles={marblesIn(state.balances[kidId])} />
          <View style={[styles.smallChip, {marginTop: s(18)}]}>
            <Icon name="clock" size={s(40)} color={colors.white} />
            <T style={{fontSize: s(40), marginLeft: s(14)}}>{state.balances[kidId]} min</T>
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
                <T style={{fontSize: s(46), color: colors.ink, marginTop: s(22)}} numberOfLines={1}>{card.title}</T>
                <View style={{flex: 1}} />
                <MarbleRow count={card.marbles} size={s(40)} />
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
                    <T style={{fontSize: s(46), color: colors.ink, marginLeft: s(16)}}>{card.kind === 'job' ? 'I did it!' : 'Let’s play!'}</T>
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
  const kid = kidOf(kidId);
  const job = JOBS[kidId].find(j => j.id === jobId)!;
  return (
    <View style={[styles.screen, styles.row]}>
      <View style={{flex: 1, paddingLeft: s(40)}}>
        <View style={styles.row}>
          <View style={[styles.tile, {backgroundColor: job.color}]}>
            <Icon name={job.icon} size={s(100)} />
          </View>
          <T style={{fontSize: s(56), marginLeft: s(28)}}>{job.title}</T>
        </View>
        <T style={{fontSize: s(150), lineHeight: s(150), marginTop: s(40)}}>{`Great job,\n${kid.name}!`}</T>
        <View style={[styles.row, {marginTop: s(30)}]}>
          <Icon name="hourglass" size={s(64)} color={colors.soft} />
          <T style={{fontSize: s(60), color: colors.soft, marginLeft: s(22)}}>A grown-up will check.</T>
        </View>
        <View style={[styles.row, {marginTop: s(50)}]}>
          <Button title="OK" primary preferred onPress={() => dispatch({type: 'go', screen: {name: 'board', kidId, focusId: jobId}})} />
          <View style={{width: s(32)}} />
          <Button title="Oops!" icon="undo" onPress={() => dispatch({type: 'undoClaim', kidId, jobId})} />
        </View>
      </View>
      <View style={{width: s(460), alignItems: 'center', marginRight: s(40)}}>
        <Jar marbles={marblesIn(state.balances[kidId])} />
      </View>
    </View>
  );
}

/** Screen 4 · "Yay!" — new marbles drop into the jar. */
export function YayScreen({kidId, marbles, reason}: {kidId: KidId; marbles: number; reason: string}) {
  const {state, dispatch} = useStore();
  return (
    <View style={[styles.screen, styles.row, {justifyContent: 'center'}]}>
      <View style={{width: s(460), alignItems: 'center'}}>
        <Jar marbles={marblesIn(state.balances[kidId])} fresh={marbles} />
        <Sparkle size={s(56)} style={{position: 'absolute', left: s(-20), top: s(380)}} />
        <Sparkle size={s(40)} style={{position: 'absolute', right: s(-10), top: s(300)}} />
      </View>
      <View style={{width: s(820), marginLeft: s(140)}}>
        <T style={{fontSize: s(260), lineHeight: s(260), color: colors.gold, fontWeight: '700'}}>{marbles > 0 ? 'Yay!' : 'Well done!'}</T>
        <T style={{fontSize: s(64), marginTop: s(20)}}>{reason}</T>
        {marbles > 0 ? (
          <View style={[styles.row, {marginTop: s(36)}]}>
            <MarbleRow count={marbles} size={s(56)} />
            <T style={{fontSize: s(56), marginLeft: s(20)}}>+{marbles * MIN_PER_MARBLE} min</T>
          </View>
        ) : null}
        <View style={[styles.row, {marginTop: s(50)}]}>
          <Button title="OK" primary preferred onPress={() => dispatch({type: 'go', screen: {name: 'board', kidId}})} />
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
