/**
 * Web Push with the `web-push` package. The VAPID private key is a secret: it lives in SSM Parameter Store
 * (SecureString), is read once per Lambda container, and is never logged, returned or put in the template.
 */
import {GetParameterCommand, SSMClient} from '@aws-sdk/client-ssm';
import webpush from 'web-push';
import type {PushResult, PushSender} from '../domain/push';
import type {PushSubscription} from '../domain/types';

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

/** The keys from SSM, read on first use and kept (a failed read is tried again next time). */
export function vapidFromSsm(publicName: string, privateName: string): () => Promise<VapidKeys> {
  const ssm = new SSMClient({});
  const read = async (name: string, decrypt: boolean) => {
    const {Parameter} = await ssm.send(new GetParameterCommand({Name: name, WithDecryption: decrypt}));
    if (!Parameter?.Value) throw new Error(`SSM parameter ${name} is empty`);
    return Parameter.Value;
  };
  let keys: Promise<VapidKeys> | undefined;
  return () => {
    keys ??= Promise.all([read(publicName, false), read(privateName, true)])
      .then(([publicKey, privateKey]) => ({publicKey, privateKey}))
      .catch(error => {
        keys = undefined;
        throw error;
      });
    return keys;
  };
}

type Send = typeof webpush.sendNotification;

const hostOf = (endpoint: string) => (URL.canParse(endpoint) ? new URL(endpoint).host : 'a push service');

/**
 * Sends a notification: kept an hour by the push service if the phone is offline, delivered at once otherwise.
 * `subject` (an https or mailto: address) tells push services who sends. `send` is for tests.
 */
export function webPushSender(keys: () => Promise<VapidKeys>, subject: string, send: Send = webpush.sendNotification): PushSender {
  return {
    publicKey: async () => (await keys()).publicKey,
    async send(subscription: PushSubscription, payload: string): Promise<PushResult> {
      const {publicKey, privateKey} = await keys();
      try {
        await send({endpoint: subscription.endpoint, keys: subscription.keys}, payload, {
          TTL: 3600, urgency: 'high', vapidDetails: {subject, publicKey, privateKey},
        });
        return 'sent';
      } catch (error) {
        const status = (error as {statusCode?: unknown}).statusCode;
        if (status === 404 || status === 410) return 'gone';
        // Only the push service's host and the status: never keys, payloads or the request the error carries.
        console.error(`web push to ${hostOf(subscription.endpoint)} failed (${typeof status === 'number' ? status : 'no answer'})`);
        return 'failed';
      }
    },
  };
}
