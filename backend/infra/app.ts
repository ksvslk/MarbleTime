/**
 * The CDK app. `npx cdk synth` works without an AWS account. Deploying is a separate, approved step (README).
 * Context: `stage` (default dev), `budgetEmail` (adds a $10/month budget alert), `modelId` (the characters' model:
 * a Bedrock inference profile; default Claude Haiku 4.5), `signUp=closed` (only invited parents; see README), and
 * `speech`: `polly` (the default: Amazon Polly's voices, no listening) or `google` (Gemini voices and listening), which
 * needs the Google setup: `googleProject`, `googleWifProvider`, `googleServiceAccount` (README, "What the cloud needs
 * for Google"); without it, synth and deploy stop.
 */
import {App} from 'aws-cdk-lib';
import {bedrockModel, DEFAULT_MODEL_ID} from '../src/ai/models';
import {MarbleTimeStack} from './stack';

const app = new App();
const stage: string = app.node.tryGetContext('stage') ?? 'dev';
// The stage goes into resource names, including the Cognito login domain (lower case letters, digits, dashes).
if (!/^[a-z][a-z0-9-]{0,15}$/.test(stage)) throw new Error(`stage "${stage}": use lower case letters, digits and dashes`);

/** The Google setup, or a stop with what's missing (characters' voices and listening run on Google). */
function googleSetup() {
  const setup = {
    project: app.node.tryGetContext('googleProject') as string | undefined,
    wifProvider: app.node.tryGetContext('googleWifProvider') as string | undefined,
    serviceAccount: app.node.tryGetContext('googleServiceAccount') as string | undefined,
  };
  const missing = Object.entries({googleProject: setup.project, googleWifProvider: setup.wifProvider, googleServiceAccount: setup.serviceAccount})
    .filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) {
    throw new Error(`speech=google (Gemini voices and listening) needs ${missing.map(m => `--context ${m}=…`).join(' ')} (backend/README.md, "What the cloud needs for Google")`);
  }
  return setup as {project: string; wifProvider: string; serviceAccount: string};
}

/** Who makes the TV's lines: Amazon Polly, or Google with its setup. */
const speech: string = app.node.tryGetContext('speech') ?? 'polly';
if (speech !== 'polly' && speech !== 'google') throw new Error(`speech "${speech}": use polly or google`);

new MarbleTimeStack(app, `MarbleTime-${stage}`, {
  stage,
  speech,
  ...(speech === 'google' && {google: googleSetup()}),
  budgetEmail: app.node.tryGetContext('budgetEmail'),
  modelId: bedrockModel(app.node.tryGetContext('modelId') ?? DEFAULT_MODEL_ID),
  openSignUp: app.node.tryGetContext('signUp') !== 'closed',
  env: {account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1'},
  tags: {project: 'marbletime', stage},
});
