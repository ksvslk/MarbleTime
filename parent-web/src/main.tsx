import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {App} from './App';
import {loadConfig} from './config';
import {I18nProvider} from './i18n/I18n';
import {colors, cssVariables, phoneColors} from './tokens';
import {ToastProvider} from './ui/Toast';
import './styles.css';

// styles.css reads the TV's colours as CSS variables (--bg-grownups, --gold, …), set here from tokens.ts.
for (const [name, value] of cssVariables({...colors, ...phoneColors})) document.documentElement.style.setProperty(name, value);

const root = createRoot(document.getElementById('root')!);
void loadConfig().then(config =>
  root.render(
    <StrictMode>
      <I18nProvider>
        <ToastProvider>
          <App config={config} />
        </ToastProvider>
      </I18nProvider>
    </StrictMode>,
  ),
);
