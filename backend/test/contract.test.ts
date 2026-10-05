import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {routes} from '../src/http/routes';

/** Paths and methods from openapi.yaml, with who may call them (`security: []` = nobody signs in). */
function contractRoutes() {
  const lines = readFileSync(join(__dirname, '../openapi.yaml'), 'utf8').split('\n');
  const found: {route: string; auth: 'parent' | 'device' | 'none'}[] = [];
  let path = '';
  let method = '';
  for (const line of lines) {
    const pathLine = /^ {2}(\/\S*):$/.exec(line);
    const methodLine = /^ {4}(get|post|patch|delete):/.exec(line);
    const security = /^ {6}security: (.*)$/.exec(line);
    if (pathLine) path = pathLine[1];
    else if (methodLine && path) {
      method = methodLine[1].toUpperCase();
      found.push({route: `${method} ${path}`, auth: 'parent'});
    } else if (security && path) {
      found[found.length - 1].auth = security[1].includes('device') ? 'device' : 'none';
    } else if (/^\S/.test(line)) path = '';
  }
  return found;
}

describe('the API contract (openapi.yaml)', () => {
  it('has a route for every operation, with the same auth, and nothing else', () => {
    const ours = routes.map(r => ({route: `${r.method} ${r.path}`, auth: r.auth}));
    const sort = (list: {route: string}[]) => [...list].sort((a, b) => a.route.localeCompare(b.route));
    expect(sort(ours)).toEqual(sort(contractRoutes()));
  });
});
