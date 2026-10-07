/**
 * Makes a checked drawing safe and plain before anyone sees it: the parent app shows the whole SVG, and the TV draws
 * each layer with react-native-svg (Fire OS) or @amazon-devices/react-native-svg (Vega), which draw only plain SVG.
 *
 * - <use> is expanded into a copy of what it points at (ids in the copy are dropped), so nothing depends on it;
 * - stylesheets are folded into the elements (css.ts), and every `style` attribute becomes presentation attributes;
 * - only these elements stay: svg, g, path, circle, ellipse, rect, line, polyline, polygon, defs, linearGradient,
 *   radialGradient, stop, clipPath. Anything else goes with everything inside it: scripts, foreign objects, images,
 *   links, text, filters, masks, patterns, markers, animations, <style>, other namespaces' elements, and anything
 *   with display="none";
 * - only these attributes stay: geometry, `id`, `transform`, `data-pivot` (on groups), fill, stroke, stroke-width,
 *   stroke-linecap, stroke-linejoin, stroke-miterlimit, stroke-dasharray, stroke-dashoffset, opacity, fill-opacity,
 *   stroke-opacity, fill-rule, clip-rule, clip-path, gradient attributes, offset, stop-color, stop-opacity. Event
 *   handlers (on…), `class`, `style`, hrefs and anything namespaced go;
 * - references must point inside the document (`url(#id)` to a gradient or clip path that is still there); any
 *   other reference (http:, data:, javascript:, a dropped mask or pattern) removes the attribute. A gradient that
 *   inherits from another (href) gets its stops and settings copied, and loses the href.
 * The root becomes <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"> plus the original root's
 * presentation attributes (everything inherits them).
 */
import {VIEWBOX} from './check';
import {inlineStylesheets, parseDeclarations} from './css';
import {attr, type Attribute, deepCopy, type Element, isElement, type Node, parseXml, removeAttr, serialize, setAttr, SVG_NS, walk, XLINK_NS} from './xml';

export const ELEMENTS = new Set([
  'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath',
]);

/** Definitions: drawn only where something refers to them (url(#id)). */
export const DEFINITIONS = new Set(['linearGradient', 'radialGradient', 'clipPath']);

/** Presentation attributes, also accepted from `style` declarations (and inherited from the root). */
export const PRESENTATION = new Set([
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray',
  'stroke-dashoffset', 'stroke-opacity', 'opacity', 'clip-path', 'clip-rule', 'stop-color', 'stop-opacity',
]);

const GRADIENT_SETTINGS = ['x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'fx', 'fy', 'fr', 'gradientUnits', 'gradientTransform', 'spreadMethod'];

const ATTRIBUTES = new Set([
  ...PRESENTATION, ...GRADIENT_SETTINGS,
  'd', 'x', 'y', 'rx', 'ry', 'width', 'height', 'points', 'id', 'transform', 'offset', 'clipPathUnits',
]);

const DANGEROUS = /javascript:|vbscript:|data:|expression\s*\(|[<>]/i;
const LOCAL_URL = /url\(\s*(['"]?)#([\w.:-]+)\1\s*\)/g;
/** The id a value refers to with url(#id), if any. */
const urlTarget = (value: string) => /^url\(#([\w.:-]+)\)$/.exec(value.trim())?.[1];

/** An attribute value with every url(…) pointing inside the document (normalised to url(#id)); undefined if not. */
export function safeValue(value: string): string | undefined {
  if (DANGEROUS.test(value)) return undefined;
  if (!/url\(/i.test(value)) return value;
  const local = value.replace(LOCAL_URL, (_, _quote, id: string) => `url(#${id})`);
  return /url\((?!#[\w.:-]+\))/i.test(local) ? undefined : local;
}

const plain = (name: string, value: string): Attribute => ({name, local: name, prefix: '', uri: '', value});
const hrefOf = (element: Element) => element.attributes.find(a => a.local === 'href' && (a.uri === '' || a.uri === XLINK_NS))?.value.trim();
const isHidden = (element: Element) =>
  attr(element, 'display')?.trim() === 'none' || parseDeclarations(attr(element, 'style') ?? '').some(d => d.property === 'display' && d.value === 'none');

/** At most this many elements may come out of expanding <use> (a <use> of a <use>… can't blow up). */
const USE_BUDGET = 2000;

/**
 * Replaces every <use href="#id"> with a group holding a copy of the element it points at (a <symbol>'s children),
 * placed as the <use> places it; ids inside copies are dropped so they stay unique. Unresolvable ones go.
 */
function expandUses(root: Element): void {
  const byId = new Map<string, Element>();
  for (const element of walk(root)) {
    const id = attr(element, 'id');
    if (id !== undefined && !byId.has(id)) byId.set(id, element);
  }
  let budget = USE_BUDGET;
  const stripIds = (element: Element) => {
    for (const each of walk(element)) removeAttr(each, 'id');
  };
  const expand = (parent: Element, depth: number, inside: Set<Element>) => {
    parent.children = parent.children.flatMap((child): Node[] => {
      if (!isElement(child)) return [child];
      if (child.name !== 'use') {
        expand(child, depth, new Set([...inside, child]));
        return [child];
      }
      const target = byId.get(hrefOf(child)?.replace(/^#/, '') ?? '');
      if (!target || inside.has(target) || depth > 4 || target.name === 'svg') return [];
      const copy = deepCopy(target);
      const size = [...walk(copy)].length;
      if ((budget -= size) < 0) return [];
      stripIds(copy);
      const content = copy.name === 'symbol' ? copy.children : [copy];
      const x = Number(attr(child, 'x') ?? 0) || 0;
      const y = Number(attr(child, 'y') ?? 0) || 0;
      const group: Element = {
        kind: 'element', name: 'g', uri: child.uri, children: content,
        attributes: child.attributes.filter(a => !['href', 'x', 'y', 'width', 'height', 'transform'].includes(a.local)).map(a => ({...a})),
      };
      const transform = `${attr(child, 'transform') ?? ''}${x || y ? ` translate(${x} ${y})` : ''}`.trim();
      if (transform) setAttr(group, 'transform', transform);
      expand(group, depth + 1, new Set([...inside, target]));
      return [group];
    });
  };
  expand(root, 0, new Set([root]));
}

/** A gradient that inherits from another (href) gets the other's settings and stops where it has none of its own. */
function resolveGradientLinks(root: Element): void {
  const gradients = new Map<string, Element>();
  for (const element of walk(root)) {
    const id = attr(element, 'id');
    if (id !== undefined && (element.name === 'linearGradient' || element.name === 'radialGradient') && !gradients.has(id)) gradients.set(id, element);
  }
  for (const gradient of gradients.values()) {
    const seen = new Set<Element>([gradient]);
    for (let source = gradients.get(hrefOf(gradient)?.replace(/^#/, '') ?? ''); source && !seen.has(source); source = gradients.get(hrefOf(source)?.replace(/^#/, '') ?? '')) {
      seen.add(source);
      for (const name of GRADIENT_SETTINGS) {
        const value = attr(source, name);
        if (value !== undefined && attr(gradient, name) === undefined) setAttr(gradient, name, value);
      }
      if (!gradient.children.some(c => isElement(c) && c.name === 'stop')) gradient.children = deepCopy(source).children.filter(c => isElement(c) && c.name === 'stop');
    }
  }
}

/** The element's attributes, cleaned; `style` declarations become attributes (they win over the attributes). */
function cleanAttributes(element: Element): Attribute[] {
  const kept = new Map<string, Attribute>();
  for (const a of element.attributes) {
    if (a.uri !== '') continue;
    const allowed = ATTRIBUTES.has(a.local) || (a.local === 'data-pivot' && element.name === 'g');
    const value = allowed ? safeValue(a.value) : undefined;
    if (value !== undefined) kept.set(a.local, plain(a.local, value));
  }
  for (const {property, value} of parseDeclarations(attr(element, 'style') ?? '')) {
    const safe = PRESENTATION.has(property) ? safeValue(value) : undefined;
    if (safe !== undefined) kept.set(property, plain(property, safe));
  }
  return [...kept.values()];
}

/** The element's children that may stay, cleaned; text goes (a drawing needs none). */
function cleanChildren(element: Element): Node[] {
  return element.children.flatMap(child => {
    if (!isElement(child) || child.uri !== element.uri || !ELEMENTS.has(child.name) || isHidden(child)) return [];
    return [{...child, uri: SVG_NS, attributes: cleanAttributes(child), children: cleanChildren(child)}];
  });
}

/** Removes url(#id) references to anything that isn't a gradient or clip path still in the document. */
function dropDanglingReferences(root: Element): void {
  const targets = new Set<string>();
  for (const element of walk(root)) {
    const id = attr(element, 'id');
    if (id !== undefined && DEFINITIONS.has(element.name)) targets.add(id);
  }
  for (const element of walk(root)) {
    element.attributes = element.attributes.filter(a => {
      const target = urlTarget(a.value);
      if (target !== undefined) return targets.has(target);
      return !/url\(/i.test(a.value);
    });
  }
}

export interface Clean {
  root: Element;
  svg: string;
}

/** Cleans a drawing that passed checkSvg (it throws on XML that doesn't parse). */
export function sanitizeSvg(svg: string): Clean {
  const {root: original} = parseXml(svg);
  expandUses(original);
  resolveGradientLinks(original);
  inlineStylesheets(original);
  const inherited = cleanAttributes(original).filter(a => PRESENTATION.has(a.name));
  const root: Element = {
    kind: 'element', name: 'svg', uri: SVG_NS, children: cleanChildren(original),
    attributes: [plain('xmlns', SVG_NS), plain('viewBox', VIEWBOX), ...inherited],
  };
  dropDanglingReferences(root);
  return {root, svg: serialize(root)};
}
