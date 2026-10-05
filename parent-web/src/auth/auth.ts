import {ErrorResponse, UserManager, WebStorageStateStore, type User} from 'oidc-client-ts';
import type {Lang} from '../api/types';
import type {Config} from '../config';
import {storage} from '../lib/storage';

/**
 * How a grown-up is signed in. Two kinds behind one interface:
 * - cognito: Cognito managed login (hosted UI), OIDC authorization code + PKCE, via oidc-client-ts;
 * - dev: the backend's local dev server, which takes `Authorization: Bearer dev-<name>` (no password).
 */
export interface Auth {
  readonly kind: Config['auth'];
  /** Who is signed in (an email or a dev name, for Settings), or null when signed out. No network. */
  session(): Promise<{label: string} | null>;
  /** The bearer token, renewed first if it is about to expire; null when signed out. */
  getToken(): Promise<string | null>;
  /** After a 401: try once to get a new token. False means "sign in again". */
  refresh(): Promise<boolean>;
  /** Cognito: leaves for managed login and comes back to `returnTo`. Dev: signs in as `name` right away. */
  signIn(options: {returnTo: string; lang: Lang; name?: string}): Promise<void>;
  /** Cognito: completes sign-in on /auth/callback and says where to go next. */
  finishSignIn(): Promise<string>;
  /** Forget this device's sign-in; `everywhere` also ends the Cognito session (managed login's /logout). */
  signOut(everywhere: boolean): Promise<void>;
  /** Called whenever someone signs in or out. */
  subscribe(listener: () => void): () => void;
}

export const CALLBACK_PATH = '/auth/callback';

/** Only paths inside this app, so a crafted `state` can't send anyone elsewhere. */
export function safeReturnPath(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/';
}

/** `dev-<name>`, with the name made safe for an HTTP header: lowercase a–z, 0–9 and dashes ("Õie Mai" → dev-oie-mai). */
export function devToken(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `dev-${slug || 'parent'}`;
}

function listeners() {
  const set = new Set<() => void>();
  return {
    notify: () => set.forEach(listener => listener()),
    subscribe(listener: () => void) {
      set.add(listener);
      return () => void set.delete(listener);
    },
  };
}

const DEV_NAME_KEY = 'marbletime.devName';

function createDevAuth(): Auth {
  const {notify, subscribe} = listeners();
  const name = () => storage.get(DEV_NAME_KEY);
  return {
    kind: 'dev',
    session: async () => (name() ? {label: name()!} : null),
    getToken: async () => (name() ? devToken(name()!) : null),
    // The dev server accepts any dev token, so a 401 is a setup problem: show it instead of looping.
    refresh: async () => false,
    async signIn({name: typed}) {
      if (!typed?.trim()) return;
      storage.set(DEV_NAME_KEY, typed.trim());
      notify();
    },
    finishSignIn: async () => '/',
    async signOut() {
      storage.remove(DEV_NAME_KEY);
      notify();
    },
    subscribe,
  };
}

/** Languages Cognito's managed login can show (its `lang` parameter); Estonian falls back to English. */
const MANAGED_LOGIN_LANGS: Lang[] = ['en', 'de', 'es'];

function createCognitoAuth(cognito: NonNullable<Config['cognito']>): Auth {
  const {notify, subscribe} = listeners();
  const origin = window.location.origin;
  const manager = new UserManager({
    authority: cognito.authority,
    client_id: cognito.clientId,
    redirect_uri: origin + CALLBACK_PATH,
    response_type: 'code',
    scope: 'openid email',
    // Stay signed in when the phone closes the app; the refresh token renews the access token.
    userStore: new WebStorageStateStore({store: window.localStorage}),
    // Renew on demand in getToken() instead: timers don't run while a phone app sleeps.
    automaticSilentRenew: false,
  });

  /** Renews with the refresh token. Null when Cognito refuses it (sign in again); offline keeps the old user. */
  async function renew(user: User): Promise<User | null> {
    try {
      return await manager.signinSilent();
    } catch (e) {
      if (!(e instanceof ErrorResponse)) return user; // offline: the API call will say so
      await manager.removeUser();
      notify();
      return null;
    }
  }

  let renewing: Promise<User | null> | null = null;
  const renewOnce = (user: User) => (renewing ??= renew(user).finally(() => (renewing = null)));

  let finishing: Promise<string> | null = null;

  return {
    kind: 'cognito',
    async session() {
      const user = await manager.getUser();
      return user ? {label: typeof user.profile.email === 'string' ? user.profile.email : ''} : null;
    },
    async getToken() {
      let user = await manager.getUser();
      if (user && user.refresh_token && (user.expires_in ?? Infinity) < 60) user = await renewOnce(user);
      return user?.access_token ?? null;
    },
    async refresh() {
      const user = await manager.getUser();
      if (!user?.refresh_token) {
        await manager.removeUser();
        notify();
        return false;
      }
      const renewed = await renewOnce(user);
      return Boolean(renewed && renewed !== user);
    },
    async signIn({returnTo, lang}) {
      await manager.signinRedirect({
        state: {returnTo: safeReturnPath(returnTo)},
        extraQueryParams: MANAGED_LOGIN_LANGS.includes(lang) ? {lang} : {},
      });
    },
    finishSignIn() {
      // The code can be exchanged only once, and React may mount the callback page twice.
      finishing ??= manager.signinRedirectCallback().then(user => {
        notify();
        return safeReturnPath((user.state as {returnTo?: unknown} | undefined)?.returnTo);
      });
      return finishing;
    },
    async signOut(everywhere) {
      await manager.removeUser();
      if (everywhere && cognito.domain) {
        const query = `client_id=${encodeURIComponent(cognito.clientId)}&logout_uri=${encodeURIComponent(origin + '/')}`;
        window.location.assign(`${cognito.domain}/logout?${query}`);
        return;
      }
      notify();
    },
    subscribe,
  };
}

export function createAuth(config: Config): Auth {
  return config.auth === 'dev' || !config.cognito ? createDevAuth() : createCognitoAuth(config.cognito);
}
