import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createCanvas, loadImage} from '@napi-rs/canvas';
import {describe, expect, it} from 'vitest';
import {templateSvg} from '../src/ai/fake';
import {checkClean, checkLayout, checkSvg, extractSvg, parsePivot, pivotsOf} from '../src/svg/check';
import {inlineStylesheets} from '../src/svg/css';
import {splitLayers} from '../src/svg/layers';
import {alphaBox, rasterize} from '../src/svg/rasterize';
import {ELEMENTS, PRESENTATION, safeValue, sanitizeSvg} from '../src/svg/sanitize';
import {parseTransform} from '../src/svg/transform';
import {attr, parseXml, serialize, walk} from '../src/svg/xml';

const GOOD = templateSvg(['green', 'yellow', 'blue']);
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', `${name}.svg`), 'utf8');
const svgOf = (body: string, root = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"${root}>${body}</svg>`;
/** The template with one part's group replaced. */
const withPart = (part: string, group: string) => GOOD.replace(new RegExp(`<g id="${part}"[^>]*>.*?</g>`), group);

/**
 * A hand-made drawing with everything the sanitiser and the splitter must get right: a stylesheet (class, id,
 * descendant, child selectors, !important, @media, :hover), gradients (one inheriting another), a clip path that uses a
 * gradient, a pattern, <use> (SVG 2 href and xlink:href), a wrapper that moves every part, parts nested in the head,
 * static drawing between parts, an empty part, and things that must go: scripts, handlers, links, images, text,
 * foreign objects, animations, hidden shapes and outside references.
 */
const TRICKY = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
     viewBox="0 0 512 512" width="100%" height="100%" stroke-linejoin="round" onload="alert(1)" sodipodi:docname="x.svg">
  <style>
    .skin { fill: #4caf50 }
    #head .skin { fill: #66bb6a }
    g > .dark { fill: #263238; stroke: none }
    .shine { fill: #ffffff !important }
    @media (max-width: 100px) { .skin { fill: red } }
    .skin:hover { fill: blue }
  </style>
  <defs>
    <linearGradient id="belly"><stop offset="0" stop-color="#fff59d"/><stop offset="1" stop-color="#ffb300"/></linearGradient>
    <linearGradient id="belly2" xlink:href="#belly" x2="0" y2="1"/>
    <clipPath id="round"><circle cx="256" cy="330" r="70" fill="url(#belly)"/></clipPath>
    <pattern id="dots" width="10" height="10"><circle cx="5" cy="5" r="2"/></pattern>
    <path id="spark" d="M0 -12 L3 -3 L12 0 L3 3 L0 12 L-3 3 L-12 0 L-3 -3 Z" fill="#ffd54f"/>
  </defs>
  <ellipse cx="256" cy="488" rx="120" ry="8" fill="#000000" opacity="0.15"/>
  <g transform="translate(0 10)">
    <g id="legs" data-pivot="256 400"><rect x="206" y="390" width="36" height="80" rx="16" fill="#8d6e63"/><rect x="270" y="390" width="36" height="80" rx="16" fill="#8d6e63"/></g>
    <g id="body" data-pivot="256 470" class="skin"><ellipse cx="256" cy="330" rx="100" ry="90"/><ellipse cx="256" cy="345" rx="60" ry="55" fill="url(#belly2)" clip-path="url(#round)"/></g>
    <use href="#spark" x="150" y="250"/>
    <use xlink:href="#spark" x="362" y="250" transform="rotate(10 362 250)"/>
    <g id="arm-left" data-pivot="170 300" onclick="steal()"><rect class="skin" x="102" y="288" width="78" height="30" rx="15"/></g>
    <g id="arm-right" data-pivot="342 300"><rect class="skin" x="332" y="288" width="78" height="30" rx="15"/></g>
    <g id="head" data-pivot="256 250">
      <circle class="skin" cx="256" cy="176" r="80"/>
      <g id="eye-left" data-pivot="226 166"><circle class="dark" cx="226" cy="166" r="14" stroke="red"/><circle class="shine" cx="222" cy="161" r="5" style="fill: red"/></g>
      <g id="eye-right" data-pivot="286 166"><circle class="dark" cx="286" cy="166" r="14"/><circle class="shine" cx="282" cy="161" r="5"/></g>
      <g id="mouth" data-pivot="256 212"><path class="dark" d="M230 202 Q256 234 282 202 Z"/></g>
      <path d="M200 110 Q256 80 312 110" stroke="#795548" stroke-width="6" fill="none" style="cursor: pointer; animation: spin 1s"/>
    </g>
    <g id="extra" data-pivot="256 100"></g>
  </g>
  <script>alert('x')</script>
  <foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">hi</div></foreignObject>
  <a href="https://evil.example"><circle cx="1" cy="1" r="1"/></a>
  <image href="https://evil.example/x.png" width="10" height="10"/>
  <text x="10" y="10">Pancake</text>
  <rect x="490" y="2" width="10" height="10" fill="url(#dots)" stroke="url('#belly')"/>
  <rect x="500" y="2" width="10" height="10" fill="url(https://evil.example/x)" filter="url(#blur)"/>
  <circle cx="5" cy="5" r="2" display="none"/>
  <animate attributeName="fill" to="red"/>
</svg>`;

describe('the code checker (what goes back to the drawing model)', () => {
  it('passes a good drawing', () => {
    expect(checkSvg(GOOD)).toEqual([]);
    expect(checkSvg(fixture('pancake-fox'))).toEqual([]);
  });

  it('says what is wrong, in words the drawing model can act on', () => {
    expect(checkSvg(GOOD.replace('</svg>', `<!--${'x'.repeat(16_000)}--></svg>`))).toEqual([expect.stringMatching(/^too large \(\d+ bytes, limit 16000\)$/)]);
    expect(checkSvg('<svg xmlns="http://www.w3.org/2000/svg"><g id="body"></svg>')).toEqual([expect.stringMatching(/^not valid XML: unexpected close tag \(line 1, column \d+\)$/)]);
    expect(checkSvg('<html><body/></html>')).toEqual(['the document must be one <svg> element (found <html>)']);
    expect(checkSvg(GOOD.replace('viewBox="0 0 512 512"', 'viewBox="0 0 100 100"'))).toEqual(['the <svg> needs viewBox="0 0 512 512"']);
    expect(checkSvg(GOOD.replace('</svg>', '<text x="1" y="1">Hi</text><script>1</script><filter id="f"/></svg>')))
      .toEqual(['forbidden element <script>', 'forbidden element <text>', 'forbidden element <filter>']);
    expect(checkSvg(GOOD.replace(/<g id="legs"[^>]*>(.*?)<\/g>/, '$1'))).toEqual(['missing group id="legs"']);
    expect(checkSvg(withPart('mouth', '<path id="mouth" d="M230 202 Q256 234 282 202 Z"/>')))
      .toEqual(['missing group id="mouth" (the id is on a <path>; use <g id="mouth" data-pivot="x y">)']);
    expect(checkSvg(GOOD.replace('</svg>', '<g id="head" data-pivot="1 1"/></svg>'))).toEqual(['id="head" is used 2 times; each part is one group']);
    expect(checkSvg(GOOD.replace('data-pivot="256 400"', 'data-pivot="middle"'))).toEqual(['group "legs" has no data-pivot="x y"']);
    expect(checkSvg(GOOD.replace('data-pivot="256 400"', 'data-pivot="256 600"'))).toEqual(['group "legs" has its data-pivot outside the picture (0 0 512 512)']);
    expect(checkSvg(GOOD.replace('<!DOCTYPE', '').replace('<svg', '<!DOCTYPE svg><svg'))).toEqual(['remove the <!DOCTYPE>']);
  });

  it('wants left and right as the viewer sees them', () => {
    const swapped = GOOD.replace('id="arm-left"', 'id="ARM"').replace('id="arm-right"', 'id="arm-left"').replace('id="ARM"', 'id="arm-right"');
    expect(checkSvg(swapped)).toEqual([
      "arm-left must be on the left of the picture as the viewer sees it, but its pivot (x=340) is not left of arm-right's (x=172); swap the two ids",
    ]);
    const eyes = GOOD.replace('id="eye-left"', 'id="EYE"').replace('id="eye-right"', 'id="eye-left"').replace('id="EYE"', 'id="eye-right"');
    expect(checkSvg(eyes)).toEqual([expect.stringMatching(/^eye-left must be on the left/)]);
  });

  it('reads pivots as "x y" or "x,y", through the transforms of the part and its groups', () => {
    expect([parsePivot('10 20'), parsePivot(' 10.5,-2 '), parsePivot('.5 3'), parsePivot('10'), parsePivot('a b')]).toEqual([[10, 20], [10.5, -2], [0.5, 3], undefined, undefined]);
    const moved = svgOf('<g transform="translate(10 20)"><g id="head" data-pivot="100 100" transform="scale(2)"><circle r="1"/></g><g id="body" transform="rotate(90 50 50)" data-pivot="100,50"/></g>');
    expect(Object.fromEntries(pivotsOf(parseXml(moved).root))).toEqual({head: [210, 220], body: [60, 120]});
    expect(checkSvg(GOOD.replace('<g id="extra" data-pivot="256 112">', '<g id="extra" data-pivot="256,112" transform="translate(0 0)">'))).toEqual([]);
  });

  it("takes the SVG out of a model's answer", () => {
    expect(extractSvg('```svg\n<svg a="1"></svg>\n```')).toBe('<svg a="1"></svg>');
    expect(extractSvg('Here is your character:\n<?xml version="1.0"?>\n<svg></svg>\nEnjoy!')).toBe('<?xml version="1.0"?>\n<svg></svg>');
    expect(extractSvg('<svg viewBox="0 0 512 512"><g id="body">')).toBe('<svg viewBox="0 0 512 512"><g id="body">');
    expect(extractSvg('I cannot draw that.')).toBe('I cannot draw that.');
  });
});

describe('the mouth must be able to talk (checked after sanitising)', () => {
  const mouth = (group: string) => checkClean(sanitizeSvg(withPart('mouth', group)).root);
  const LINE = ['the mouth is only a line: draw it as a filled shape (fill not "none"), a dark closed or slightly open smile about 30–60 wide, so it can open and close to talk'];

  it('refuses a stroke-only mouth', () => {
    expect(mouth('<g id="mouth" data-pivot="256 212"><path d="M230 202 Q256 234 282 202" stroke="#263238" stroke-width="4" fill="none"/></g>')).toEqual(LINE);
    expect(mouth('<g id="mouth" data-pivot="256 212"><line x1="230" y1="210" x2="282" y2="210" stroke="#000"/></g>')).toEqual(LINE);
    expect(mouth('<g id="mouth" data-pivot="256 212" fill="none"><path d="M230 202 Q256 234 282 202 Z" stroke="#000"/></g>')).toEqual(LINE);
    expect(mouth('<g id="mouth" data-pivot="256 212"><path d="M230 202 Q256 234 282 202 Z" fill="#000" fill-opacity="0"/></g>')).toEqual(LINE);
    expect(mouth('<g id="mouth" data-pivot="256 212"><path d="M230 202 Q256 234 282 202 Z" style="fill:none;stroke:#000"/></g>')).toEqual(LINE);
  });

  it('accepts a filled one, whatever gives it its fill (attribute, class, group, or SVG\'s default black)', () => {
    expect(mouth('<g id="mouth" data-pivot="256 212"><path d="M230 202 Q256 234 282 202 Z" fill="#c62828"/></g>')).toEqual([]);
    expect(checkClean(sanitizeSvg(withPart('mouth', '<g id="mouth" data-pivot="256 212"><path class="m" d="M230 202 Q256 234 282 202 Z"/></g>').replace('<g id="extra"', '<style>.m{fill:#222}</style><g id="extra"')).root)).toEqual([]);
    expect(mouth('<g id="mouth" data-pivot="256 212" fill="#333"><path d="M230 202 Q256 234 282 202 Z"/></g>')).toEqual([]);
    expect(mouth('<g id="mouth" data-pivot="256 212"><path d="M230 202 Q256 234 282 202 Z"/></g>')).toEqual([]);
  });

  it('says when a part was lost with an element the sanitiser removed', () => {
    const inLink = GOOD.replace(/(<g id="extra"[^>]*>.*?<\/g>)/, '<a href="#x">$1</a>');
    expect(checkClean(sanitizeSvg(inLink).root)).toEqual(['group "extra" sits inside an element that isn\'t allowed (it was removed); keep every part a plain <g> with data-pivot="x y"']);
  });
});

describe('where the character stands (from the rendered picture)', () => {
  const box = (left: number, top: number, right: number, bottom: number) => ({left, top, right, bottom});

  it('accepts a character on the floor, centred, with a little slack', () => {
    expect(checkLayout(box(104, 64, 408, 480))).toEqual([]);
    expect(checkLayout(box(150, 13, 380, 504))).toEqual([]);
  });

  it('says how to move it', () => {
    expect(checkLayout(box(104, 64, 408, 430))).toEqual(['the character floats: its lowest point is at y=430; stand it on the floor with its feet between y=470 and y=500']);
    expect(checkLayout(box(104, 64, 408, 512))).toEqual(['the character goes below the floor: its lowest point is at y=512; put its feet between y=470 and y=500']);
    expect(checkLayout(box(104, 4, 408, 480))).toEqual(['the drawing reaches too high (y=4); keep everything below y=16']);
    expect(checkLayout(box(10, 64, 300, 480))).toEqual(['the character is off-centre (its middle is at x=155); centre it on x=256']);
    expect(checkLayout(box(0, 0, 512, 512))).toEqual(['remove the background: everything around the character must stay transparent (no full-size rectangle or scenery)']);
    expect(checkLayout(undefined)).toEqual(['the picture is empty: draw the character']);
  });
});

describe('the sanitiser', () => {
  const clean = sanitizeSvg(TRICKY);

  it('keeps only what the TV can draw: plain shapes, groups, gradients and clip paths, with plain attributes', () => {
    for (const element of walk(clean.root)) {
      expect(element.name === 'svg' || ELEMENTS.has(element.name)).toBe(true);
      for (const a of element.attributes) {
        expect(a.uri).toBe('');
        expect(a.name).not.toMatch(/^on|^class$|^style$|href|^filter$|^mask$/);
        if (a.name !== 'xmlns') expect(a.value).not.toMatch(/javascript:|https?:|data:|url\((?!#(belly|belly2|round)\))/);
      }
    }
    expect(clean.svg).not.toMatch(/script|foreignObject|<a |<image|<text|Pancake|animate|pattern|evil|alert|steal|sodipodi|cursor|display/);
    // The root: the namespace, the one viewBox, and the presentation it passes down.
    expect(clean.root.attributes.map(a => `${a.name}=${a.value}`)).toEqual(['xmlns=http://www.w3.org/2000/svg', 'viewBox=0 0 512 512', 'stroke-linejoin=round']);
  });

  it('folds the stylesheet into each element by the cascade (specificity, order, !important, the own style)', () => {
    const fills = (part: string) => [...walk(clean.root)].filter(e => e.name === 'g' && attr(e, 'id') === part).flatMap(g => [...walk(g)].slice(1).map(e => attr(e, 'fill')));
    expect(fills('arm-left')).toEqual(['#4caf50']); // .skin
    expect(fills('head')[0]).toBe('#66bb6a'); // #head .skin beats .skin
    expect(fills('eye-left')).toEqual(['#263238', '#ffffff']); // g > .dark; .shine !important beats style="fill: red"
    expect([...walk(clean.root)].find(e => attr(e, 'cx') === '226' && attr(e, 'r') === '14')!.attributes.find(a => a.name === 'stroke')?.value).toBe('none'); // the sheet beats the attribute
    expect(attr([...walk(clean.root)].find(e => attr(e, 'id') === 'body')!, 'fill')).toBe('#4caf50'); // a class on the group
  });

  it('turns <use> into copies (without ids), gradient links into full gradients, and drops what points nowhere', () => {
    const sparks = [...walk(clean.root)].filter(e => e.name === 'g' && attr(e, 'transform')?.includes('translate(') && !attr(e, 'id'));
    expect(sparks.map(g => attr(g, 'transform'))).toEqual(['translate(0 10)', 'translate(150 250)', 'rotate(10 362 250) translate(362 250)']);
    expect(serialize(sparks[1])).toBe('<g transform="translate(150 250)"><path d="M0 -12 L3 -3 L12 0 L3 3 L0 12 L-3 3 L-12 0 L-3 -3 Z" fill="#ffd54f"/></g>');
    const belly2 = [...walk(clean.root)].find(e => attr(e, 'id') === 'belly2')!;
    expect(serialize(belly2)).toBe('<linearGradient id="belly2" x2="0" y2="1"><stop offset="0" stop-color="#fff59d"/><stop offset="1" stop-color="#ffb300"/></linearGradient>');
    const corners = [...walk(clean.root)].filter(e => e.name === 'rect' && ['490', '500'].includes(attr(e, 'x') ?? ''));
    expect(corners.map(serialize)).toEqual(['<rect x="490" y="2" width="10" height="10" stroke="url(#belly)"/>', '<rect x="500" y="2" width="10" height="10"/>']);
    // A <use> pointing at itself, at nothing, or outside goes.
    expect(sanitizeSvg(svgOf('<g id="a"><use href="#a"/></g><use href="#nothing"/><use href="https://x.example/a.svg#b"/>')).svg).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g id="a"/></svg>');
  });

  it('accepts only references inside the drawing', () => {
    expect([safeValue('url(#a)'), safeValue("url('#a')"), safeValue('url( "#a" )'), safeValue('#fff')]).toEqual(['url(#a)', 'url(#a)', 'url(#a)', '#fff']);
    for (const bad of ['url(http://x/a)', 'url(data:image/png;base64,AA)', 'javascript:alert(1)', 'url(#a) url(//x)', 'expression(alert(1))', '<b>']) expect(safeValue(bad)).toBeUndefined();
    expect(PRESENTATION.has('fill') && !PRESENTATION.has('cursor') && !PRESENTATION.has('mask')).toBe(true);
  });

  it('gives real drawings\' layers their parents: the robot drew its face inside its head, the fox beside it', () => {
    const parents = (name: string) => splitLayers(sanitizeSvg(fixture(name)).root).layers.filter(l => l.parent).map(l => `${l.part}<${l.parent}`);
    expect(parents('robot-drummer')).toEqual(['eye-left<head', 'eye-right<head', 'mouth<head']);
    expect(parents('pancake-fox')).toEqual(['eye-left<head', 'eye-right<head', 'mouth<head']);
  });

  it('keeps the look of a real drawing: classes from a stylesheet in <defs>, a gradient, an SVG 2 <use>', () => {
    for (const name of ['robot-drummer', 'brave-dog', 'pancake-fox']) {
      const {svg} = sanitizeSvg(fixture(name));
      expect(svg).not.toMatch(/class=|<style|<use|href=/);
      expect(parseXml(svg).root.name).toBe('svg');
    }
    expect(sanitizeSvg(fixture('robot-drummer')).svg).toContain('fill="#4DD0E1"');
  });

  it('folds only what a static picture shows (no hover, no @media), and leaves documents without a sheet alone', () => {
    const root = parseXml(svgOf('<style>@import url(x.css); rect{fill:#111} rect.a{fill:#222} #r{fill:#333} @media print{rect{fill:red}} rect:hover{fill:blue} [x]{fill:green}</style><rect id="r" class="a"/><rect class="a"/><rect/>')).root;
    expect(inlineStylesheets(root)).toBe(3);
    expect([...walk(root)].filter(e => e.name === 'rect').map(e => attr(e, 'style'))).toEqual(['fill:#111;fill:#222;fill:#333', 'fill:#111;fill:#222', 'fill:#111']);
    expect(inlineStylesheets(parseXml(GOOD).root)).toBe(0);
  });
});

describe('the layer splitter', () => {
  it('cuts the template into one layer per part, in drawing order, each a whole small SVG with its pivot and the part it rides on', () => {
    const {viewBox, layers} = splitLayers(sanitizeSvg(GOOD).root);
    expect(viewBox).toBe('0 0 512 512');
    expect(layers.map(l => [l.part, l.parent, l.pivot])).toEqual([
      ['extra', undefined, [256, 112]], ['legs', undefined, [256, 400]], ['body', undefined, [256, 480]], ['arm-left', undefined, [172, 300]],
      ['arm-right', undefined, [340, 300]], ['head', undefined, [256, 250]],
      ['eye-left', 'head', [226, 166]], ['eye-right', 'head', [286, 166]], ['mouth', 'head', [256, 212]],
    ]);
    for (const layer of layers) {
      expect(layer.svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 512 512">.*<\/svg>$/);
      expect(layer.svg).not.toMatch(/data-pivot|id="/);
    }
    // The mouth sits in an attribute-only copy of the head group it was drawn in.
    expect(layers[8].svg).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g><g><path d="M230 202 Q256 234 282 202 Z" fill="#263238"/></g></g></svg>');
  });

  it('flattens parts nested in other parts, cuts the outer part around them, and keeps static drawing as layers that never move', () => {
    const {layers} = splitLayers(sanitizeSvg(TRICKY).root);
    expect(layers.map(l => l.part ?? 'static')).toEqual([
      'static', 'legs', 'body', 'static', 'arm-left', 'arm-right', 'head', 'eye-left', 'eye-right', 'mouth', 'head', 'static',
    ]);
    // Static layers have neither part nor pivot; the two halves of the head share its pivot.
    expect(layers.filter(l => !l.part).every(l => l.pivot === undefined)).toBe(true);
    expect(layers[6].pivot).toEqual(layers[10].pivot);
    // Everything in the moved wrapper keeps its move, and pivots follow it (translate(0 10)).
    expect(layers.find(l => l.part === 'mouth')!.pivot).toEqual([256, 222]);
    expect(layers[1].svg).toContain('<g transform="translate(0 10)"><g><rect');
    // The eye keeps what its head and the wrapper pass down, without their ids or pivots.
    expect(layers[7].svg).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" stroke-linejoin="round"><g transform="translate(0 10)"><g><g><circle cx="226" cy="166" r="14" stroke="none" fill="#263238"/><circle cx="222" cy="161" r="5" fill="#ffffff"/></g></g></g></svg>');
    // The empty "extra" draws nothing, so it has no layer.
    expect(layers.some(l => l.part === 'extra')).toBe(false);
    // The face rides on the head; both pieces of the head keep the head as their part, with no parent.
    expect(layers.map(l => l.parent)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'head', 'head', 'head', undefined, undefined]);
  });

  it('says which part a layer rides on: the named part it was drawn inside, at any depth', () => {
    const art = splitLayers(sanitizeSvg(svgOf(`
      <g id="body" data-pivot="256 480"><ellipse cx="256" cy="330" rx="100" ry="90"/>
        <g id="arm-right" data-pivot="340 300"><rect x="330" y="288" width="78" height="30"/>
          <g id="extra" data-pivot="400 300"><path d="M400 300 L420 200 L430 205 Z"/></g>
          <rect x="400" y="290" width="12" height="12"/>
        </g>
        <g id="head" data-pivot="256 250"><circle cx="256" cy="176" r="80"/>
          <g transform="translate(0 2)"><g id="eye-left" data-pivot="226 166"><circle cx="226" cy="166" r="14"/></g></g>
        </g>
      </g>
      <g id="eye-right" data-pivot="286 166"><circle cx="286" cy="166" r="14"/></g>
      <g id="mouth" data-pivot="256 212"><path d="M230 202 Q256 234 282 202 Z"/></g>
      <g id="legs" data-pivot="256 400"><rect x="206" y="396" width="36" height="84"/></g>
      <g id="arm-left" data-pivot="172 300"><rect x="104" y="288" width="78" height="30"/></g>`)).root);
    expect(art.layers.map(l => [l.part, l.parent ?? '-'])).toEqual([
      ['body', '-'],
      ['arm-right', 'body'], ['extra', 'arm-right'], ['arm-right', 'body'], // a held thing rides on the arm; both pieces of the arm on the body
      ['head', 'body'], ['eye-left', 'head'], // inside the head (through a plain group)
      ['eye-right', 'head'], ['mouth', 'head'], // drawn beside the head: a face rides on the head all the same
      ['legs', '-'], ['arm-left', '-'],
    ]);
    expect(art.layers[5].pivot).toEqual([226, 168]);
  });

  it('gives each layer exactly the gradients and clip paths it uses (and what those use), and nothing else', () => {
    const {layers} = splitLayers(sanitizeSvg(TRICKY).root);
    const defsOf = (svg: string) => [...svg.matchAll(/<(linearGradient|radialGradient|clipPath) id="([^"]+)"/g)].map(m => m[2]);
    expect(defsOf(layers.find(l => l.part === 'body')!.svg)).toEqual(['belly', 'belly2', 'round']); // round's circle uses belly
    expect(defsOf(layers.at(-1)!.svg)).toEqual(['belly']); // the corner rect's stroke
    expect(layers.filter(l => l.part !== 'body' && l !== layers.at(-1)).every(l => !l.svg.includes('<defs>'))).toBe(true);
    // Real drawing: the dog's light beam gradient goes only where it is used.
    const dog = splitLayers(sanitizeSvg(fixture('brave-dog')).root).layers;
    expect(dog.filter(l => l.svg.includes('url(#lightBeam)')).every(l => l.svg.includes('<radialGradient id="lightBeam"'))).toBe(true);
    expect(dog.filter(l => !l.svg.includes('url(#lightBeam)')).some(l => l.svg.includes('lightBeam'))).toBe(false);
  });

  it('puts the layers back together as the whole picture', async () => {
    const pixels = async (svgs: string[]) => {
      const canvas = createCanvas(512, 512);
      const context = canvas.getContext('2d');
      for (const svg of svgs) context.drawImage(await loadImage(Buffer.from(svg)), 0, 0, 512, 512);
      return context.getImageData(0, 0, 512, 512).data;
    };
    for (const source of [GOOD, TRICKY, fixture('robot-drummer'), fixture('brave-dog'), fixture('pancake-fox')]) {
      const {root, svg} = sanitizeSvg(source);
      const [whole, layered] = [await pixels([svg]), await pixels(splitLayers(root).layers.map(l => l.svg))];
      let differ = 0;
      for (let i = 0; i < whole.length; i += 4) {
        if ([0, 1, 2, 3].some(c => Math.abs(whole[i + c] - layered[i + c]) > 8)) differ++;
      }
      expect(differ).toBeLessThan(20); // anti-aliasing at a few edges
    }
  });
});

describe('the rasteriser', () => {
  it('renders the drawing on white for the picture check, and finds where something was drawn', async () => {
    const {png, box} = await rasterize(sanitizeSvg(GOOD).svg);
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    const image = await loadImage(png);
    expect([image.width, image.height]).toEqual([512, 512]);
    expect(box).toEqual({left: expect.any(Number), top: 64, right: expect.any(Number), bottom: 480});
    expect(checkLayout(box)).toEqual([]);
    expect((await rasterize(svgOf(''))).box).toBeUndefined();
  });

  it('reads the drawn area from the alpha channel, ignoring faint anti-aliasing', () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4);
    rgba[(1 * 4 + 2) * 4 + 3] = 255;
    rgba[(2 * 4 + 1) * 4 + 3] = 200;
    rgba[(3 * 4 + 3) * 4 + 3] = 10;
    expect(alphaBox(rgba, 4, 4)).toEqual({left: 1, top: 1, right: 3, bottom: 3});
    expect(alphaBox(new Uint8ClampedArray(16), 2, 2)).toBeUndefined();
  });
});

describe('transforms', () => {
  it('reads every SVG transform', () => {
    const point = (t: string, x: number, y: number) => {
      const m = parseTransform(t)!;
      return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]].map(n => Math.round(n * 1000) / 1000);
    };
    expect(point('translate(10)', 1, 1)).toEqual([11, 1]);
    expect(point('scale(2 3)', 1, 1)).toEqual([2, 3]);
    expect(point('rotate(90)', 1, 0)).toEqual([0, 1]);
    expect(point('rotate(180 5 5)', 0, 0)).toEqual([10, 10]);
    expect(point('matrix(1 0 0 1 5 6), skewX(45)', 0, 1)).toEqual([6, 7]);
    expect(point('skewY(45)', 1, 0)).toEqual([1, 1]);
    expect(parseTransform('wobble(3)')).toBeUndefined();
    expect(parseTransform('translate(a)')).toBeUndefined();
  });
});
