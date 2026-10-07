/**
 * A small XML tree for SVG work, on `saxes` (a strict, non-validating XML parser: ISC). Comments and processing
 * instructions are dropped; CDATA becomes text. No DTD processing: entities other than XML's own five and character
 * references are an error, so there is no entity expansion to abuse.
 */
import {SaxesParser} from 'saxes';

export const SVG_NS = 'http://www.w3.org/2000/svg';
export const XLINK_NS = 'http://www.w3.org/1999/xlink';

export interface Attribute {
  /** As written, e.g. "fill" or "xlink:href". */
  name: string;
  local: string;
  prefix: string;
  /** The namespace URI ("" for ordinary attributes). */
  uri: string;
  value: string;
}

export interface Element {
  kind: 'element';
  /** The local name, e.g. "g". */
  name: string;
  /** The namespace URI ("" when the document declared none). */
  uri: string;
  attributes: Attribute[];
  children: Node[];
}

export interface Text {
  kind: 'text';
  text: string;
}

export type Node = Element | Text;

export interface Parsed {
  root: Element;
  /** The document had a <!DOCTYPE> (refused by the checker). */
  doctype: boolean;
}

/** Parses a whole document; throws Error("line:column: problem") when it isn't well-formed XML. */
export function parseXml(xml: string): Parsed {
  const parser = new SaxesParser({xmlns: true, position: true});
  const stack: Element[] = [];
  let root: Element | undefined;
  let doctype = false;
  let failure: Error | undefined;
  parser.on('error', error => {
    failure ??= error;
    throw error;
  });
  parser.on('doctype', () => {
    doctype = true;
  });
  parser.on('opentag', tag => {
    const element: Element = {
      kind: 'element',
      name: tag.local ?? tag.name,
      uri: tag.uri ?? '',
      attributes: Object.values(tag.attributes).map(a => ({name: a.name, local: a.local, prefix: a.prefix, uri: a.uri, value: a.value})),
      children: [],
    };
    const parent = stack.at(-1);
    if (parent) parent.children.push(element);
    else root = element;
    if (!tag.isSelfClosing) stack.push(element);
  });
  parser.on('closetag', tag => {
    if (!tag.isSelfClosing) stack.pop();
  });
  const addText = (text: string) => {
    const parent = stack.at(-1);
    if (parent && text) parent.children.push({kind: 'text', text});
  };
  parser.on('text', addText);
  parser.on('cdata', addText);
  try {
    parser.write(xml).close();
  } catch (error) {
    throw failure ?? error;
  }
  if (!root) throw new Error('1:1: no root element');
  return {root, doctype};
}

export const isElement = (node: Node): node is Element => node.kind === 'element';

export const elementChildren = (element: Element) => element.children.filter(isElement);

/** The value of an attribute without a namespace (or `xlink:href` by its full name). */
export function attr(element: Element, name: string): string | undefined {
  return element.attributes.find(a => (a.uri === '' ? a.local === name : a.name === name))?.value;
}

/** Sets (or replaces) an attribute without a namespace, keeping its place if it was there. */
export function setAttr(element: Element, name: string, value: string): void {
  const existing = element.attributes.find(a => a.uri === '' && a.local === name);
  if (existing) existing.value = value;
  else element.attributes.push({name, local: name, prefix: '', uri: '', value});
}

export function removeAttr(element: Element, name: string): void {
  element.attributes = element.attributes.filter(a => !(a.uri === '' ? a.local === name : a.name === name));
}

/** Every element in document order (the element itself first). */
export function* walk(element: Element): Generator<Element> {
  yield element;
  for (const child of element.children) if (isElement(child)) yield* walk(child);
}

const escapeAttribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\t/g, '&#9;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;');
const escapeText = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Writes an element out compactly. Elements are written by their local name (the caller makes sure they are SVG
 * elements and declares the namespaces on the root); attributes by their written name.
 */
export function serialize(element: Element): string {
  const attributes = element.attributes.map(a => ` ${a.name}="${escapeAttribute(a.value)}"`).join('');
  if (!element.children.length) return `<${element.name}${attributes}/>`;
  const inner = element.children.map(child => (child.kind === 'text' ? escapeText(child.text) : serialize(child))).join('');
  return `<${element.name}${attributes}>${inner}</${element.name}>`;
}

/** A copy of an element without its children (a wrapper that keeps its attributes). */
export const shallowCopy = (element: Element, children: Node[] = []): Element => ({
  kind: 'element', name: element.name, uri: element.uri, attributes: element.attributes.map(a => ({...a})), children,
});

export const deepCopy = (element: Element): Element => ({
  ...shallowCopy(element),
  children: element.children.map(child => (child.kind === 'text' ? {...child} : deepCopy(child))),
});
