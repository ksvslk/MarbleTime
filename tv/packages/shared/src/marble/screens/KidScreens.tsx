import React, {useEffect, useState} from 'react';
import {Image, ScrollView, StyleSheet, View} from 'react-native';
import {Avatar, ART, Button, FitText, Focusable, Icon, Jar, Marble, MarbleRow, Sparkle, T} from '../components';
import {KidId, textOf} from '../data';
import {t} from '../i18n';
import {isDone, marblesIn, State, takenToday, timeToday, useStore, Why} from '../state';
import {colors, MIN_PER_MARBLE, s} from '../theme';
import {Sound} from '../sound';
import {Appear, Flip, Twinkle} from '../motion';
import {useSay} from '../speech';

const kidOf = (state: State, id: KidId) => state.family.kids.find(k => k.id === id) ?? state.family.kids[0];
/** Kid-facing text goes through this: the language tag turns on CAPITALS when the grown-ups chose it. */
export const capsOf = (state: State) => (state.caps ? state.lang : false);

/** Screen 1 · "Who's here?" — any number of kids, any name length. */
export function WhoScreen() {
  const {state, dispatch} = useStore();
  const {lang} = state;
  const caps = capsOf(state);
  const kids = state.family.kids;
  const say = useSay();
  useEffect(() => {
    say([t(lang, 'whoTitle')]);
  }, [say, lang]);
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
          <Appear key={kid.id} from="pop" delay={120 + i * 110} style={{alignItems: 'center', marginHorizontal: s(gap), width: s(avatar + 40)}}>
            <Focusable
              preferred={i === 0}
              label={kid.name}
              onPress={() => dispatch({type: 'go', screen: {name: 'board', kidId: kid.id}})}
              style={{borderRadius: s(avatar), padding: s(6)}}>
              <Avatar art={kid.avatar} bg={kid.avatarBg} size={s(avatar)} />
            </Focusable>
            <FitText text={kid.name} caps={caps} width={s(avatar + 40)} max={s(84)} min={s(36)} lines={2} style={{marginTop: s(30), textAlign: 'center'}} />
          </Appear>
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

  // Good news from while the kid was away, one "Yay!" at a time.
  useEffect(() => {
    const next = state.celebrations.find(c => c.kidId === kidId);
    if (next) {
      dispatch({type: 'celebrated', id: next.id});
      dispatch({type: 'go', screen: {name: 'yay', kidId, marbles: next.marbles, why: next.why}});
    }
  }, [state.celebrations, kidId, dispatch]);

  const waiting = (jobId: string) => state.claims.some(c => c.kidId === kidId && c.jobId === jobId && c.status === 'waiting');
  const cards = [
    // Jobs approved today come back tomorrow (one-off jobs don't).
    ...(state.family.jobs[kidId] ?? []).filter(j => !isDone(state, kidId, j)).map(j => ({id: `job:${j.id}`, kind: 'job' as const, title: textOf(j.title, lang), color: j.color, icon: j.icon, label: '', marbles: Math.max(1, Math.round(j.minutes / MIN_PER_MARBLE)), waiting: waiting(j.id), go: () => {
        Sound.play('claim');
        dispatch({type: 'claim', kidId, jobId: j.id});
      }})),
    ...(state.family.games[kidId] ?? []).map(g => ({id: `game:${g.id}`, kind: 'game' as const, title: t(lang, g.title), color: g.color, icon: g.topic === 'puzzles' ? ('shapes' as const) : undefined, label: g.label, marbles: g.marbles, waiting: false, go: () => dispatch({type: 'go', screen: {name: 'game', kidId, gameId: g.id}})})),
  ];
  const preferredId = focusId ? (cards.find(c => c.id.endsWith(`:${focusId}`))?.id ?? cards[0]?.id) : cards[0]?.id;
  const minutes = timeToday(state, kidId);
  // Taken-away minutes are explained, calmly, for the rest of the day.
  const taken = takenToday(state, kidId);

  // Real-life jobs and TV games are both cards; two labelled groups (home, games) tell them apart.
  const groups = [
    {key: 'jobs', icon: 'home' as const, title: t(lang, 'jobsTitle'), cards: cards.filter(c => c.kind === 'job')},
    {key: 'games', icon: 'games' as const, title: t(lang, 'gamesTitle'), cards: cards.filter(c => c.kind === 'game')},
  ].filter(group => group.cards.length);
  const renderCard = (card: (typeof cards)[number]) => (
    <Appear key={card.id} from="right" distance={s(140)} delay={60 + cards.indexOf(card) * 70} style={{alignItems: 'center', marginRight: s(30)}}>
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
          {/* Between the picture and the marbles there's room for 3 lines of 36 px, or fewer, bigger ones. */}
          <FitText text={card.title} caps={caps} width={s(280)} height={s(124)} max={s(42)} min={s(22)} lines={3} style={{color: colors.ink, textAlign: 'center'}} />
        </View>
        <MarbleRow count={Math.min(card.marbles, 5)} size={s(40)} />
        {card.waiting ? (
          <Appear from="pop" delay={400} style={styles.badge}>
            <Flip>
              <Icon name="hourglass" size={s(54)} />
            </Flip>
          </Appear>
        ) : null}
      </Focusable>
      <View style={{height: s(130), justifyContent: 'center'}}>
        {focused === card.id && !card.waiting ? (
          <Appear from="up" distance={s(24)} style={styles.hint}>
            <Icon name={card.kind === 'job' ? 'thumbs' : 'play'} size={s(46)} />
            <FitText text={t(lang, card.kind === 'job' ? 'iDidIt' : 'letsPlay')} caps={caps} width={s(340)} max={s(46)} min={s(28)} style={{color: colors.ink, marginLeft: s(16)}} />
          </Appear>
        ) : null}
      </View>
    </Appear>
  );

  // Read the selected card's name once the D-pad settles on it.
  const say = useSay();
  const focusedTitle = cards.find(c => c.id === focused)?.title;
  useEffect(() => {
    if (!focusedTitle) return;
    const timer = setTimeout(() => say([focusedTitle]), 300);
    return () => clearTimeout(timer);
  }, [focusedTitle, say]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Avatar art={kid.avatar} bg={kid.avatarBg} size={s(104)} />
        <FitText text={kid.name} caps={caps} width={taken.length ? s(560) : s(1400)} max={s(80)} min={s(44)} style={{marginLeft: s(28)}} />
        {taken.length ? (
          <View style={[styles.smallChip, {marginLeft: s(40)}]}>
            <Icon name="clock" size={s(34)} color={colors.soft} />
            <FitText
              text={t(lang, 'tookAway', {n: -taken.reduce((sum, a) => sum + a.deltaMin, 0), reason: taken[0].reason})}
              caps={caps}
              width={s(820)}
              max={s(32)}
              min={s(22)}
              style={{color: colors.soft, marginLeft: s(14), fontWeight: '500'}}
            />
          </View>
        ) : null}
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginLeft: s(60)}} contentContainerStyle={{paddingVertical: s(10), paddingHorizontal: s(20)}}>
          {groups.map((group, g) => (
            <View key={group.key} style={{flexDirection: 'row'}}>
              {g > 0 ? <View style={styles.divider} /> : null}
              <View>
                <View style={[styles.row, styles.groupLabel]}>
                  <Icon name={group.icon} size={s(40)} color={colors.muted} />
                  <FitText text={group.title} caps={caps} width={s(group.cards.length * 370 - 90)} max={s(36)} min={s(24)} style={{color: colors.muted, marginLeft: s(14)}} />
                </View>
                <View style={{flexDirection: 'row'}}>{group.cards.map(renderCard)}</View>
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
  const say = useSay();
  useEffect(() => {
    say([t(lang, 'greatJob', {name: kid.name}), t(lang, 'grownupWillCheck')]);
  }, [say, lang, kid.name]);
  return (
    <View style={[styles.screen, styles.row]}>
      <View style={{flex: 1, paddingLeft: s(40)}}>
        {job ? (
          <View style={styles.row}>
            <Appear from="pop" style={[styles.tile, {backgroundColor: job.color}]}>
              <Icon name={job.icon} size={s(100)} />
            </Appear>
            <Appear from="right" delay={120}>
              <FitText text={textOf(job.title, lang)} caps={caps} width={s(780)} max={s(56)} min={s(30)} lines={2} style={{marginLeft: s(28)}} />
            </Appear>
          </View>
        ) : null}
        <Appear delay={220}>
          <FitText text={t(lang, 'greatJob', {name: kid.name})} caps={caps} width={s(980)} max={s(150)} min={s(64)} lines={3} style={{marginTop: s(40)}} />
        </Appear>
        <Appear delay={360} style={[styles.row, {marginTop: s(30)}]}>
          <Flip every={1800}>
            <Icon name="hourglass" size={s(64)} color={colors.soft} />
          </Flip>
          <FitText text={t(lang, 'grownupWillCheck')} caps={caps} width={s(880)} max={s(60)} min={s(34)} lines={2} style={{color: colors.soft, marginLeft: s(22)}} />
        </Appear>
        <Appear delay={480} style={[styles.row, {marginTop: s(50)}]}>
          <Button title={t(lang, 'ok')} primary preferred onPress={() => dispatch({type: 'go', screen: {name: 'board', kidId, focusId: jobId}})} />
          <View style={{width: s(32)}} />
          <Button title={t(lang, 'oops')} icon="undo" onPress={() => dispatch({type: 'undoClaim', kidId, jobId})} />
        </Appear>
      </View>
      <View style={{width: s(460), alignItems: 'center', marginRight: s(40)}}>
        <Jar marbles={marblesIn(timeToday(state, kidId))} />
      </View>
    </View>
  );
}

/** Screen 4 · "Yay!" — new marbles drop into the jar. */
export function YayScreen({kidId, marbles, why}: {kidId: KidId; marbles: number; why: Why}) {
  const {state, dispatch} = useStore();
  useEffect(() => Sound.play(marbles > 0 ? 'yay' : 'tryAgain'), [marbles]);
  const {lang} = state;
  const caps = capsOf(state);
  const total = timeToday(state, kidId);
  // The minutes under the jar count up as each new marble lands: one marble, five more minutes.
  const [shown, setShown] = useState(Math.max(0, total - marbles * MIN_PER_MARBLE));
  const job = why.kind === 'job' ? (state.family.jobs[kidId] ?? []).find(j => j.id === why.jobId) : undefined;
  const game = why.kind === 'game' ? (state.family.games[kidId] ?? []).find(g => g.id === why.gameId) : undefined;
  const reason =
    why.kind === 'job'
      ? t(lang, 'grownupSaidYes', {job: job ? textOf(job.title, lang) : ''})
      : why.kind === 'game'
        ? t(lang, 'finishedGame', {game: t(lang, game?.title ?? 'gameNumbers')})
        : why.kind === 'bonus'
          ? t(lang, 'bonusGiven', {reason: why.reason})
          : t(lang, 'capReached');
  const title = marbles > 0 ? t(lang, 'yay') : t(lang, 'wellDone');
  const say = useSay();
  useEffect(() => {
    const timer = setTimeout(() => say([title, reason]), 900); // after the bells
    return () => clearTimeout(timer);
  }, [say, title, reason]);
  return (
    <View style={[styles.screen, styles.row, {justifyContent: 'center'}]}>
      <View style={{width: s(460), alignItems: 'center'}}>
        <Jar marbles={marblesIn(total)} fresh={marbles} onLand={(n, of) => setShown(n >= of ? total : total - (marbles - n) * MIN_PER_MARBLE)} />
        <View style={[styles.smallChip, {marginTop: s(18)}]}>
          <Icon name="clock" size={s(40)} color={colors.white} />
          <Appear key={shown} from="pop" style={{marginLeft: s(14)}}>
            <T style={{fontSize: s(40)}}>{t(lang, 'minutes', {n: shown})}</T>
          </Appear>
        </View>
        <Twinkle style={{position: 'absolute', left: s(-20), top: s(380)}}>
          <Sparkle size={s(56)} />
        </Twinkle>
        <Twinkle delay={600} style={{position: 'absolute', right: s(-10), top: s(300)}}>
          <Sparkle size={s(40)} />
        </Twinkle>
      </View>
      <View style={{width: s(820), marginLeft: s(140)}}>
        <Appear from="pop" delay={150} style={{alignSelf: 'flex-start'}}>
          <FitText text={title} caps={caps} width={s(820)} max={s(260)} min={s(110)} style={{color: colors.gold, fontWeight: '700'}} />
        </Appear>
        <Appear delay={320}>
          <FitText text={reason} caps={caps} width={s(820)} max={s(64)} min={s(34)} lines={3} style={{marginTop: s(20)}} />
        </Appear>
        {marbles > 0 ? (
          <Appear delay={460} style={[styles.row, {marginTop: s(36)}]}>
            <MarbleRow count={Math.min(marbles, 6)} size={s(56)} />
            <T style={{fontSize: s(56), marginLeft: s(20)}}>+{t(lang, 'minutes', {n: marbles * MIN_PER_MARBLE})}</T>
          </Appear>
        ) : null}
        <Appear delay={600} style={[styles.row, {marginTop: s(50)}]}>
          <Button title={t(lang, 'ok')} primary preferred onPress={() => dispatch({type: 'go', screen: {name: 'board', kidId}})} />
        </Appear>
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
  groupLabel: {height: s(56), marginBottom: s(14), paddingLeft: s(14)},
  divider: {width: s(3), marginTop: s(90), marginBottom: s(150), marginLeft: s(6), marginRight: s(36), borderRadius: s(2), backgroundColor: 'rgba(255,255,255,0.22)'},
  tile: {width: s(150), height: s(150), borderRadius: s(40), alignItems: 'center', justifyContent: 'center'},
});
