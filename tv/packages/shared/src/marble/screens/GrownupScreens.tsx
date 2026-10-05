import React, {useState} from 'react';
import {View} from 'react-native';
import {Avatar, Button, FitText, Focusable, Icon, T} from '../components';
import {DEMO_PIN, textOf} from '../data';
import {LANGS, t} from '../i18n';
import {useStore} from '../state';
import {colors, s} from '../theme';
import {styles} from './KidScreens';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'];

/** Grown-ups enter a PIN with the remote. (Demo PIN 1234; parents set their own from the phone in M2.) */
export function PinScreen() {
  const {state, dispatch} = useStore();
  const lang = state.lang;
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);
  const press = (key: string) => {
    if (key === 'back') return setPin(pin.slice(0, -1));
    if (key === 'ok') {
      if (pin === DEMO_PIN) dispatch({type: 'go', screen: {name: 'grownups'}});
      else {
        setWrong(true);
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
      <View style={[styles.row, {marginVertical: s(36)}]}>
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={{width: s(36), height: s(36), borderRadius: s(18), marginHorizontal: s(16), backgroundColor: i < pin.length ? colors.white : 'rgba(255,255,255,0.25)'}} />
        ))}
      </View>
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
  const minutesAgo = claim ? Math.max(0, Math.round((Date.now() - claim.at) / 60000)) : 0;

  return (
    <View style={[styles.screen, {backgroundColor: colors.bgGrownups}]}>
      <View style={styles.row}>
        <View style={{width: s(76), height: s(76), borderRadius: s(38), backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center'}}>
          <Icon name="lockopen" size={s(40)} color={colors.bgGrownups} />
        </View>
        <T style={{fontSize: s(64), marginLeft: s(22), flex: 1}}>{t(lang, 'grownups')}</T>
        <Focusable label={t(lang, 'done')} preferred={!claim} onPress={() => dispatch({type: 'go', screen: {name: 'who'}})} style={[styles.smallChip, {height: s(80)}]}>
          <T style={{fontSize: s(34), fontWeight: '500'}}>{t(lang, 'done')}</T>
        </Focusable>
      </View>
      <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
        {claim && kid && job ? (
          <>
            <T style={{fontSize: s(36), color: colors.muted, marginBottom: s(36)}}>{t(lang, 'waitingForYou', {i: 1, n: waiting.length})}</T>
            <View style={{width: s(1240), flexDirection: 'row', alignItems: 'center', padding: s(56), borderRadius: s(56), backgroundColor: colors.white}}>
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
                    key={`yes-${claim.id}`}
                    preferred
                    label={t(lang, 'approve')}
                    onPress={() => dispatch({type: 'decide', claimId: claim.id, yes: true, minutes: job.minutes})}
                    focusedStyle={{borderColor: colors.ink}}
                    style={{flexDirection: 'row', alignItems: 'center', height: s(108), paddingHorizontal: s(56), borderRadius: s(54), backgroundColor: colors.gold}}>
                    <Icon name="check" size={s(48)} />
                    <FitText text={t(lang, 'approve')} width={s(220)} max={s(48)} min={s(28)} style={{color: colors.ink, marginLeft: s(16)}} />
                  </Focusable>
                  <View style={{width: s(24)}} />
                  <Focusable
                    label={t(lang, 'notYet')}
                    onPress={() => dispatch({type: 'decide', claimId: claim.id, yes: false, minutes: 0})}
                    focusedStyle={{borderColor: colors.ink}}
                    style={{height: s(108), paddingHorizontal: s(52), borderRadius: s(54), backgroundColor: colors.tileOff, justifyContent: 'center'}}>
                    <FitText text={t(lang, 'notYet')} width={s(300)} max={s(48)} min={s(28)} style={{color: colors.ink, fontWeight: '500'}} />
                  </Focusable>
                </View>
              </View>
            </View>
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
      </View>
    </View>
  );
}
