import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {App} from './App';
import {loadConfig} from './config';
import {I18nProvider} from './i18n/I18n';
import {swUrl} from './push/push';
import {colors, cssVariables, phoneColors} from './tokens';
import {ToastProvider} from './ui/Toast';
import './styles.css';

// styles.css reads the TV's colours as CSS variables (--bg-grownups, --gold, …), set here from tokens.ts.
for (const [name, value] of cssVariables({...colors, ...phoneColors})) document.documentElement.style.setProperty(name, value);

const root = createRoot(document.getElementById('root')!);
void loadConfig().then(config => {
  // The service worker shows notifications and answers "Yes" / "Not yet" from them; it caches nothing
  // (public/sw.js). It is told where the API is. Not on plain-http LAN addresses.
  if (config.ok && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.register(swUrl(config.config.apiUrl), {updateViaCache: 'none'}).catch(() => undefined);
  }
  root.render(
    <StrictMode>
      <I18nProvider>
        <ToastProvider>
          <App config={config} />
        </ToastProvider>
      </I18nProvider>
    </StrictMode>,
  );
});
