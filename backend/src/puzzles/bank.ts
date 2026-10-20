/** The puzzle banks that ship with the backend: one file per language, written by make.ts, read here. */
import type {Lang} from '../domain/types';
import de from './bank/de.json';
import en from './bank/en.json';
import es from './bank/es.json';
import et from './bank/et.json';
import type {PuzzleItem} from './items';

const BANKS = {en, et, de, es} as unknown as Record<Lang, PuzzleItem[]>;

/** Every puzzle in a language (none where the bank hasn't been written yet). */
export const bankFor = (lang: Lang): PuzzleItem[] => BANKS[lang] ?? [];
