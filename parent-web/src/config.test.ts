import {describe, expect, it} from 'vitest';
import {resolveConfig} from './config';

const COGNITO = {
  VITE_API_URL: 'https://abc.execute-api.us-east-1.amazonaws.com',
  VITE_COGNITO_AUTHORITY: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_X',
  VITE_COGNITO_CLIENT_ID: 'client123',
};

describe('config', () => {
  it('reads the config.json the CDK stack writes (its own key names)', () => {
    const file = {
      apiUrl: 'https://ny4o9o0um2.execute-api.us-east-1.amazonaws.com',
      region: 'us-east-1',
      userPoolId: 'us-east-1_GgccsHMyo',
      userPoolClientId: '6c4vor9joadnccf2n67vaqka70',
      cognitoDomain: 'https://marbletime-dev-713072916910.auth.us-east-1.amazoncognito.com',
    };
    expect(resolveConfig({}, file)).toEqual({
      ok: true,
      config: {
        apiUrl: file.apiUrl,
        auth: 'cognito',
        cognito: {authority: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_GgccsHMyo', clientId: file.userPoolClientId, domain: file.cognitoDomain},
      },
    });
  });

  it('reads the live-updates address when there is one (config.json realtimeUrl, or VITE_REALTIME_URL)', () => {
    const wss = 'wss://abc.execute-api.us-east-1.amazonaws.com/live';
    const fromFile = resolveConfig({VITE_AUTH: 'dev', VITE_API_URL: 'http://localhost:8787'}, {realtimeUrl: wss});
    expect(fromFile.ok && fromFile.config.realtimeUrl).toBe(wss);
    const fromEnv = resolveConfig({...COGNITO, VITE_REALTIME_URL: ` ${wss} `});
    expect(fromEnv.ok && fromEnv.config.realtimeUrl).toBe(wss);
    const without = resolveConfig(COGNITO);
    expect(without.ok && 'realtimeUrl' in without.config).toBe(false);
  });

  it('dev mode needs only the API address (trailing slash dropped)', () => {
    expect(resolveConfig({VITE_AUTH: 'dev', VITE_API_URL: 'http://192.168.0.100:8787/'})).toEqual({
      ok: true,
      config: {apiUrl: 'http://192.168.0.100:8787', auth: 'dev'},
    });
  });

  it('Cognito is the default and needs the authority and client id; it says which are missing', () => {
    expect(resolveConfig({VITE_API_URL: 'https://api'})).toEqual({ok: false, missing: ['VITE_COGNITO_AUTHORITY', 'VITE_COGNITO_CLIENT_ID']});
    expect(resolveConfig({})).toEqual({ok: false, missing: ['VITE_API_URL', 'VITE_COGNITO_AUTHORITY', 'VITE_COGNITO_CLIENT_ID']});
  });

  it('takes a Cognito domain with or without https://, and works without one', () => {
    const bare = resolveConfig({...COGNITO, VITE_COGNITO_DOMAIN: 'mt.auth.us-east-1.amazoncognito.com'});
    expect(bare.ok && bare.config.cognito?.domain).toBe('https://mt.auth.us-east-1.amazoncognito.com');
    const full = resolveConfig({...COGNITO, VITE_COGNITO_DOMAIN: 'https://mt.auth.us-east-1.amazoncognito.com/'});
    expect(full.ok && full.config.cognito?.domain).toBe('https://mt.auth.us-east-1.amazoncognito.com');
    const none = resolveConfig(COGNITO);
    expect(none).toEqual({ok: true, config: {apiUrl: COGNITO.VITE_API_URL, auth: 'cognito', cognito: {authority: COGNITO.VITE_COGNITO_AUTHORITY, clientId: 'client123', domain: undefined}}});
  });

  it('lets /config.json from the host override the build’s env', () => {
    const result = resolveConfig(
      {VITE_AUTH: 'dev', VITE_API_URL: 'http://localhost:8787'},
      {auth: 'cognito', apiUrl: 'https://api.example', cognitoAuthority: 'https://idp.example/pool', cognitoClientId: 'abc', cognitoDomain: 'login.example'},
    );
    expect(result).toEqual({
      ok: true,
      config: {apiUrl: 'https://api.example', auth: 'cognito', cognito: {authority: 'https://idp.example/pool', clientId: 'abc', domain: 'https://login.example'}},
    });
  });

  it('ignores empty or non-text values in /config.json', () => {
    expect(resolveConfig({VITE_AUTH: 'dev', VITE_API_URL: 'http://localhost:8787'}, {apiUrl: '', auth: 42})).toEqual({
      ok: true,
      config: {apiUrl: 'http://localhost:8787', auth: 'dev'},
    });
  });
});
