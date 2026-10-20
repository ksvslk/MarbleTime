import React, {useEffect, useRef, useState} from 'react';
import {TextInput, View} from 'react-native';
import {api, ApiError} from '../api';
import {Avatar, Button, FitText, Icon, Sparkle, T} from '../components';
import {KidId} from '../data';
import {t} from '../i18n';
import {Appear, Flip, Twinkle} from '../motion';
import {useSay} from '../speech';
import {useStore} from '../state';
import {colors, s} from '../theme';
import {capsOf, styles} from './KidScreens';

/**
 * The kid describes their new character on the TV, in their own words (they have a character token), by typing:
 * the keyboard opens as soon as the screen appears. The line under it also says a grown-up can type it in the phone
 * app. There is no voice: the founder dropped it on Oct 19, after the remote's microphone turned out to reach the
 * app only through Fire TV's keyboard, in the stick's Alexa language, and never from the Fire TV phone app
 * (FRICTION_LOG, Oct 12-13).
 * The backend's art director screens the idea; a kind "let's try something else" comes back here and is read aloud.
 */
export function CharacterNewScreen({kidId}: {kidId: KidId}) {
  const {state, dispatch} = useStore();
  const {lang, apiUrl} = state;
  const caps = capsOf(state);
  const token = state.link?.token;
  const kid = state.family.kids.find(k => k.id === kidId) ?? state.family.kids[0];
  const [idea, setIdea] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const field = useRef<TextInput>(null);
  const say = useSay();
  // Selecting the field opens its keyboard.
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => field.current?.focus(), 600);
    return () => clearTimeout(timer);
  }, []);
  const hint = t(lang, 'characterNewHint');
  // The question and the line are read aloud.
  useEffect(() => {
    say([t(lang, 'characterNewTitle'), hint]);
  }, [say, lang, hint]);

  const draw = async () => {
    const description = idea.trim();
    if (!description || busy || !token) return;
    setBusy(true);
    setNote(null);
    try {
      const {data} = await api.createCharacter(apiUrl, token, kidId, description);
      if (data) dispatch({type: 'characterStarted', kidId, character: {id: data.id, kidId, status: 'drawing', name: data.name, createdAt: data.createdAt}});
      else dispatch({type: 'go', screen: {name: 'gallery', kidId}});
    } catch (error) {
      // The art director's kind sentence is shown and read; anything else is "try again later" (the token is kept either way).
      const kind = error instanceof ApiError && error.status === 422 ? error.message : t(lang, 'tryLater');
      setNote(kind);
      say([kind]);
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Avatar art={kid.avatar} bg={kid.avatarBg} size={s(104)} />
        <FitText text={t(lang, 'characterNewTitle')} caps={caps} width={s(1500)} max={s(72)} min={s(40)} style={{marginLeft: s(28)}} />
      </View>
      <View style={{flex: 1, justifyContent: 'center', paddingBottom: s(60)}}>
        {busy ? (
          <View style={[styles.row, {justifyContent: 'center'}]}>
            <Flip every={1400}>
              <Icon name="hourglass" size={s(110)} color={colors.soft} />
            </Flip>
            <FitText text={t(lang, 'characterDrawing')} caps={caps} width={s(1100)} max={s(64)} min={s(36)} style={{marginLeft: s(30), color: colors.soft}} />
          </View>
        ) : (
          <>
            {/* The white ring sits around the field with a gap: on the field's own edge it wouldn't show. */}
            <View style={{margin: -s(20), padding: s(10), borderWidth: s(10), borderRadius: s(64), borderColor: focused ? colors.white : 'transparent'}}>
              <TextInput
                ref={field}
                value={idea}
                onChangeText={setIdea}
                onSubmitEditing={() => void draw()}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder={t(lang, 'characterNewPlaceholder')}
                placeholderTextColor={colors.greyInk}
                maxLength={200}
                returnKeyType="done"
                style={{height: s(150), borderRadius: s(44), paddingHorizontal: s(44), backgroundColor: colors.tile, color: colors.ink, fontSize: s(54), fontFamily: 'Fredoka-SemiBold'}}
              />
            </View>
            <View style={[styles.row, {marginTop: s(40)}]}>
              <Button title={t(lang, 'drawIt')} icon="sparkle" primary onPress={() => void draw()} />
              <T style={{fontSize: s(30), marginLeft: s(30), color: colors.muted, fontWeight: '500'}}>{[...idea].length}/200</T>
            </View>
          </>
        )}
      </View>
      {/* Under Fire TV's keyboard (it ends at about three quarters of the screen), so the line is readable while it is open. */}
      {busy ? null : (
        <View style={[styles.row, {position: 'absolute', left: s(96), right: s(96), bottom: s(54), height: s(110)}]}>
          <Twinkle>
            <Sparkle size={s(56)} />
          </Twinkle>
          <FitText text={note ?? hint} caps={note ? caps : false} width={s(1560)} max={s(44)} min={s(28)} lines={2} style={{marginLeft: s(20), color: note ? colors.white : colors.soft}} />
        </View>
      )}
    </View>
  );
}
