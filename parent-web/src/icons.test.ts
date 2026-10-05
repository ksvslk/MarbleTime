import {describe, expect, it} from 'vitest';
import {avatarValues, jobIconValues} from './api/types';
import {ART, ICONS, JOB_ICONS} from './icons';

describe('icons', () => {
  it('has exactly the job icons of the contract (JobIcon in openapi.yaml)', () => {
    expect(Object.keys(JOB_ICONS).sort()).toEqual([...jobIconValues].sort());
    for (const name of jobIconValues) expect(JOB_ICONS[name], name).toMatch(/^<(path|circle|rect|ellipse)\b/);
  });

  it('has art for every avatar, and the logo', () => {
    for (const avatar of avatarValues) expect(ART[avatar].body, avatar).toContain('<circle');
    expect(ART.logo.viewBox).toBe('0 0 24 24');
  });

  // The bodies are set as markup (dangerouslySetInnerHTML), so they must stay plain shapes.
  it('contain only plain SVG shapes: no scripts, styles, handlers or links', () => {
    const bodies = [...Object.entries(ICONS), ...Object.entries(ART).map(([name, art]) => [name, art.body] as const)];
    for (const [name, body] of bodies) {
      expect(body, name).not.toMatch(/<script|<style|<foreignObject|<a\b|\son\w+=|javascript:|href=/i);
    }
  });
});
