/**
 * The CDK app. `npx cdk synth` works without an AWS account. Deploying is a separate, approved step (README).
 * Context: `stage` (default dev), `budgetEmail` (adds a $10/month budget alert).
 */
import {App} from 'aws-cdk-lib';
import {MarbleTimeStack} from './stack';

const app = new App();
const stage: string = app.node.tryGetContext('stage') ?? 'dev';
// The stage goes into resource names, including the Cognito login domain (lower case letters, digits, dashes).
if (!/^[a-z][a-z0-9-]{0,15}$/.test(stage)) throw new Error(`stage "${stage}": use lower case letters, digits and dashes`);

new MarbleTimeStack(app, `MarbleTime-${stage}`, {
  stage,
  budgetEmail: app.node.tryGetContext('budgetEmail'),
  env: {account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1'},
  tags: {project: 'marbletime', stage},
});
