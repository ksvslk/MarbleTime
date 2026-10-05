import {describe, expect, it} from 'vitest';
import {langValues} from '../api/types';
import {detectLang, STRINGS, translate, type Key} from './strings';

const keys = Object.keys(STRINGS.en) as Key[];
const holes = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

describe('translations', () => {
  it.each(langValues)('%s has every key, none of them empty', lang => {
    expect(Object.keys(STRINGS[lang]).sort()).toEqual([...keys].sort());
    for (const key of keys) expect(STRINGS[lang][key].trim(), `${lang}.${key}`).not.toBe('');
  });

  it.each(langValues)('%s keeps the same {holes} as English', lang => {
    for (const key of keys) expect(holes(STRINGS[lang][key]), `${lang}.${key}`).toEqual(holes(STRINGS.en[key]));
  });

  it('fills the holes, and leaves an unfilled one visible', () => {
    expect(translate('en', 'give', {min: '15 min'})).toBe('Give 15 min');
    expect(translate('de', 'unpairQ', {tv: 'Küche'})).toBe('Küche trennen?');
    expect(translate('en', 'give')).toBe('Give {min}');
  });
});

describe('language before sign-in', () => {
  it('takes the first browser language the app has, else English', () => {
    expect(detectLang(['et-EE', 'en-US'])).toBe('et');
    expect(detectLang(['fr-FR', 'de-AT'])).toBe('de');
    expect(detectLang(['ES'])).toBe('es');
    expect(detectLang(['fr'])).toBe('en');
    expect(detectLang([])).toBe('en');
  });
});
