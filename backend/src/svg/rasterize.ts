/**
 * Renders a sanitised drawing to PNG with @napi-rs/canvas (MIT; Skia, BSD-3-Clause), which has prebuilt binaries for
 * Lambda's arm64 Linux (glibc 2.17+) and for macOS. Skia's SVG renderer ignores <style> and SVG-2 `href`, which the
 * sanitiser has already turned into attributes and expanded, so the picture check sees what the TV will draw.
 *
 * One render gives both what the checks need: the drawn area (from the alpha channel, for the standing baseline) and
 * a PNG on white for the picture check.
 */
import {createCanvas, loadImage} from '@napi-rs/canvas';
import type {Box} from './check';

export interface Raster {
  /** The drawing on a white background, 512 × 512 (viewBox units are pixels). */
  png: Buffer;
  /** Where something was drawn; undefined for an empty picture. */
  box?: Box;
}

export type Rasterize = (svg: string) => Promise<Raster>;

/** Pixels more transparent than this don't count as drawn (anti-aliasing at the edges). */
const ALPHA = 24;

/** The drawn area of RGBA pixels (alpha above the threshold), in pixels. */
export function alphaBox(rgba: Uint8ClampedArray, width: number, height: number): Box | undefined {
  let [left, top, right, bottom] = [width, height, -1, -1];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] > ALPHA) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        bottom = y;
      }
    }
  }
  return right < 0 ? undefined : {left, top, right: right + 1, bottom: bottom + 1};
}

export async function rasterize(svg: string, size = 512): Promise<Raster> {
  const image = await loadImage(Buffer.from(svg));
  const drawing = createCanvas(size, size);
  drawing.getContext('2d').drawImage(image, 0, 0, size, size);
  const box = alphaBox(drawing.getContext('2d').getImageData(0, 0, size, size).data, size, size);
  const onWhite = createCanvas(size, size);
  const context = onWhite.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  context.drawImage(drawing, 0, 0);
  return {png: await onWhite.encode('png'), ...(box && {box})};
}
