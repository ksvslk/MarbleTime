import React, {useEffect} from 'react';
import {BackHandler, View} from 'react-native';
import {StoreProvider, useStore} from './state';
import {colors} from './theme';
import {BoardScreen, ClaimedScreen, WhoScreen, YayScreen} from './screens/KidScreens';
import {GameScreen} from './screens/GameScreen';
import {GrownupsScreen, PinScreen} from './screens/GrownupScreens';

function Router() {
  const {state, dispatch} = useStore();
  const screen = state.screen;

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

  switch (screen.name) {
    case 'who':
      return <WhoScreen />;
    case 'board':
      return <BoardScreen key={`board-${screen.kidId}`} kidId={screen.kidId} focusId={screen.focusId} />;
    case 'claimed':
      return <ClaimedScreen kidId={screen.kidId} jobId={screen.jobId} />;
    case 'yay':
      return <YayScreen kidId={screen.kidId} marbles={screen.marbles} reason={screen.reason} />;
    case 'game':
      return <GameScreen kidId={screen.kidId} gameId={screen.gameId} />;
    case 'pin':
      return <PinScreen />;
    case 'grownups':
      return <GrownupsScreen />;
  }
}

/** MarbleTime: the whole TV app, shared by the Fire OS (Expo TV) and Vega builds. */
export function MarbleTimeApp() {
  return (
    <StoreProvider>
      <View style={{flex: 1, backgroundColor: colors.bg}}>
        <Router />
      </View>
    </StoreProvider>
  );
}
