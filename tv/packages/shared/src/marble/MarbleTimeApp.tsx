import React, {useEffect} from 'react';
import {BackHandler, Linking, View} from 'react-native';
import {KidId, SAMPLE_FAMILY, STRESS_FAMILY} from './data';
import {LANGS, Lang} from './i18n';
import {StoreProvider, useStore} from './state';
import {Sound} from './sound';
import {Speech} from './speech';
import {colors} from './theme';
import {BoardScreen, ClaimedScreen, WhoScreen, YayScreen} from './screens/KidScreens';
import {GameScreen} from './screens/GameScreen';
import {GrownupsScreen, PairScreen, PinScreen} from './screens/GrownupScreens';
import {SyncLoop} from './sync';
import {Appear} from './motion';

function Router() {
  const {state, dispatch} = useStore();
  const screen = state.screen;

  // Test/demo link: marbletime://open?screen=board&kid=mia&lang=et (screen: who|board|pin|game|yay|pair; game=<id>;
  // api=<backend URL> points the TV at another backend, e.g. the dev server on the Mac).
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
      if (params.screen === 'pair') dispatch({type: 'go', screen: {name: 'pair'}});
      if (params.screen === 'game' && params.game) dispatch({type: 'go', screen: {name: 'game', kidId, gameId: params.game}});
      if (params.screen === 'yay') dispatch({type: 'go', screen: {name: 'yay', kidId, marbles: Math.max(0, Math.min(6, Number(params.n ?? 2))), why: {kind: 'game', gameId: 'numbers'}}});
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
        case 'pair':
          dispatch({type: 'go', screen: {name: 'grownups'}});
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

  // Each screen fades in (a moment, not a wait), so the switch never jumps.
  return (
    <Appear key={`${screen.name}-${'kidId' in screen ? screen.kidId : ''}`} from="fade" style={{flex: 1}}>
      <Screen />
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
    case 'game':
      return <GameScreen kidId={screen.kidId} gameId={screen.gameId} />;
    case 'pin':
      return <PinScreen />;
    case 'grownups':
      return <GrownupsScreen />;
    case 'pair':
      return <PairScreen />;
  }
}

/** MarbleTime: the whole TV app, shared by the Fire OS (Expo TV) and Vega builds. */
export function MarbleTimeApp() {
  useEffect(() => Sound.preload(), []);
  return (
    <StoreProvider>
      <View style={{flex: 1, backgroundColor: colors.bg}}>
        <SyncLoop />
        <Router />
      </View>
    </StoreProvider>
  );
}
