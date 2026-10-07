import React, {useEffect} from 'react';
import {BackHandler, Linking, View} from 'react-native';
import {KidId, SAMPLE_FAMILY, STRESS_FAMILY} from './data';
import {LANGS, Lang} from './i18n';
import {celebrationToShow, firstSyncPending, needsPairing, StoreProvider, useStore} from './state';
import {Sound} from './sound';
import {Speech} from './speech';
import {colors} from './theme';
import {BoardScreen, ClaimedScreen, GalleryScreen, MeetScreen, WhoScreen, YayScreen} from './screens/KidScreens';
import {GrownupsScreen, PairScreen, PinScreen} from './screens/GrownupScreens';
import {SyncLoop} from './sync';
import {Appear} from './motion';
import {ArtPrefetch} from './characters';

function Router() {
  const {state, dispatch} = useStore();
  const screen = state.screen;

  // Test link: marbletime://open?screen=board&kid=mia&lang=et (screen: who|board|pin|yay, with reward=marbles|character|praise and n;
  // meet, with character=<id> of one of the paired family's ready characters; gallery;
  // api=<backend URL> points the TV at another backend, e.g. the dev server on the Mac; stress=1 / stress=0 load
  // test families for layout checks, which work without pairing).
  // It never opens the grown-ups area directly: the PIN screen still guards it.
  useEffect(() => {
    const handle = (url: string | null) => {
      if (!url || !url.startsWith('marbletime://')) return;
      const params: Record<string, string> = {};
      (url.split('?')[1] ?? '').split('&').forEach(pair => {
        const [k, v] = pair.split('=');
        if (k) params[k] = decodeURIComponent(v ?? '');
      });
      if (params.stress === '1') dispatch({type: 'setFamily', family: STRESS_FAMILY, balances: {max: 115, onnela: 5, jo: 0}});
      if (params.stress === '0') dispatch({type: 'setFamily', family: SAMPLE_FAMILY, balances: {mia: 35, leo: 20}});
      if (params.caps === '1' || params.caps === '0') dispatch({type: 'setCaps', caps: params.caps === '1'});
      if (/^https?:\/\/[^\s]+$/.test(params.api ?? '')) dispatch({type: 'setApi', url: params.api});
      if (LANGS.some(l => l.id === params.lang)) dispatch({type: 'setLang', lang: params.lang as Lang});
      const kidId: KidId = params.kid ?? 'mia';
      if (params.screen === 'who') dispatch({type: 'go', screen: {name: 'who'}});
      if (params.screen === 'board') dispatch({type: 'go', screen: {name: 'board', kidId}});
      if (params.screen === 'pin') dispatch({type: 'go', screen: {name: 'pin'}});
      if (params.screen === 'yay') {
        const reward = params.reward === 'character' || params.reward === 'praise' ? params.reward : 'marbles';
        const marbles = reward === 'marbles' ? Math.max(1, Math.min(3, Number(params.n ?? 2))) : 0;
        dispatch({type: 'go', screen: {name: 'yay', kidId, marbles, why: {kind: 'job', jobId: params.job ?? 'toys', reward, approver: params.by}}});
      }
      if (params.screen === 'meet' && params.character) dispatch({type: 'go', screen: {name: 'meet', kidId, characterId: params.character}});
      if (params.screen === 'gallery') dispatch({type: 'go', screen: {name: 'gallery', kidId}});
    };
    try {
      Linking.getInitialURL().then(handle).catch(() => {});
      const sub = Linking.addEventListener('url', e => handle(e.url));
      return () => sub.remove();
    } catch {
      return undefined; // no deep links on this platform
    }
  }, [dispatch]);

  // The remote's Back button walks up one level; on "Who's here?" it leaves the app as usual.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      switch (screen.name) {
        case 'who':
          return false;
        case 'board':
        case 'pin':
        case 'grownups':
          dispatch({type: 'go', screen: {name: 'who'}});
          return true;
        default:
          dispatch({type: 'go', screen: {name: 'board', kidId: screen.kidId}});
          return true;
      }
    });
    return () => sub.remove();
  }, [screen, dispatch]);

  // A new screen never talks over the last one.
  useEffect(() => () => Speech.stop(), [screen.name]);

  // A grown-up's "yes" (on the phone or here) becomes a "Yay!", and a newly drawn character says hello, as soon as
  // the kid can see it.
  const celebration = celebrationToShow(state);
  useEffect(() => {
    if (!celebration) return;
    dispatch({type: 'celebrated', id: celebration.id});
    if ('meet' in celebration) dispatch({type: 'go', screen: {name: 'meet', kidId: celebration.kidId, characterId: celebration.meet}});
    else dispatch({type: 'go', screen: {name: 'yay', kidId: celebration.kidId, marbles: celebration.marbles, why: celebration.why}});
  }, [celebration, dispatch]);

  // A TV no phone has paired yet shows only the welcome screen, until the family arrives.
  const welcome = needsPairing(state) || firstSyncPending(state);
  // Each screen fades in (a moment, not a wait), so the switch never jumps.
  return (
    <Appear key={welcome ? 'welcome' : `${screen.name}-${'kidId' in screen ? screen.kidId : ''}`} from="fade" style={{flex: 1}}>
      {welcome ? <PairScreen /> : <Screen />}
    </Appear>
  );
}

function Screen() {
  const {state} = useStore();
  const screen = state.screen;
  switch (screen.name) {
    case 'who':
      return <WhoScreen />;
    case 'board':
      return <BoardScreen key={`board-${screen.kidId}`} kidId={screen.kidId} focusId={screen.focusId} />;
    case 'claimed':
      return <ClaimedScreen kidId={screen.kidId} jobId={screen.jobId} />;
    case 'yay':
      return <YayScreen kidId={screen.kidId} marbles={screen.marbles} why={screen.why} />;
    case 'meet':
      return <MeetScreen kidId={screen.kidId} characterId={screen.characterId} />;
    case 'gallery':
      return <GalleryScreen kidId={screen.kidId} />;
    case 'pin':
      return <PinScreen />;
    case 'grownups':
      return <GrownupsScreen />;
  }
}

/** MarbleTime: the whole TV app, shared by the Fire OS (Expo TV) and Vega builds. */
export function MarbleTimeApp() {
  useEffect(() => Sound.preload(), []);
  return (
    <StoreProvider>
      <View style={{flex: 1, backgroundColor: colors.bg}}>
        <SyncLoop />
        <ArtPrefetch />
        <Router />
      </View>
    </StoreProvider>
  );
}
