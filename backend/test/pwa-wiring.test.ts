import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

// The stack and the parent app are built separately; this keeps the sign-in return path the same in both
// (a mismatch made Cognito answer 400 on the first deploy).
const read = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8');

describe('parent app wiring', () => {
  it('Cognito allows exactly the path the parent app returns to after sign-in', () => {
    const app = read('../parent-web/src/auth/auth.ts').match(/CALLBACK_PATH = '([^']+)'/)?.[1];
    const stack = read('infra/stack.ts').match(/PWA_CALLBACK_PATH = '([^']+)'/)?.[1];
    expect(app).toBeTruthy();
    expect(stack).toBe(app);
  });
});
