import React, {useEffect, useRef, useState} from 'react';
import {Animated, Easing, Platform, View} from 'react-native';
import {api} from '../api';
import {Avatar, Button, FitText, Focusable, Icon, T} from '../components';
import {Job, Kid, textOf} from '../data';
import {Lang, LANGS, t} from '../i18n';
import {QrCode} from '../QrCode';
import {checkPin, Claim, useStore} from '../state';
import {session} from '../sync';
import {colors, s} from '../theme';
import {styles} from './KidScreens';
import {Appear, Shake} from '../motion';
import {Sound} from '../sound';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'];

/** Grown-ups enter a PIN with the remote: the demo PIN 1234 until the TV is paired, then the family's own. */
export function PinScreen() {
  const {state, dispatch} = useStore();
  const lang = state.lang;
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);
  const [tries, setTries] = useState(0);
  const press = (key: string) => {
    if (key === 'back') return setPin(pin.slice(0, -1));
    if (key === 'ok') {
      if (checkPin(state, pin)) {
        session.pin = pin; // sent with any decision made on this TV
        dispatch({type: 'go', screen: {name: 'grownups'}});
      }
      else {
        Sound.play('tryAgain', 0.6);
        setWrong(true);
        setTries(tries + 1);
        setPin('');
      }
      return;
    }
    if (pin.length < 4) {
      setWrong(false);
      setPin(pin + key);
    }
  };
  return (
    <View style={[styles.screen, {backgroundColor: colors.bgGrownups, alignItems: 'center'}]}>
      <View style={styles.row}>
        <Icon name="lock" size={s(56)} color={colors.white} />
        <T style={{fontSize: s(64), marginLeft: s(20)}}>{t(lang, 'grownups')}</T>
      </View>
      <T style={{fontSize: s(36), color: wrong ? colors.goldLight : colors.muted, marginTop: s(16)}}>{wrong ? t(lang, 'wrongPin') : t(lang, 'enterPin')}</T>
      <Shake trigger={tries} style={[styles.row, {marginVertical: s(36)}]}>
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={{width: s(36), height: s(36), borderRadius: s(18), marginHorizontal: s(16), backgroundColor: i < pin.length ? colors.white : 'rgba(255,255,255,0.25)'}} />
        ))}
      </Shake>
      <View style={{width: s(3 * 190), flexDirection: 'row', flexWrap: 'wrap'}}>
        {KEYS.map((key, i) => (
          <Focusable key={key} preferred={i === 0} label={key} onPress={() => press(key)} style={{width: s(170), height: s(120), margin: s(10), borderRadius: s(30), backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center'}}>
            {key === 'back' ? <Icon name="undo" size={s(48)} color={colors.white} /> : key === 'ok' ? <Icon name="check" size={s(52)} color={colors.white} /> : <T style={{fontSize: s(56)}}>{key}</T>}
          </Focusable>
        ))}
      </View>
    </View>
  );
}

/** Screen 6 · one waiting job at a time: Yes / Not yet. */
export function GrownupsScreen() {
  const {state, dispatch} = useStore();
  const lang = state.lang;
  const waiting = state.claims.filter(c => c.status === 'waiting');
  const claim = waiting[0];
  const kid = claim && state.family.kids.find(k => k.id === claim.kidId);
  const job = claim && (state.family.jobs[claim.kidId] ?? []).find(j => j.id === claim.jobId);

  return (
    <View style={[styles.screen, {backgroundColor: colors.bgGrownups}]}>
      <View style={styles.row}>
        <View style={{width: s(76), height: s(76), borderRadius: s(38), backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center'}}>
          <Icon name="lockopen" size={s(40)} color={colors.bgGrownups} />
        </View>
        <T style={{fontSize: s(64), marginLeft: s(22), flex: 1}}>{t(lang, 'grownups')}</T>
        {state.link ? (
          <FitText text={t(lang, 'connectedTo', {family: state.link.familyName || '…'})} width={s(560)} max={s(32)} min={s(22)} style={{color: colors.muted, fontWeight: '500', marginRight: s(24)}} />
        ) : (
          <Focusable label={t(lang, 'connectPhone')} onPress={() => dispatch({type: 'go', screen: {name: 'pair'}})} style={[styles.smallChip, {height: s(80), marginRight: s(16)}]}>
            <Icon name="message" size={s(30)} color={colors.white} />
            <FitText text={t(lang, 'connectPhone')} width={s(360)} max={s(34)} min={s(22)} style={{fontWeight: '500', marginLeft: s(12)}} />
          </Focusable>
        )}
        <Focusable label={t(lang, 'done')} preferred={!claim} onPress={() => dispatch({type: 'go', screen: {name: 'who'}})} style={[styles.smallChip, {height: s(80)}]}>
          <T style={{fontSize: s(34), fontWeight: '500'}}>{t(lang, 'done')}</T>
        </Focusable>
      </View>
      <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
        {claim && kid && job ? (
          <>
            <T style={{fontSize: s(36), color: colors.muted, marginBottom: s(36)}}>{t(lang, 'waitingForYou', {i: 1, n: waiting.length})}</T>
            <ClaimCard
              key={claim.id}
              claim={claim}
              kid={kid}
              job={job}
              lang={lang}
              onDecide={yes => dispatch({type: 'decide', claimId: claim.id, yes, minutes: yes ? job.minutes : 0})}
            />
          </>
        ) : (
          <>
            <FitText text={t(lang, 'noJobs')} width={s(1500)} max={s(64)} min={s(36)} lines={2} style={{textAlign: 'center'}} />
            <FitText text={t(lang, 'noJobsHint')} width={s(1500)} max={s(36)} min={s(24)} lines={2} style={{color: colors.muted, marginTop: s(16), textAlign: 'center'}} />
            <View style={{marginTop: s(40)}}>
              <Button title={t(lang, 'back')} onPress={() => dispatch({type: 'go', screen: {name: 'who'}})} size={0.8} />
            </View>
          </>
        )}
      </View>
      {state.link ? (
        // Paired: the phone app owns the settings (they arrive with every sync).
        <View style={[styles.row, {justifyContent: 'center'}]}>
          <FitText text={t(lang, 'settingsOnPhone')} width={s(900)} max={s(32)} min={s(22)} style={{color: colors.muted, fontWeight: '500', marginRight: s(24)}} />
          <Focusable label={t(lang, 'disconnect')} onPress={() => dispatch({type: 'unlink'})} style={{height: s(76), paddingHorizontal: s(32), borderRadius: s(38), justifyContent: 'center', backgroundColor: colors.chip}}>
            <T style={{fontSize: s(30), fontWeight: '500'}}>{t(lang, 'disconnect')}</T>
          </Focusable>
        </View>
      ) : (
        <View style={[styles.row, {justifyContent: 'center'}]}>
          <T style={{fontSize: s(32), color: colors.muted, marginRight: s(24), fontWeight: '500'}}>{t(lang, 'language')}</T>
          {LANGS.map(option => {
            const selected = option.id === lang;
            return (
              <Focusable
                key={option.id}
                label={option.label}
                onPress={() => dispatch({type: 'setLang', lang: option.id})}
                style={{height: s(76), paddingHorizontal: s(32), marginHorizontal: s(8), borderRadius: s(38), justifyContent: 'center', backgroundColor: selected ? colors.white : colors.chip}}>
                <T style={{fontSize: s(32), color: selected ? colors.ink : colors.white, fontWeight: selected ? '700' : '500'}}>{option.label}</T>
              </Focusable>
            );
          })}
          <Focusable
            label={t(lang, 'capitals')}
            onPress={() => dispatch({type: 'setCaps', caps: !state.caps})}
            style={{flexDirection: 'row', alignItems: 'center', height: s(76), paddingHorizontal: s(28), marginLeft: s(40), borderRadius: s(38), backgroundColor: state.caps ? colors.white : colors.chip}}>
            {state.caps ? <Icon name="check" size={s(30)} color={colors.ink} style={{marginRight: s(10)}} /> : null}
            <T style={{fontSize: s(30), color: state.caps ? colors.ink : colors.white, fontWeight: state.caps ? '700' : '500'}}>{t(lang, 'capitals')}</T>
          </Focusable>
          <Focusable
            label={t(lang, 'readAloud')}
            onPress={() => dispatch({type: 'setVoice', voice: !state.voice})}
            style={{flexDirection: 'row', alignItems: 'center', height: s(76), paddingHorizontal: s(28), marginLeft: s(16), borderRadius: s(38), backgroundColor: state.voice ? colors.white : colors.chip}}>
            <Icon name="speaker" size={s(30)} color={state.voice ? colors.ink : colors.white} style={{marginRight: s(10)}} />
            <T style={{fontSize: s(30), color: state.voice ? colors.ink : colors.white, fontWeight: state.voice ? '700' : '500'}}>{t(lang, 'readAloud')}</T>
          </Focusable>
        </View>
      )}
    </View>
  );
}

type PairStatus = 'loading' | 'waiting' | 'paired' | 'expired' | 'offline';

/**
 * "Connect a phone": the TV asks the backend for a short code and shows it as a QR code of the parent app's
 * pairing link. The parent scans it, signs in and says yes; the TV, polling, gets its device token once.
 */
export function PairScreen() {
  const {state, dispatch} = useStore();
  const {lang, apiUrl} = state;
  const [pairing, setPairing] = useState<{code: string; pairUrl: string} | null>(null);
  const [status, setStatus] = useState<PairStatus>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setStatus('loading');
    api
      .createPairing(apiUrl, Platform.OS === 'android' ? 'fireos' : 'vega')
      .then(created => {
        if (stopped) return;
        setPairing(created);
        setStatus('waiting');
        const poll = async () => {
          try {
            const answer = await api.pairingStatus(apiUrl, created.code);
            if (stopped) return;
            if (answer.status === 'paired' && answer.deviceToken) {
              Sound.play('yay');
              setStatus('paired');
              dispatch({type: 'linked', link: {token: answer.deviceToken, deviceId: answer.deviceId ?? '', familyName: '', pin: null}});
              timer = setTimeout(() => dispatch({type: 'go', screen: {name: 'who'}}), 2500);
              return;
            }
            // "paired" without a token: it was handed out already (or the TV was removed), so start over.
            if (answer.status !== 'waiting' || Date.now() > created.expiresAt) return setStatus('expired');
          } catch {
            // A blip: keep asking.
          }
          timer = setTimeout(poll, 2000);
        };
        poll();
      })
      .catch(() => !stopped && setStatus('offline'));
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [apiUrl, attempt, dispatch]);

  const message = {loading: 'pairWaiting', waiting: 'pairWaiting', paired: 'pairDone', expired: 'pairExpired', offline: 'pairOffline'} as const;
  return (
    <View style={[styles.screen, styles.row, {backgroundColor: colors.bgGrownups, justifyContent: 'center'}]}>
      <View style={{width: s(560), height: s(560), borderRadius: s(48), backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center'}}>
        {pairing && status === 'waiting' ? <QrCode value={pairing.pairUrl} size={s(500)} /> : <Icon name={status === 'paired' ? 'check' : 'message'} size={s(200)} color={colors.bgGrownups} />}
      </View>
      <View style={{width: s(820), marginLeft: s(100)}}>
        <FitText text={t(lang, 'pairTitle')} width={s(820)} max={s(84)} min={s(48)} style={{fontWeight: '700'}} />
        <FitText text={t(lang, 'pairSteps')} width={s(820)} max={s(44)} min={s(28)} lines={3} style={{color: colors.soft, marginTop: s(24)}} />
        {pairing && status === 'waiting' ? <T style={{fontSize: s(72), letterSpacing: s(12), marginTop: s(36), fontWeight: '700'}}>{pairing.code}</T> : null}
        <FitText text={t(lang, message[status])} width={s(820)} max={s(40)} min={s(26)} lines={2} style={{color: status === 'paired' ? colors.goldLight : colors.muted, marginTop: s(30), fontWeight: '500'}} />
        <View style={[styles.row, {marginTop: s(44)}]}>
          {status === 'expired' || status === 'offline' ? (
            <>
              <Button title={t(lang, 'newCode')} primary preferred onPress={() => setAttempt(n => n + 1)} size={0.8} />
              <View style={{width: s(24)}} />
            </>
          ) : null}
          {status !== 'paired' ? <Button title={t(lang, 'back')} preferred={status !== 'expired' && status !== 'offline'} onPress={() => dispatch({type: 'go', screen: {name: 'grownups'}})} size={0.8} /> : null}
        </View>
      </View>
    </View>
  );
}

/** One waiting job. A decision lifts it away (a marble clinks for Yes), then the next one comes in. */
function ClaimCard({claim, kid, job, lang, onDecide}: {claim: Claim; kid: Kid; job: Job; lang: Lang; onDecide: (yes: boolean) => void}) {
  const out = useRef(new Animated.Value(0)).current;
  const decided = useRef(false);
  const minutesAgo = Math.max(0, Math.round((Date.now() - claim.at) / 60000));
  const decide = (yes: boolean) => {
    if (decided.current) return;
    decided.current = true;
    if (yes) Sound.play('clink');
    Animated.timing(out, {toValue: 1, duration: 280, easing: Easing.in(Easing.cubic), useNativeDriver: true}).start(() => onDecide(yes));
  };
  return (
    <Appear from="up" distance={s(60)}>
      <Animated.View
        style={{
          width: s(1240),
          flexDirection: 'row',
          alignItems: 'center',
          padding: s(56),
          borderRadius: s(56),
          backgroundColor: colors.white,
          opacity: out.interpolate({inputRange: [0, 1], outputRange: [1, 0]}),
          transform: [{translateY: out.interpolate({inputRange: [0, 1], outputRange: [0, -s(70)]})}, {scale: out.interpolate({inputRange: [0, 1], outputRange: [1, 0.96]})}],
        }}>
        <View>
          <View style={{width: s(250), height: s(250), borderRadius: s(60), backgroundColor: job.color, alignItems: 'center', justifyContent: 'center'}}>
            <Icon name={job.icon} size={s(160)} />
          </View>
          <View style={{position: 'absolute', right: s(-24), bottom: s(-24), borderWidth: s(8), borderColor: colors.white, borderRadius: s(70)}}>
            <Avatar art={kid.avatar} bg={kid.avatarBg} size={s(116)} />
          </View>
        </View>
        <View style={{flex: 1, marginLeft: s(60)}}>
          <FitText text={textOf(job.title, lang)} width={s(760)} max={s(72)} min={s(36)} lines={2} style={{color: colors.ink}} />
          <FitText text={t(lang, 'saysDone', {kid: kid.name, ago: minutesAgo, plus: job.minutes})} width={s(760)} max={s(38)} min={s(24)} lines={2} style={{color: colors.greyInk, marginTop: s(14), fontWeight: '500'}} />
          <View style={[styles.row, {marginTop: s(40)}]}>
            <Focusable
              preferred
              label={t(lang, 'approve')}
              onPress={() => decide(true)}
              focusedStyle={{borderColor: colors.ink}}
              style={{flexDirection: 'row', alignItems: 'center', height: s(108), paddingHorizontal: s(56), borderRadius: s(54), backgroundColor: colors.gold}}>
              <Icon name="check" size={s(48)} />
              <FitText text={t(lang, 'approve')} width={s(220)} max={s(48)} min={s(28)} style={{color: colors.ink, marginLeft: s(16)}} />
            </Focusable>
            <View style={{width: s(24)}} />
            <Focusable
              label={t(lang, 'notYet')}
              onPress={() => decide(false)}
              focusedStyle={{borderColor: colors.ink}}
              style={{height: s(108), paddingHorizontal: s(52), borderRadius: s(54), backgroundColor: colors.tileOff, justifyContent: 'center'}}>
              <FitText text={t(lang, 'notYet')} width={s(300)} max={s(48)} min={s(28)} style={{color: colors.ink, fontWeight: '500'}} />
            </Focusable>
          </View>
        </View>
      </Animated.View>
    </Appear>
  );
}
