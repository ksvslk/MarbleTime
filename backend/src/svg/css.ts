/**
 * Stylesheets inside a drawing (<style>), folded into each element's `style` attribute so the result needs no CSS
 * engine: Skia (the rasteriser) ignores <style>, and so does react-native-svg's SvgXml. About a third of the measured
 * drawings colour their shapes with classes.
 *
 * Supported: rules with type, #id and .class selectors, compounds of them (path.skin), descendant and child
 * combinators, selector lists, `!important`, and the cascade (importance, specificity, then order; an element's own
 * style attribute beats the sheet unless the sheet's declaration is !important). At-rules (@media, @keyframes…),
 * pseudo-classes and attribute selectors are skipped: a static picture has no hover, and models rarely use them.
 */
import {attr, type Element, elementChildren, isElement, setAttr} from './xml';

interface Compound {
  type?: string;
  id?: string;
  classes: string[];
}

/** A selector read right to left: the subject first, then each ancestor step with how it joins the one before it. */
interface Selector {
  steps: {compound: Compound; combinator: ' ' | '>'}[];
  specificity: number;
}

interface Rule {
  selectors: Selector[];
  declarations: Declaration[];
}

export interface Declaration {
  property: string;
  value: string;
  important: boolean;
}

/** `fill: red; stroke: blue !important` → declarations (lower-case properties, values trimmed). */
export function parseDeclarations(text: string): Declaration[] {
  const out: Declaration[] = [];
  for (const part of splitOutside(text, ';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const property = part.slice(0, colon).trim().toLowerCase();
    let value = part.slice(colon + 1).trim();
    const important = /!\s*important\s*$/i.test(value);
    if (important) value = value.replace(/!\s*important\s*$/i, '').trim();
    if (property && value) out.push({property, value, important});
  }
  return out;
}

/** Splits on a character, but not inside parentheses or quotes (url("a;b")). */
function splitOutside(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

const COMPOUND = /^(\*|[a-zA-Z][\w-]*)?((?:[#.][\w-]+)*)$/;

function parseSelector(text: string): Selector | undefined {
  const tokens = text.trim().replace(/\s*>\s*/g, ' > ').split(/\s+/).filter(Boolean);
  const steps: Selector['steps'] = [];
  let combinator: ' ' | '>' = ' ';
  let ids = 0;
  let classes = 0;
  let types = 0;
  const compounds: {compound: Compound; combinator: ' ' | '>'}[] = [];
  for (const token of tokens) {
    if (token === '>') {
      if (!compounds.length) return undefined;
      combinator = '>';
      continue;
    }
    const match = COMPOUND.exec(token);
    if (!match || (!match[1] && !match[2])) return undefined; // pseudo-classes, attribute selectors, …
    const compound: Compound = {classes: []};
    if (match[1] && match[1] !== '*') {
      compound.type = match[1];
      types++;
    }
    for (const piece of match[2].match(/[#.][\w-]+/g) ?? []) {
      if (piece[0] === '#') {
        compound.id = piece.slice(1);
        ids++;
      } else {
        compound.classes.push(piece.slice(1));
        classes++;
      }
    }
    compounds.push({compound, combinator});
    combinator = ' ';
  }
  if (!compounds.length || combinator === '>') return undefined;
  // Right to left: each step remembers how it joins the step to its right.
  for (let i = compounds.length - 1; i >= 0; i--) {
    steps.push({compound: compounds[i].compound, combinator: i + 1 < compounds.length ? compounds[i + 1].combinator : ' '});
  }
  return {steps, specificity: ids * 10_000 + classes * 100 + types};
}

/** The rules of a stylesheet; at-rules and their blocks are skipped. */
export function parseStylesheet(css: string): Rule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    const prelude = text.slice(i, open).trim();
    // Find the matching close brace (at-rules like @media hold nested blocks).
    let depth = 1;
    let j = open + 1;
    for (; j < text.length && depth > 0; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') depth--;
    }
    const body = text.slice(open + 1, j - 1);
    i = j;
    // An "@import …;" before the rule would sit in the prelude: keep only what follows the last semicolon.
    const selectorText = prelude.slice(prelude.lastIndexOf(';') + 1).trim();
    if (!selectorText || selectorText.startsWith('@')) continue;
    const selectors = splitOutside(selectorText, ',').map(parseSelector).filter((s): s is Selector => s !== undefined);
    if (selectors.length) rules.push({selectors, declarations: parseDeclarations(body)});
  }
  return rules;
}

const classesOf = (element: Element) => (attr(element, 'class') ?? '').split(/\s+/).filter(Boolean);

function matchesCompound(element: Element, compound: Compound): boolean {
  if (compound.type !== undefined && element.name !== compound.type) return false;
  if (compound.id !== undefined && attr(element, 'id') !== compound.id) return false;
  const classes = classesOf(element);
  return compound.classes.every(c => classes.includes(c));
}

/** Whether a selector matches an element, given the element's ancestors (nearest last). */
function matches(selector: Selector, element: Element, ancestors: Element[]): boolean {
  const [subject, ...rest] = selector.steps;
  if (!matchesCompound(element, subject.compound)) return false;
  // Walk outwards; a descendant step may skip ancestors, a child step may not.
  const climb = (step: number, from: number): boolean => {
    if (step >= rest.length) return true;
    const {compound, combinator} = rest[step];
    const joinsChild = combinator === '>';
    for (let k = from; k >= 0; k--) {
      if (matchesCompound(ancestors[k], compound) && climb(step + 1, k - 1)) return true;
      if (joinsChild) return false;
    }
    return false;
  };
  return climb(0, ancestors.length - 1);
}

/** The text of every <style> element, which is then removed. */
function takeStylesheets(element: Element): string {
  let css = '';
  element.children = element.children.filter(child => {
    if (!isElement(child)) return true;
    if (child.name === 'style') {
      css += child.children.map(c => (c.kind === 'text' ? c.text : '')).join('') + '\n';
      return false;
    }
    css += takeStylesheets(child);
    return true;
  });
  return css;
}

const declarationText = (declarations: Declaration[]) => declarations.map(d => `${d.property}:${d.value}`).join(';');

/**
 * Folds every <style> of the document into `style` attributes and removes the <style> elements. Returns how many
 * rules it applied (0 when there was no stylesheet).
 */
export function inlineStylesheets(root: Element): number {
  const rules = parseStylesheet(takeStylesheets(root));
  if (!rules.length) return 0;
  const visit = (element: Element, ancestors: Element[]) => {
    const found: {declaration: Declaration; specificity: number; order: number}[] = [];
    let order = 0;
    for (const rule of rules) {
      const best = Math.max(-1, ...rule.selectors.filter(s => matches(s, element, ancestors)).map(s => s.specificity));
      for (const declaration of rule.declarations) {
        order++;
        if (best >= 0) found.push({declaration, specificity: best, order});
      }
    }
    if (found.length) {
      // The cascade: normal sheet declarations, then the element's own style, then !important sheet declarations.
      const sorted = found.sort((a, b) => a.specificity - b.specificity || a.order - b.order).map(f => f.declaration);
      const own = parseDeclarations(attr(element, 'style') ?? '');
      setAttr(element, 'style', declarationText([...sorted.filter(d => !d.important), ...own, ...sorted.filter(d => d.important)]));
    }
    for (const child of elementChildren(element)) visit(child, [...ancestors, element]);
  };
  visit(root, []);
  return rules.length;
}
