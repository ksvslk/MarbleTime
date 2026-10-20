import React, {useEffect} from 'react';
import {DeviceEventEmitter, Linking} from 'react-native';
import {MarbleTimeApp} from '@multitv/shared';

/**
 * Vega hands an app links only as pkg://<component-id>?<query>, the one scheme third-party apps may use. A test link
 * sent with `vmsgr launch-app 'pkg://app.marbletime.tv.main?screen=board&kid=mia'` is passed on to the shared app in
 * the form it reads: marbletime://open?<query>.
 */
const PKG = 'pkg://app.marbletime.tv.main';
const asTestLink = (url: string | null) => (url?.startsWith(`${PKG}?`) ? `marbletime://open?${url.slice(PKG.length + 1)}` : null);

export const App = () => {
  useEffect(() => {
    const passOn = (url: string | null) => {
      const link = asTestLink(url);
      if (link) DeviceEventEmitter.emit('url', {url: link});
    };
    // The shared app starts listening on its first render; a link that launched the app waits a moment for that.
    Linking.getInitialURL().then(url => setTimeout(() => passOn(url), 1000)).catch(() => {});
    const sub = Linking.addEventListener('url', e => passOn(e.url));
    return () => sub.remove();
  }, []);
  return <MarbleTimeApp />;
};
