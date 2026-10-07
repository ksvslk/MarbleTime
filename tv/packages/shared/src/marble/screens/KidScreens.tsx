import React, {useEffect, useRef, useState} from 'react';
import {Image, ScrollView, StyleSheet, View} from 'react-native';
import {Avatar, ART, Button, FitText, Focusable, Icon, Jar, Marble, MarbleRow, Sparkle, T} from '../components';
import {KidId, textOf} from '../data';
import {t} from '../i18n';
import {buddyOf, Character, drawingFor, isDone, jarSize, marblesIn, notYetToday, rewardFor, State, takenToday, timeToday, tokensOf, useStore, Why} from '../state';
import {colors, MIN_PER_MARBLE, s} from '../theme';
import {Sound} from '../sound';
import {Appear, Flip, Twinkle} from '../motion';
import {narration, useSay} from '../speech';
import {CharacterView} from '../CharacterView';
import {lineFor, Moment, playLine, useArt, useLine, useTalk} from '../characters';

const kidOf = (state: State, id: KidId) => state.family.kids.find(k => k.id === id) ?? state.family.kids[0];
/** Minutes already in the kid's jar whose "Yay!" hasn't played yet (it drops them in). */
const pendingMinutes = (state: State, id: KidId) => state.celebrations.reduce((sum, c) => sum + (c.kidId === id && 'marbles' in c ? c.marbles * MIN_PER_MARBLE : 0), 0);
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
    if (kids.length) say([t(lang, 'whoTitle')]);
  }, [say, lang, kids.length]);
  const avatar = kids.length <= 2 ? 380 : kids.length === 3 ? 320 : 250;
  const gap = kids.length <= 2 ? 90 : 40;
  return (
    <View style={[styles.screen, {alignItems: 'center'}]}>
      <View style={styles.logoRow}>
        <Image source={ART.logo} style={{width: s(56), height: s(56)}} />
        <T style={{fontSize: s(40), marginLeft: s(14)}}>MarbleTime</T>
      </View>
      {kids.length ? (
        <FitText text={t(lang, 'whoTitle')} caps={caps} width={s(1600)} max={s(120)} min={s(64)} style={{marginTop: s(24), textAlign: 'center'}} />
      ) : (
        // Paired, but no kids yet: the phone app is where they're added.
        <Appear from="up" style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
          <Icon name="message" size={s(140)} color={colors.muted} />
          <FitText text={t(lang, 'noKidsYet')} width={s(1400)} max={s(72)} min={s(40)} lines={2} style={{marginTop: s(36), textAlign: 'center'}} />
        </Appear>
      )}
      <View style={{flex: kids.length ? 1 : 0, flexDirection: 'row', alignItems: 'center'}}>
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
        <Focusable label={t(lang, 'grownups')} preferred={!kids.length} onPress={() => dispatch({type: 'go', screen: {name: 'pin'}})} style={styles.smallChip}>
          <Icon name="lock" size={s(30)} color={colors.white} />
          <FitText text={t(lang, 'grownups')} width={s(320)} max={s(30)} min={s(22)} style={{marginLeft: s(12), fontWeight: '500'}} />
        </Focusable>
      </View>
    </View>
  );
}

/** Screen 2 · the board: today's jar and one row of jobs (from the parents). */
export function BoardScreen({kidId, focusId}: {kidId: KidId; focusId?: string}) {
  const {state, dispatch} = useStore();
  const {lang} = state;
  const caps = capsOf(state);
  const kid = kidOf(state, kidId);
  const [focused, setFocused] = useState<string | null>(null);
  const [buddyFocused, setBuddyFocused] = useState(false);

  const waiting = (jobId: string) => state.claims.some(c => c.kidId === kidId && c.jobId === jobId && c.status === 'waiting');
  // Jobs approved today come back tomorrow (one-off jobs don't). Each card shows what it gives now: marbles while
  // today's jar has room, a new character once it's full, praise for a routine job.
  const cards = (state.family.jobs[kidId] ?? [])
    .filter(j => !isDone(state, kidId, j))
    .map(j => ({
      id: `job:${j.id}`,
      title: textOf(j.title, lang),
      color: j.color,
      icon: j.icon,
      gives: rewardFor(state, kidId, j),
      waiting: waiting(j.id),
      go: () => {
        Sound.play('claim');
        dispatch({type: 'claim', kidId, jobId: j.id});
      },
    }));
  const preferredId = focusId ? (cards.find(c => c.id.endsWith(`:${focusId}`))?.id ?? cards[0]?.id) : cards[0]?.id;
  // Marbles a "Yay!" is about to drop in stay out of this jar until then, so it never looks full before they land.
  const minutes = Math.max(0, timeToday(state, kidId) - pendingMinutes(state, kidId));
  const full = minutes >= jarSize(state, kidId) * MIN_PER_MARBLE;
  // Why the jar or a job changed, calmly, for the rest of the day: the newest of "not yet" and taken-away minutes.
  const taken = takenToday(state, kidId);
  const notYet = notYetToday(state, kidId)[0];
  const notYetJob = notYet && (state.family.jobs[kidId] ?? []).find(j => j.id === notYet.jobId);
  const note =
    notYetJob && (!taken.length || (notYet.decidedAt ?? notYet.at) > taken[0].at)
      ? t(lang, 'notYetNote', {job: textOf(notYetJob.title, lang)})
      : taken.length
        ? t(lang, 'tookAway', {n: -taken.reduce((sum, a) => sum + a.deltaMin, 0), reason: taken[0].reason})
        : null;

  // Top right: the kid's character, and what's new about characters (one being drawn, or one to ask for).
  const buddyArt = useArt(buddyOf(state, kidId));
  const status = drawingFor(state, kidId) ? t(lang, 'characterDrawing') : tokensOf(state, kidId) > 0 ? t(lang, 'characterWaiting') : null;
  const corner = buddyArt ? s(290) : 0;
  const noteBox = note ? (status ? s(420) : s(820) - corner / 2) : 0;
  const nameBox = Math.min(s(1400), Math.max(s(260), s(1596) - corner - (note ? noteBox + s(152) : 0) - (status ? s(300 + 134) : 0)));

  const renderCard = (card: (typeof cards)[number]) => (
    <Appear key={card.id} from="right" distance={s(140)} delay={60 + cards.indexOf(card) * 70} style={{alignItems: 'center', marginRight: s(30)}}>
      <Focusable
        preferred={card.id === preferredId}
        label={card.title}
        onPress={card.go}
        onFocusChange={f => setFocused(cur => (f ? card.id : cur === card.id ? null : cur))}
        style={[styles.card, {backgroundColor: card.color}]}>
        <View style={styles.cardArt}>
          <Icon name={card.icon} size={s(150)} />
        </View>
        <View style={{flex: 1, justifyContent: 'center'}}>
          {/* Between the picture and the marbles there's room for 3 lines of 36 px, or fewer, bigger ones. */}
          <FitText text={card.title} caps={caps} width={s(280)} height={s(124)} max={s(42)} min={s(22)} lines={3} style={{color: colors.ink, textAlign: 'center'}} />
        </View>
        {card.gives.reward === 'marbles' ? (
          <MarbleRow count={card.gives.minutes / MIN_PER_MARBLE} size={s(40)} />
        ) : (
          // A new character (the jar is full) or a thank-you (a routine job): not time, so no gold.
          <Icon name={card.gives.reward === 'character' ? 'sparkle' : 'heart'} size={s(44)} color={colors.ink} />
        )}
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
            <Icon name="thumbs" size={s(46)} />
            <FitText text={t(lang, 'iDidIt')} caps={caps} width={s(340)} max={s(46)} min={s(28)} style={{color: colors.ink, marginLeft: s(16)}} />
          </Appear>
        ) : null}
      </View>
    </Appear>
  );

  // The family's own words come from the backend's narrator: ask for this board's ahead (one at a time, gently), so a
  // card is read as soon as the D-pad lands on it.
  const token = state.link?.token;
  const toPrefetch = state.voice && token ? [t(lang, 'greatJob', {name: kid.name}), ...cards.map(c => c.title)].join('\n') : '';
  useEffect(() => {
    if (!toPrefetch || !token) return;
    toPrefetch.split('\n').reduce((done, line) => done.then(() => narration({base: state.apiUrl, token}, lang, line).then(() => undefined)), Promise.resolve());
  }, [toPrefetch, token, state.apiUrl, lang]);

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
      <View style={[styles.header, {paddingRight: corner}]}>
        <Avatar art={kid.avatar} bg={kid.avatarBg} size={s(104)} />
        <FitText text={kid.name} caps={caps} width={nameBox} max={s(80)} min={s(44)} style={{marginLeft: s(28)}} />
        {note ? (
          <View style={[styles.smallChip, {marginLeft: s(40)}]}>
            <Icon name="clock" size={s(34)} color={colors.soft} />
            <FitText
              text={note}
              caps={caps}
              width={noteBox}
              max={s(32)}
              min={s(22)}
              style={{color: colors.soft, marginLeft: s(14), fontWeight: '500'}}
            />
          </View>
        ) : null}
        {status ? (
          <Appear from="up" style={[styles.smallChip, {marginLeft: s(24)}]}>
            <Sparkle size={s(34)} />
            <FitText text={status} caps={caps} width={s(300)} max={s(28)} min={s(20)} lines={2} style={{marginLeft: s(12), fontWeight: '500'}} />
          </Appear>
        ) : null}
      </View>
      {buddyArt ? (
        // It stands on the row of cards and idles; up from the jobs selects it, and OK opens the kid's characters.
        <Appear from="pop" delay={200} style={styles.corner}>
          <Focusable label={t(lang, 'galleryTitle')} onPress={() => dispatch({type: 'go', screen: {name: 'gallery', kidId}})} onFocusChange={setBuddyFocused} style={{borderRadius: s(40)}}>
            {/* Still until selected: the board stays calm (and smooth on the stick) while kids pick a job. */}
            <CharacterView art={buddyArt} size={s(240)} still={!buddyFocused} />
          </Focusable>
          {buddyFocused ? (
            <Appear from="right" distance={s(24)} style={[styles.hint, {position: 'absolute', right: s(280), top: s(80)}]}>
              <Icon name="sparkle" size={s(40)} color={colors.ink} />
              <FitText text={t(lang, 'play')} caps={caps} width={s(240)} max={s(42)} min={s(26)} style={{color: colors.ink, marginLeft: s(14)}} />
            </Appear>
          ) : null}
        </Appear>
      ) : null}
      <View style={{flex: 1, flexDirection: 'row', alignItems: 'center'}}>
        <View style={{width: s(460), alignItems: 'center'}}>
          <Jar marbles={marblesIn(minutes)} size={jarSize(state, kidId)} />
          <View style={[styles.smallChip, {marginTop: s(18)}]}>
            <Icon name={full ? 'sparkle' : 'clock'} size={s(40)} color={colors.white} />
            <T style={{fontSize: s(40), marginLeft: s(14)}}>{full ? t(lang, 'jarFull', {n: minutes}) : t(lang, 'minutes', {n: minutes})}</T>
          </View>
          {/* What one marble is worth, for parents and older kids. */}
          <View style={[styles.row, {marginTop: s(14)}]}>
            <Marble size={s(34)} />
            <T style={{fontSize: s(30), marginLeft: s(10), color: colors.muted, fontWeight: '500'}}>{t(lang, 'marbleValue', {n: MIN_PER_MARBLE})}</T>
          </View>
        </View>
        {cards.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginLeft: s(60)}} contentContainerStyle={{paddingVertical: s(10), paddingHorizontal: s(20)}}>
            {cards.map(renderCard)}
          </ScrollView>
        ) : (
          // Nothing to do today: no jobs from the grown-ups.
          <Appear from="up" style={{flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: s(100)}}>
            <Icon name="message" size={s(96)} color={colors.muted} />
            <FitText text={t(lang, 'noCardsYet')} caps={caps} width={s(900)} max={s(56)} min={s(32)} lines={3} style={{color: colors.soft, marginLeft: s(32)}} />
          </Appear>
        )}
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
  // A grown-up said "not yet" while the kid is still here: back to the board, which says so.
  const latest = state.claims.filter(c => c.kidId === kidId && c.jobId === jobId).sort((a, b) => b.at - a.at)[0];
  useEffect(() => {
    if (latest?.status === 'rejected') dispatch({type: 'go', screen: {name: 'board', kidId, focusId: jobId}});
  }, [latest?.status, dispatch, kidId, jobId]);
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
        <Jar marbles={marblesIn(Math.max(0, timeToday(state, kidId) - pendingMinutes(state, kidId)))} size={jarSize(state, kidId)} />
      </View>
    </View>
  );
}

/**
 * Screen 4 · "Yay!": what an approved job (or a bonus) gave. The words name the job and who noticed ("Feed the
 * cat: done! – Dad"); no trait words or comparisons (docs/08 §2.3). Marbles drop into the jar; a full jar gave a new
 * character instead; a routine job gets a thank-you.
 */
export function YayScreen({kidId, marbles, why}: {kidId: KidId; marbles: number; why: Why}) {
  const {state, dispatch} = useStore();
  useEffect(() => Sound.play('yay'), []);
  const {lang} = state;
  const caps = capsOf(state);
  const total = timeToday(state, kidId);
  // The minutes under the jar count up as each new marble lands: one marble, ten more minutes.
  const [shown, setShown] = useState(Math.max(0, total - marbles * MIN_PER_MARBLE));
  const job = why.kind === 'job' ? (state.family.jobs[kidId] ?? []).find(j => j.id === why.jobId) : undefined;
  const jobTitle = job ? textOf(job.title, lang) : '';
  const reason =
    why.kind === 'bonus'
      ? t(lang, 'bonusGiven', {reason: why.reason})
      : why.approver
        ? t(lang, 'jobDoneBy', {job: jobTitle, name: why.approver})
        : t(lang, 'jobDone', {job: jobTitle});
  const reward = why.kind === 'job' ? why.reward : 'marbles';
  const title = reward === 'character' ? t(lang, 'wow') : reward === 'praise' ? t(lang, 'thankYou') : t(lang, 'yay');
  const extra = reward === 'character' ? t(lang, 'newCharacter') : null;
  // The kid's character joins in: it hops when the marbles are in, then says a line after the read-aloud (English).
  const kid = kidOf(state, kidId);
  const buddy = buddyOf(state, kidId);
  const art = useArt(buddy);
  const moment: Moment = why.kind === 'bonus' ? 'bonus' : reward;
  const seed = `${kidId}:${why.kind === 'job' ? why.jobId : why.reason}:${marbles}`;
  const line = useLine(buddy, art ? lineFor(moment, seed, {kid: kid.name, name: buddy?.name}, lang) : null);
  const [cheer, setCheer] = useState(0);
  useEffect(() => {
    if (marbles > 0) return; // it hops when the last marble lands
    const timer = setTimeout(() => setCheer(1), 700);
    return () => clearTimeout(timer);
  }, [marbles]);
  const say = useSay();
  const sayLine = line.say;
  useEffect(() => {
    // After the bells; the character speaks once the narrator's lines are queued.
    const timer = setTimeout(() => {
      say(extra ? [title, reason, extra] : [title, reason]).then(sayLine);
    }, 900);
    return () => clearTimeout(timer);
  }, [say, sayLine, title, reason, extra]);
  const textBox = art ? s(700) : s(820);
  return (
    <View style={[styles.screen, styles.row, {justifyContent: 'center'}]}>
      <View style={{width: s(460), alignItems: 'center'}}>
        <Jar
          marbles={marblesIn(total)}
          size={jarSize(state, kidId)}
          fresh={marbles}
          onLand={(n, of) => {
            setShown(n >= of ? total : total - (marbles - n) * MIN_PER_MARBLE);
            if (n >= of) setCheer(c => c + 1);
          }}
        />
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
      <View style={{width: textBox, marginLeft: art ? s(90) : s(140)}}>
        <Appear from="pop" delay={150} style={{alignSelf: 'flex-start'}}>
          <FitText text={title} caps={caps} width={textBox} max={s(260)} min={s(110)} style={{color: colors.gold, fontWeight: '700'}} />
        </Appear>
        <Appear delay={320}>
          <FitText text={reason} caps={caps} width={textBox} max={s(64)} min={s(34)} lines={3} style={{marginTop: s(20)}} />
        </Appear>
        {extra ? (
          <Appear from="pop" delay={460} style={[styles.row, {marginTop: s(36)}]}>
            <Twinkle>
              <Sparkle size={s(72)} />
            </Twinkle>
            <FitText text={extra} caps={caps} width={textBox - s(100)} max={s(56)} min={s(30)} lines={2} style={{marginLeft: s(24)}} />
          </Appear>
        ) : null}
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
      {art ? (
        <Appear from="pop" delay={300} style={{marginLeft: s(30)}}>
          <CharacterView art={art} size={s(400)} cheer={cheer} speech={line.speech} />
        </Appear>
      ) : null}
    </View>
  );
}

/**
 * Screen 5 · "Meet …!": a character, just drawn from the kid's own words, waves and says hello (once per
 * character, on this TV). Its name comes from the backend's art director; it speaks English.
 */
export function MeetScreen({kidId, characterId}: {kidId: KidId; characterId: string}) {
  const {state, dispatch} = useStore();
  const {lang} = state;
  const caps = capsOf(state);
  const kid = kidOf(state, kidId);
  const character = state.characters.find(c => c.id === characterId && c.kidId === kidId && c.status === 'ready');
  const art = useArt(character);
  const name = character?.name ?? art?.name ?? '';
  const line = useLine(character, character ? lineFor('meet', character.id, {kid: kid.name, name}, lang) : null);
  useEffect(() => Sound.play('yay'), []);
  const sayLine = line.say;
  useEffect(() => {
    const timer = setTimeout(sayLine, 1100); // after the bells, once it has popped in
    return () => clearTimeout(timer);
  }, [sayLine]);
  // A grown-up removed it meanwhile: back to the board.
  useEffect(() => {
    if (!character) dispatch({type: 'go', screen: {name: 'board', kidId}});
  }, [character, dispatch, kidId]);
  return (
    <View style={[styles.screen, {alignItems: 'center'}]}>
      <Appear from="up">
        <FitText text={t(lang, 'yourNewCharacter')} caps={caps} width={s(1200)} max={s(44)} min={s(28)} style={{color: colors.soft, textAlign: 'center'}} />
      </Appear>
      <Appear from="pop" delay={150}>
        <FitText text={name} caps={caps} width={s(1400)} max={s(110)} min={s(56)} style={{marginTop: s(4), textAlign: 'center'}} />
      </Appear>
      <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
        {art ? (
          <Appear from="pop" delay={300}>
            <CharacterView art={art} size={s(560)} wave={1} speech={line.speech} />
          </Appear>
        ) : (
          <Twinkle>
            <Sparkle size={s(120)} />
          </Twinkle>
        )}
        <Twinkle delay={300} style={{position: 'absolute', left: s(-140), top: s(120)}}>
          <Sparkle size={s(64)} />
        </Twinkle>
        <Twinkle delay={900} style={{position: 'absolute', right: s(-120), top: s(260)}}>
          <Sparkle size={s(48)} />
        </Twinkle>
      </View>
      <Appear delay={600}>
        <Button title={t(lang, 'ok')} primary preferred onPress={() => dispatch({type: 'go', screen: {name: 'board', kidId}})} />
      </Appear>
    </View>
  );
}

/**
 * Screen 6 · the kid's characters, newest first, in one row. The selected one comes alive; OK makes it wave or hop and
 * say its next line (pre-written, English). Back goes to the board.
 */
export function GalleryScreen({kidId}: {kidId: KidId}) {
  const {state, dispatch} = useStore();
  const {lang} = state;
  const caps = capsOf(state);
  const kid = kidOf(state, kidId);
  const characters = state.characters.filter(c => c.kidId === kidId && c.status === 'ready').sort((a, b) => b.createdAt - a.createdAt);
  // A grown-up removed the last one meanwhile: back to the board.
  useEffect(() => {
    if (!characters.length) dispatch({type: 'go', screen: {name: 'board', kidId}});
  }, [characters.length, dispatch, kidId]);
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Avatar art={kid.avatar} bg={kid.avatarBg} size={s(104)} />
        <FitText text={kid.name} caps={caps} width={s(700)} max={s(80)} min={s(44)} style={{marginLeft: s(28)}} />
        <View style={[styles.smallChip, {marginLeft: s(40)}]}>
          <Sparkle size={s(34)} />
          <FitText text={t(lang, 'galleryTitle')} caps={caps} width={s(500)} max={s(32)} min={s(22)} style={{marginLeft: s(14), fontWeight: '500'}} />
        </View>
      </View>
      <View style={{flex: 1, justifyContent: 'center'}}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexGrow: 0}} contentContainerStyle={{paddingVertical: s(10), paddingHorizontal: s(20)}}>
          {characters.map((c, i) => (
            <Appear key={c.id} from="right" distance={s(140)} delay={60 + i * 70}>
              <CharacterCard character={c} kidName={kid.name} preferred={i === 0} />
            </Appear>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function CharacterCard({character, kidName, preferred}: {character: Character; kidName: string; preferred: boolean}) {
  const {state} = useStore();
  const caps = capsOf(state);
  const art = useArt(character);
  const {speech, talk} = useTalk(character);
  const [focused, setFocused] = useState(false);
  const [cheer, setCheer] = useState(0);
  const [wave, setWave] = useState(0);
  const presses = useRef(0);
  const press = () => {
    const n = presses.current++;
    if (n % 2) setCheer(c => c + 1);
    else setWave(w => w + 1);
    talk(playLine(character.id, n, {kid: kidName, name: character.name}, state.lang));
  };
  return (
    <View style={{alignItems: 'center', marginRight: s(30)}}>
      <Focusable preferred={preferred} label={character.name} onPress={press} onFocusChange={setFocused} style={styles.characterCard}>
        {art ? (
          <CharacterView art={art} size={s(320)} still={!focused} cheer={cheer} wave={wave} speech={speech} />
        ) : (
          <View style={{width: s(320), height: s(320), alignItems: 'center', justifyContent: 'center'}}>
            <Twinkle>
              <Sparkle size={s(80)} />
            </Twinkle>
          </View>
        )}
        <FitText text={character.name ?? ''} caps={caps} width={s(320)} max={s(40)} min={s(24)} lines={2} style={{textAlign: 'center', marginTop: s(8)}} />
      </Focusable>
      <View style={{height: s(130), justifyContent: 'center'}}>
        {focused ? (
          <Appear from="up" distance={s(24)} style={styles.hint}>
            <Icon name="sparkle" size={s(44)} color={colors.ink} />
            <FitText text={t(state.lang, 'play')} caps={caps} width={s(260)} max={s(46)} min={s(28)} style={{color: colors.ink, marginLeft: s(16)}} />
          </Appear>
        ) : null}
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
  corner: {position: 'absolute', top: s(14), right: s(86)},
  characterCard: {width: s(380), height: s(480), borderRadius: s(48), paddingTop: s(20), alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.10)'},
});
