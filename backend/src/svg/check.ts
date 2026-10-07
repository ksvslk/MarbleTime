/**
 * The code checks for a drawing (rules: domain/character-prompts.ts DRAWING_RULES). Their messages go back to the
 * drawing model word for word, so each says what to fix; [] means fine. Three stages:
 * - checkSvg, on the model's own text: the checks measured on 100 kid ideas (size, XML, forbidden elements, the nine
 *   pivoted groups), plus what the TV's animation needs: the viewBox, each part once, pivots on the picture, and
 *   left/right as the viewer sees it (eye-left and arm-left on the left);
 * - checkClean, after sanitising: every part is still a group with a pivot, and the mouth is a filled shape (the TV
 *   scales it to talk, so a stroke-only line can't open);
 * - checkLayout, on the rendered picture's bounding box: the character stands on the TV's floor (its lowest point
 *   between y≈470 and 500), nothing above y≈16, centred left to right.
 */
import {type Part, PARTS} from '../domain/types';
import {apply, IDENTITY, type Matrix, multiply, parseTransform} from './transform';
import {attr, type Element, elementChildren, parseXml, SVG_NS, walk} from './xml';

export const SVG_MAX_BYTES = 16_000;
export const VIEWBOX = '0 0 512 512';
const SIZE = 512;

/** Elements the drawing rules forbid (text, scripts, other documents, pictures, links, filters). */
const FORBIDDEN = ['script', 'foreignObject', 'image', 'a', 'text', 'filter'];

/** Where the character must stand, from the TV's design (every character on the same floor). */
export const FLOOR = {lowest: 470, highest: 500, top: 16, centre: 256};
/** Slack for anti-aliasing and near misses, so a drawing isn't redrawn for a pixel or two. */
const SLACK = {floor: 4, top: 4, centre: 40};

/** "x y" or "x,y", in viewBox units. */
export function parsePivot(value: string | undefined): [number, number] | undefined {
  const match = /^\s*(-?\d+(?:\.\d+)?|-?\.\d+)\s*(?:,\s*|\s+)(-?\d+(?:\.\d+)?|-?\.\d+)\s*$/.exec(value ?? '');
  return match ? [Number(match[1]), Number(match[2])] : undefined;
}

/** The named part a group is ("head", …), if it is one. */
export const partOf = (element: Element): Part | undefined =>
  element.name === 'g' ? PARTS.find(part => part === attr(element, 'id')) : undefined;

/**
 * Each part's pivot in viewBox units: its data-pivot, in the coordinates of the part's own drawing, carried through
 * the part's transform and its ancestors' (models rarely transform parts, but a whole drawing may be moved).
 * The first group with a part's id counts.
 */
export function pivotsOf(root: Element): Map<Part, [number, number]> {
  const pivots = new Map<Part, [number, number]>();
  const visit = (element: Element, matrix: Matrix) => {
    const own = multiply(matrix, parseTransform(attr(element, 'transform')) ?? IDENTITY);
    const part = partOf(element);
    const pivot = part && parsePivot(attr(element, 'data-pivot'));
    if (part && pivot && !pivots.has(part)) {
      const [x, y] = apply(own, pivot);
      pivots.set(part, [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
    }
    for (const child of elementChildren(element)) visit(child, own);
  };
  visit(root, IDENTITY);
  return pivots;
}

/**
 * The SVG document in a model's answer: without a markdown fence or words around it (from "<?xml" or "<svg" to the
 * last "</svg>"). Unchanged when there's none, so the checker can say what's wrong.
 */
export function extractSvg(answer: string): string {
  const text = answer.trim().replace(/^```(?:svg|xml)?\s*/i, '').replace(/\s*```$/, '');
  const start = text.search(/<\?xml|<svg[\s>]/);
  const end = text.lastIndexOf('</svg>');
  if (start < 0) return text;
  return end > start ? text.slice(start, end + '</svg>'.length) : text.slice(start);
}

const isSvgElement = (element: Element) => element.uri === SVG_NS || element.uri === '';

/** Problems with the model's own SVG text. */
export function checkSvg(svg: string): string[] {
  const problems: string[] = [];
  const bytes = Buffer.byteLength(svg);
  if (bytes > SVG_MAX_BYTES) problems.push(`too large (${bytes} bytes, limit ${SVG_MAX_BYTES})`);
  let root: Element;
  try {
    const parsed = parseXml(svg);
    root = parsed.root;
    if (parsed.doctype) problems.push('remove the <!DOCTYPE>');
  } catch (error) {
    const [, line, column, message] = /^(\d+):(\d+): (.*)$/s.exec((error as Error).message) ?? [];
    return [...problems, `not valid XML: ${message ? `${message.replace(/\.$/, '')} (line ${line}, column ${column})` : (error as Error).message}`];
  }
  if (root.name !== 'svg' || !isSvgElement(root)) return [...problems, `the document must be one <svg> element (found <${root.name}>)`];
  const viewBox = attr(root, 'viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (!viewBox || viewBox.join(' ') !== VIEWBOX) problems.push(`the <svg> needs viewBox="${VIEWBOX}"`);

  const elements = [...walk(root)];
  const forbidden = new Set(elements.filter(e => FORBIDDEN.includes(e.name)).map(e => e.name));
  for (const name of FORBIDDEN) if (forbidden.has(name)) problems.push(`forbidden element <${name}>`);

  const pivots = pivotsOf(root);
  for (const part of PARTS) {
    const withId = elements.filter(e => attr(e, 'id') === part);
    const groups = withId.filter(e => e.name === 'g');
    if (!groups.length) {
      problems.push(withId.length ? `missing group id="${part}" (the id is on a <${withId[0].name}>; use <g id="${part}" data-pivot="x y">)` : `missing group id="${part}"`);
      continue;
    }
    if (withId.length > 1) problems.push(`id="${part}" is used ${withId.length} times; each part is one group`);
    const pivot = pivots.get(part);
    if (!pivot) problems.push(`group "${part}" has no data-pivot="x y"`);
    else if (pivot.some(n => n < 0 || n > SIZE)) problems.push(`group "${part}" has its data-pivot outside the picture (0 0 512 512)`);
  }
  for (const [left, right] of [['eye-left', 'eye-right'], ['arm-left', 'arm-right']] as const) {
    const [l, r] = [pivots.get(left), pivots.get(right)];
    if (l && r && l[0] >= r[0]) {
      problems.push(`${left} must be on the left of the picture as the viewer sees it, but its pivot (x=${l[0]}) is not left of ${right}'s (x=${r[0]}); swap the two ids`);
    }
  }
  return problems;
}

const SHAPES = new Set(['path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline']);
const isNone = (paint: string | undefined) => paint !== undefined && ['none', 'transparent'].includes(paint.trim().toLowerCase());
const isZero = (value: string | undefined) => value !== undefined && Number(value) === 0;

/** Whether an element draws at least one shape with a visible fill, given the fill it inherits (SVG's default is black). */
function hasFilledShape(element: Element, fill: string | undefined, hidden = false): boolean {
  const own = attr(element, 'fill') ?? fill;
  const gone = hidden || isZero(attr(element, 'opacity')) || isZero(attr(element, 'fill-opacity'));
  if (SHAPES.has(element.name) && !isNone(own) && !gone) return true;
  return elementChildren(element).some(child => hasFilledShape(child, own, gone));
}

/** The mouth group and the fill it inherits from its ancestors. */
function findMouth(element: Element, fill: string | undefined): {mouth: Element; fill: string | undefined} | undefined {
  if (partOf(element) === 'mouth') return {mouth: element, fill};
  const own = attr(element, 'fill') ?? fill;
  for (const child of elementChildren(element)) {
    const found = findMouth(child, own);
    if (found) return found;
  }
  return undefined;
}

/** Problems left after sanitising (its tree): parts lost with a removed element, and a mouth that can't open. */
export function checkClean(root: Element): string[] {
  const problems: string[] = [];
  const pivots = pivotsOf(root);
  for (const part of PARTS) {
    if (!pivots.has(part)) problems.push(`group "${part}" sits inside an element that isn't allowed (it was removed); keep every part a plain <g> with data-pivot="x y"`);
  }
  const found = findMouth(root, undefined);
  if (found && !hasFilledShape(found.mouth, found.fill)) {
    problems.push('the mouth is only a line: draw it as a filled shape (fill not "none"), a dark closed or slightly open smile about 30–60 wide, so it can open and close to talk');
  }
  return problems;
}

/** The drawn area of the picture in viewBox units (from the rendered PNG's alpha). */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Problems with where the character stands, from the rendered picture. */
export function checkLayout(box: Box | undefined): string[] {
  if (!box) return ['the picture is empty: draw the character'];
  if (box.left <= 2 && box.top <= 2 && box.right >= SIZE - 2 && box.bottom >= SIZE - 2) {
    return ['remove the background: everything around the character must stay transparent (no full-size rectangle or scenery)'];
  }
  const problems: string[] = [];
  const {lowest, highest, top, centre} = FLOOR;
  if (box.bottom < lowest - SLACK.floor) {
    problems.push(`the character floats: its lowest point is at y=${Math.round(box.bottom)}; stand it on the floor with its feet between y=${lowest} and y=${highest}`);
  } else if (box.bottom > highest + SLACK.floor) {
    problems.push(`the character goes below the floor: its lowest point is at y=${Math.round(box.bottom)}; put its feet between y=${lowest} and y=${highest}`);
  }
  if (box.top < top - SLACK.top) problems.push(`the drawing reaches too high (y=${Math.round(box.top)}); keep everything below y=${top}`);
  const middle = (box.left + box.right) / 2;
  if (Math.abs(middle - centre) > SLACK.centre) {
    problems.push(`the character is off-centre (its middle is at x=${Math.round(middle)}); centre it on x=${centre}`);
  }
  return problems;
}
