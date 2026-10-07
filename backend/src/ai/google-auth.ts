/**
 * Google credentials for Vertex AI (Gemini) and Cloud Text-to-Speech (Gemini-TTS).
 * - On a developer's machine: the gcloud sign-in (`gcloud auth login`), its access token (renewed every 45 minutes) and
 *   project (GOOGLE_CLOUD_PROJECT or `gcloud config get-value project`).
 * - In AWS: not built yet. The plan is keyless Workload Identity Federation from the Lambda's role (backend/README.md,
 *   "What the cloud needs for Google"); until then a call says so, and deploys refuse to start without the setup.
 */
import {execFileSync} from 'node:child_process';

/** Missing or expired Google credentials; the message says what to do. */
export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleAuthError';
  }
}

export interface GoogleAuth {
  project(): string;
  /** An OAuth access token (Bearer). */
  token(): string;
}

const gcloud = (...args: string[]) => {
  try {
    return execFileSync('gcloud', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  } catch {
    return '';
  }
};

export function gcloudAuth(): GoogleAuth {
  let token = '';
  let at = 0;
  let project: string | undefined;
  return {
    project() {
      project ??= process.env.GOOGLE_CLOUD_PROJECT || gcloud('config', 'get-value', 'project');
      if (!project) throw new GoogleAuthError('No Google Cloud project: set GOOGLE_CLOUD_PROJECT, or run `gcloud config set project <id>`');
      return project;
    },
    token() {
      if (!token || Date.now() - at > 45 * 60 * 1000) {
        token = gcloud('auth', 'print-access-token');
        if (!token) throw new GoogleAuthError('Google sign-in is missing or expired on this machine: run `gcloud auth login`');
        at = Date.now();
      }
      return token;
    },
  };
}

/** One sign-in for the whole process. */
let shared: GoogleAuth | undefined;
export const defaultGoogleAuth = (): GoogleAuth => (shared ??= gcloudAuth());

/** Google from AWS isn't built yet: every call explains (README: Workload Identity Federation). */
export function notInAwsYet(): GoogleAuth {
  const fail = (): never => {
    throw new GoogleAuthError("Google sign-in from AWS (Workload Identity Federation) isn't built yet: see backend/README.md");
  };
  return {project: () => process.env.GOOGLE_CLOUD_PROJECT || fail(), token: fail};
}
