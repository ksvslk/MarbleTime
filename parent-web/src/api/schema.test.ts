import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const packageDir = fileURLToPath(new URL('../..', import.meta.url));

describe('API types', () => {
  it('match backend/openapi.yaml (if this fails, the contract changed: run `npm run gen:api`)', () => {
    // The same command as `npm run gen:api`, plus --check: exits non-zero when src/api/schema.ts is stale.
    expect(() => execFileSync('npm', ['run', '--silent', 'gen:api', '--', '--check'], {cwd: packageDir, stdio: 'pipe'})).not.toThrow();
  }, 60_000);
});
