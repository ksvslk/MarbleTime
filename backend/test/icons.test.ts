import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {JOB_ICONS, matchIcon} from '../src/icons';

describe('job icon from the title', () => {
  it.each([
    ['Toys away', 'toys'], ['Feed the cat', 'cat'], ['Brush teeth', 'tooth'], ['Pajamas on', 'moon'], ['Set the table', 'table'],
    ['Empty the dishwasher', 'table'], ['Wash the car', 'car'], ['Wash hair', 'shower'], ['Walk the dog', 'dog'],
    ['Water the plants', 'plant'], ['Drink water', 'water'], ['Get ready for school', 'backpack'], ['Make the bed', 'bed'],
    ['Clean your room', 'broom'], ['Clean the bathroom', 'spray'], ['Put all the LEGO back in the big blue box under the bed', 'toys'],
    // Estonian
    ['Korista mänguasjad', 'toys'], ['Toida kassi', 'cat'], ['Pese hambaid', 'tooth'], ['Pidžaama selga', 'moon'], ['Kata laud', 'table'],
    ['Tühjenda nõudepesumasin ja pühi köögilaud puhtaks', 'table'], ['Jaluta koeraga', 'dog'], ['Korista tuba', 'broom'], ['Vii prügi välja', 'trash'],
    // German
    ['Spielzeug aufräumen', 'toys'], ['Katze füttern', 'cat'], ['Zähne putzen', 'tooth'], ['Schlafanzug an', 'moon'], ['Tisch decken', 'table'],
    ['Geschirrspülmaschine ausräumen und Küche wischen', 'table'], ['Haare waschen', 'shower'], ['Auto waschen', 'car'], ['Zimmer aufräumen', 'broom'],
    // Spanish
    ['Recoger juguetes', 'toys'], ['Alimentar al gato', 'cat'], ['Lavarse los dientes', 'tooth'], ['Ponerse el pijama', 'moon'], ['Poner la mesa', 'table'],
    ['Lavar los platos', 'table'], ['Recoger los juguetes del salón antes de cenar', 'toys'], ['Sacar la basura', 'trash'], ['Hacer los deberes', 'pencil'],
  ])('%s → %s', (title, icon) => {
    expect(matchIcon(title)).toBe(icon);
  });

  it('falls back to "star", and short words must start a word', () => {
    expect(matchIcon('Supercalifragilisticexpialidocious')).toBe('star');
    expect(matchIcon('X')).toBe('star');
    expect(matchIcon('Education')).toBe('star'); // not "cat"
  });

  it('has the same icons as the TV app and the API contract', () => {
    const tv = readFileSync(join(__dirname, '../../tv/packages/shared/src/marble/data.ts'), 'utf8');
    const tvIcons = [...tv.matchAll(/\{name: '(\w+)', hint: '([^']+)'\}/g)].map(([, name, hint]) => ({name, hint}));
    expect(JOB_ICONS.map(({name, hint}) => ({name, hint}))).toEqual(tvIcons);

    const contract = readFileSync(join(__dirname, '../openapi.yaml'), 'utf8');
    const listed = /JobIcon:[\s\S]*?enum: \[([^\]]+)\]/.exec(contract)![1].split(',').map(name => name.trim());
    expect(JOB_ICONS.map(icon => icon.name)).toEqual(listed);
  });
});
