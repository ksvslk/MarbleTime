/**
 * Draws the app icons from the jar logo (ART.logo in src/icons.ts, from scripts/make-icons.py) on the TV's blue:
 * public/favicon.svg and the PNGs the web manifest and iOS use.
 *
 * Usage: npm run icons   (Node 22.18+ runs this TypeScript directly; needs rsvg-convert: brew install librsvg)
 */
import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ART} from '../src/icons.ts';
import {colors} from '../src/tokens.ts';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

/** The logo centred on a 512 square; `logo` is its share of the side, `radius` rounds the corners. */
function iconSvg({logo, radius}: {logo: number; radius: number}): string {
  const size = 512 * logo;
  const offset = (512 - size) / 2;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">',
    `<rect width="512" height="512" rx="${radius}" fill="${colors.bg}"/>`,
    `<g transform="translate(${offset} ${offset}) scale(${size / 24})">${ART.logo.body}</g>`,
    '</svg>',
  ].join('');
}

function png(svg: string, px: number, file: string) {
  const source = join(mkdtempSync(join(tmpdir(), 'marbletime-icon-')), 'icon.svg');
  writeFileSync(source, svg);
  execFileSync('rsvg-convert', ['-w', String(px), '-h', String(px), '-o', join(PUBLIC, file), source]);
}

mkdirSync(join(PUBLIC, 'icons'), {recursive: true});
const rounded = iconSvg({logo: 0.62, radius: 112});
// Platforms crop maskable and Apple icons themselves: full-bleed, with the logo inside the safe circle.
const fullBleed = iconSvg({logo: 0.62, radius: 0});
const maskable = iconSvg({logo: 0.5, radius: 0});

writeFileSync(join(PUBLIC, 'favicon.svg'), rounded + '\n');
png(rounded, 192, 'icons/icon-192.png');
png(rounded, 512, 'icons/icon-512.png');
png(maskable, 512, 'icons/maskable-512.png');
png(fullBleed, 180, 'icons/apple-touch-icon.png');
console.log(`wrote favicon.svg and 4 PNGs to ${PUBLIC}`);
