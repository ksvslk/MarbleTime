/**
 * Where the API is and how grown-ups sign in.
 *
 * From Vite env at build time (.env.development, or the shell for `npm run build`). An optional /config.json
 * next to index.html overrides it at run time, with the keys below: the CDK stack can write that file
 * (BucketDeployment `Source.jsonData`) with the pool and API it just made, so one build works for any stage.
 */
export type AuthMode = 'dev' | 'cognito';

export interface Config {
  apiUrl: string;
  auth: AuthMode;
  /** Cognito managed login; only in cognito mode. `domain` (for sign-out) is optional. */
  cognito?: {authority: string; clientId: string; domain?: string};
  /** Live updates (x-realtime in the contract), `wss://…`. Without it the app polls, as before. */
  realtimeUrl?: string;
}

/** The keys of /config.json, each with the Vite env variable it stands in for. */
const ENV_NAMES = {
  apiUrl: 'VITE_API_URL',
  auth: 'VITE_AUTH',
  cognitoAuthority: 'VITE_COGNITO_AUTHORITY',
  cognitoClientId: 'VITE_COGNITO_CLIENT_ID',
  cognitoDomain: 'VITE_COGNITO_DOMAIN',
  realtimeUrl: 'VITE_REALTIME_URL',
} as const;

/**
 * /config.json as the CDK stack writes it (backend/infra/stack.ts): {apiUrl, region, userPoolId,
 * userPoolClientId, cognitoDomain}. The pool's sign-in authority is derived from region + userPoolId.
 */
type StackConfig = {region?: unknown; userPoolId?: unknown; userPoolClientId?: unknown};

export type RuntimeConfig = Partial<Record<keyof typeof ENV_NAMES, unknown>> & StackConfig;

/** The stack's names mapped onto ours; explicit keys in the file still win. */
function fromStack(runtime: RuntimeConfig): RuntimeConfig {
  const text = (x: unknown) => (typeof x === 'string' ? x.trim() : '');
  const region = text(runtime.region);
  const pool = text(runtime.userPoolId);
  return {
    ...(region && pool ? {cognitoAuthority: `https://cognito-idp.${region}.amazonaws.com/${pool}`} : {}),
    ...(text(runtime.userPoolClientId) ? {cognitoClientId: text(runtime.userPoolClientId)} : {}),
    ...runtime,
  };
}

export type ConfigResult = {ok: true; config: Config} | {ok: false; missing: string[]};

const trimSlash = (url: string) => url.replace(/\/+$/, '');

export function resolveConfig(env: Record<string, unknown>, file: RuntimeConfig = {}): ConfigResult {
  const runtime = fromStack(file);
  const read = (key: keyof typeof ENV_NAMES): string => {
    const fromFile = runtime[key];
    if (typeof fromFile === 'string' && fromFile.trim()) return fromFile.trim();
    const fromEnv = env[ENV_NAMES[key]];
    return typeof fromEnv === 'string' ? fromEnv.trim() : '';
  };

  const missing: string[] = [];
  const apiUrl = trimSlash(read('apiUrl'));
  if (!apiUrl) missing.push(ENV_NAMES.apiUrl);
  const realtimeUrl = read('realtimeUrl');
  const live = realtimeUrl ? {realtimeUrl} : {};

  if (read('auth') === 'dev') return missing.length ? {ok: false, missing} : {ok: true, config: {apiUrl, auth: 'dev', ...live}};

  const authority = trimSlash(read('cognitoAuthority'));
  const clientId = read('cognitoClientId');
  if (!authority) missing.push(ENV_NAMES.cognitoAuthority);
  if (!clientId) missing.push(ENV_NAMES.cognitoClientId);
  if (missing.length) return {ok: false, missing};

  const rawDomain = read('cognitoDomain');
  const domain = rawDomain ? trimSlash(/^https?:\/\//.test(rawDomain) ? rawDomain : `https://${rawDomain}`) : undefined;
  return {ok: true, config: {apiUrl, auth: 'cognito', cognito: {authority, clientId, domain}, ...live}};
}

/** /config.json if the host put one there. No file (or the SPA's index.html in its place) means: use the build's env. */
async function fetchRuntimeConfig(): Promise<RuntimeConfig> {
  try {
    const res = await fetch('/config.json', {cache: 'no-store'});
    if (!res.ok) return {};
    const data: unknown = await res.json();
    return data && typeof data === 'object' ? (data as RuntimeConfig) : {};
  } catch {
    return {};
  }
}

export async function loadConfig(): Promise<ConfigResult> {
  return resolveConfig(import.meta.env, await fetchRuntimeConfig());
}
