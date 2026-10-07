/**
 * Moving a drawing onto the TV's floor in code. The drawing model is asked to place the character (and the repair
 * rounds tell it where it went wrong); when the last round still has the position as its only problem, the worker
 * moves the whole drawing instead of failing the kid's character. Pivots follow, since they are read through
 * transforms (pivotsOf).
 */
import {type Box, FLOOR} from './check';
import type {Clean} from './sanitize';
import {type Element, serialize} from './xml';

/** Where the feet go: the middle of the floor band (470–500). */
const FEET = (FLOOR.lowest + FLOOR.highest) / 2;
/** Room left and right when a drawing is too wide and has to shrink. */
const SIDE = 8;

const round = (n: number) => Math.round(n * 1000) / 1000;

/** The transform that puts the drawn area's bottom centre at (256, 485), shrunk if it can't fit below y=16 or across. */
export function floorTransform(box: Box): string {
  const scale = Math.min(1, (FEET - FLOOR.top) / (box.bottom - box.top), (512 - 2 * SIDE) / (box.right - box.left));
  const x = round(FLOOR.centre - (scale * (box.left + box.right)) / 2);
  const y = round(FEET - scale * box.bottom);
  return scale === 1 ? `translate(${x} ${y})` : `translate(${x} ${y}) scale(${round(scale)})`;
}

/** The drawing with everything in it moved by `transform` (one group around it all). */
export function moveAll(clean: Clean, transform: string): Clean {
  const group: Element = {
    kind: 'element', name: 'g', uri: clean.root.uri, children: clean.root.children,
    attributes: [{name: 'transform', local: 'transform', prefix: '', uri: '', value: transform}],
  };
  const root: Element = {...clean.root, children: [group]};
  return {root, svg: serialize(root)};
}
