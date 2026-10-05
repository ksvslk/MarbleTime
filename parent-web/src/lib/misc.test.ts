import {afterEach, describe, expect, it, vi} from 'vitest';
import type {Device} from '../api/types';
import {devToken, safeReturnPath} from '../auth/auth';
import {colors, cssVariables} from '../tokens';
import {chunks, usesAmazonKids} from './handoff';
import {newId} from './ids';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('request ids', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('are UUID v4', () => {
    expect(newId()).toMatch(UUID_V4);
  });

  it('still work without crypto.randomUUID (plain http on the LAN)', () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', {getRandomValues: <T extends ArrayBufferView>(array: T) => real.getRandomValues(array as never)});
    const ids = new Set(Array.from({length: 50}, newId));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });
});

describe('Amazon Kids hand-off', () => {
  const tv = (mode: Device['mode']): Device => ({id: mode, name: 'TV', platform: 'fireos', mode, createdAt: 0});

  it('is offered when a TV is in Amazon Kids mode, or before any TV is paired', () => {
    expect(usesAmazonKids([])).toBe(true);
    expect(usesAmazonKids([tv('strict'), tv('amazon_kids')])).toBe(true);
    expect(usesAmazonKids([tv('strict'), tv('api_mock')])).toBe(false);
  });

  it('marks entries in batches the API accepts', () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunks([], 200)).toEqual([]);
  });
});

describe('sign-in helpers', () => {
  it('makes a dev token any HTTP header can carry', () => {
    expect(devToken('Mia')).toBe('dev-mia');
    expect(devToken('  Õie Mai ')).toBe('dev-oie-mai');
    expect(devToken('Jürgen-Ñandú')).toBe('dev-jurgen-nandu');
    expect(devToken('🙂')).toBe('dev-parent');
  });

  it('only returns to paths inside the app after sign-in', () => {
    expect(safeReturnPath('/pair/K7QX4M')).toBe('/pair/K7QX4M');
    expect(safeReturnPath('//evil.example')).toBe('/');
    expect(safeReturnPath('/\\evil.example')).toBe('/');
    expect(safeReturnPath('https://evil.example')).toBe('/');
    expect(safeReturnPath(undefined)).toBe('/');
  });
});

describe('design tokens', () => {
  it('become CSS variables with kebab-case names', () => {
    const vars = new Map(cssVariables(colors));
    expect(vars.get('--bg-grownups')).toBe('#1F2A6B');
    expect(vars.get('--gold')).toBe('#FFC93C');
    expect(vars.get('--tile-off')).toBe('#EEF0F8');
  });
});
