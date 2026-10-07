/**
 * Splits a sanitised drawing into CharacterArt layers for the TV: in drawing order, each layer a complete small SVG
 * document with the same viewBox, which the TV draws on top of the ones before it. A named part (the nine groups) can
 * be rotated or scaled around its pivot; a layer without a part never moves on its own.
 *
 * How the drawing is cut:
 * - Everything drawn outside the named groups becomes static layers: one per run of consecutive elements.
 * - A named group with no named group inside it is one layer with its part and pivot.
 * - Nested named groups (40% of the measured drawings put eye-left, eye-right and mouth inside head) are flattened:
 *   the inner part becomes its own layer, and the outer part's drawing is cut around it, so "head" may be two layers
 *   (what is drawn before the eyes and what is drawn after them), both with the head's part and pivot. Drawing order
 *   stays exactly as in the SVG.
 * - Each piece keeps how its ancestors made it look: it sits inside attribute-only copies of the groups it was in
 *   (fill, stroke, transform, opacity…, without their ids and pivots). Group opacity is then applied per layer, which
 *   differs from the original only where an outer group's opacity covered overlapping layers.
 * - A layer says which part it rides on (`parent`): the named part its own part was drawn inside (eyes and mouth inside
 *   the head → "head"; a held thing inside an arm → that arm), so the TV moves it with that part first. The pieces of a
 *   cut part keep that part and its own parent (none for a part drawn at the top). Eyes and a mouth drawn outside
 *   every part ride on the head all the same: a face never leaves its head (60% of the measured drawings drew them
 *   beside the head, not in it).
 * - Pivots are in viewBox units, with any transforms of the part and its ancestors applied (pivotsOf).
 * - Gradients and clip paths are copied into the <defs> of every layer that uses them (and nothing else), so each
 *   layer stands alone. A part that draws nothing (an empty "extra") has no layer.
 */
import type {Layer, Part} from '../domain/types';
import {partOf, pivotsOf, VIEWBOX} from './check';
import {DEFINITIONS} from './sanitize';
import {attr, type Element, elementChildren, type Node, removeAttr, serialize, shallowCopy, walk} from './xml';

/** Elements that are only definitions or definition parts: never drawn by themselves. */
const isDefinition = (element: Element) => element.name === 'defs' || element.name === 'stop' || DEFINITIONS.has(element.name);
const DRAWN = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon']);
/** Parts of the face: they ride on the head even when drawn beside it. */
const FACE = new Set<Part>(['eye-left', 'eye-right', 'mouth']);

interface Atom {
  /** The part whose drawing this is (the nearest named group around it), or none for static drawing. */
  part?: Part;
  /** The named part that part's group sits inside. */
  parent?: Part;
  /** The groups it sits in, outermost first (below the root). */
  chain: Element[];
  element: Element;
}

/** A copy for a layer: definitions left out (they go to the layer's <defs>), part ids and pivots dropped. */
function drawingCopy(element: Element): Element {
  const copy = shallowCopy(element);
  if (partOf(element)) {
    removeAttr(copy, 'id');
    removeAttr(copy, 'data-pivot');
  }
  copy.children = elementChildren(element).filter(child => !isDefinition(child)).map(drawingCopy);
  return copy;
}

const draws = (element: Element) => [...walk(element)].some(e => DRAWN.has(e.name));

/** Rebuilds the nesting of consecutive atoms: shared ancestors are one wrapper, as in the original. */
function nest(atoms: Atom[]): Node[] {
  const top: Element = {kind: 'element', name: 'g', uri: '', attributes: [], children: []};
  const open: {source?: Element; copy: Element}[] = [{copy: top}];
  for (const atom of atoms) {
    let shared = 0;
    while (shared < atom.chain.length && shared + 1 < open.length && open[shared + 1].source === atom.chain[shared]) shared++;
    open.length = shared + 1;
    for (const group of atom.chain.slice(shared)) {
      const wrapper = drawingCopy({...group, children: []});
      open.at(-1)!.copy.children.push(wrapper);
      open.push({source: group, copy: wrapper});
    }
    open.at(-1)!.copy.children.push(drawingCopy(atom.element));
  }
  return top.children;
}

const REFERENCE = /url\(#([\w.:-]+)\)/g;

/** The ids an element tree refers to with url(#id). */
function references(elements: Element[]): Set<string> {
  const ids = new Set<string>();
  for (const element of elements) {
    for (const each of walk(element)) for (const a of each.attributes) for (const match of a.value.matchAll(REFERENCE)) ids.add(match[1]);
  }
  return ids;
}

export interface Art {
  viewBox: string;
  layers: Layer[];
}

/** The layers of a sanitised drawing (sanitizeSvg's root). */
export function splitLayers(root: Element): Art {
  // Definitions by id, in document order (the first of a repeated id counts, as in browsers).
  const definitions = new Map<string, Element>();
  for (const element of walk(root)) {
    const id = attr(element, 'id');
    if (id !== undefined && DEFINITIONS.has(element.name) && !definitions.has(id)) definitions.set(id, element);
  }
  const holdsPart = (element: Element) => [...walk(element)].some(e => e !== element && partOf(e) !== undefined);

  const atoms: Atom[] = [];
  const visit = (element: Element, chain: Element[], part: Part | undefined, parent: Part | undefined) => {
    for (const child of elementChildren(element)) {
      if (isDefinition(child)) continue;
      const named = partOf(child);
      // A named group's drawing belongs to it, and it rides on the part it sits in.
      const [owner, ownerParent] = named ? [named, part] : [part, parent];
      if (child.name === 'g' && holdsPart(child)) visit(child, [...chain, child], owner, ownerParent);
      else if (draws(child)) atoms.push({part: owner, parent: ownerParent, chain, element: child});
    }
  };
  visit(root, [], undefined, undefined);

  // Consecutive atoms of the same part (or of none) make one layer.
  const runs: Atom[][] = [];
  for (const atom of atoms) {
    const last = runs.at(-1);
    if (last && last[0].part === atom.part) last.push(atom);
    else runs.push([atom]);
  }

  const pivots = pivotsOf(root);
  const rootAttributes = root.attributes.map(a => ({...a}));
  const layers = runs.map((run): Layer => {
    const content = nest(run).filter((node): node is Element => node.kind === 'element');
    // What the layer refers to, and what those refer to in turn (a clip path's shapes may use a gradient).
    const needed = references([...content, {...root, children: []}]);
    for (let grew = true; grew;) {
      grew = false;
      for (const id of [...needed]) {
        const definition = definitions.get(id);
        for (const more of definition ? references([definition]) : []) {
          if (!needed.has(more)) {
            needed.add(more);
            grew = true;
          }
        }
      }
    }
    const defs = [...definitions.entries()].filter(([id]) => needed.has(id)).map(([, definition]) => drawingCopyOfDefinition(definition));
    const svg: Element = {
      kind: 'element', name: 'svg', uri: root.uri, attributes: rootAttributes,
      children: [...(defs.length ? [{kind: 'element' as const, name: 'defs', uri: root.uri, attributes: [], children: defs}] : []), ...content],
    };
    const part = run[0].part;
    const parent = run[0].parent ?? (part && FACE.has(part) ? 'head' : undefined);
    const pivot = part && pivots.get(part);
    return {...(part && {part}), ...(parent && {parent}), ...(pivot && {pivot}), svg: serialize(svg)};
  });
  return {viewBox: attr(root, 'viewBox') ?? VIEWBOX, layers};
}

/** A definition as it goes into a layer's <defs>: whole, with its id. */
function drawingCopyOfDefinition(definition: Element): Element {
  const copy = shallowCopy(definition);
  copy.children = elementChildren(definition).map(drawingCopyOfDefinition);
  return copy;
}
