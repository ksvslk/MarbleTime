/** Web Push for parents: browsers that want notifications, and a notification when a kid says "I did it!". */
import type {Deps} from './deps';
import {newDeviceToken, sha256Hex} from './secrets';
import {DAY} from './time';
import type {Claim, Family, Lang, Parent, PushSubscription} from './types';

/** What the push service answered: "gone" means the browser unsubscribed (404/410) and the subscription can go. */
export type PushResult = 'sent' | 'gone' | 'failed';

export interface PushSender {
  /** The VAPID public key browsers subscribe with (base64url). */
  publicKey(): Promise<string>;
  send(subscription: PushSubscription, payload: string): Promise<PushResult>;
}

/** What a yes would give, said shortly: what the kid's card showed (the claim's promise), else the job's minutes. */
function gives(lang: Lang, claim: Pick<Claim, 'minutes' | 'promised'>): string {
  const {reward, minutes} = claim.promised ?? {reward: 'marbles' as const, minutes: claim.minutes};
  const min = {en: 'min', et: 'min', de: 'Min.', es: 'min'}[lang];
  const character = {en: 'a new character', et: 'uus tegelane', de: 'eine neue Figur', es: 'un personaje nuevo'}[lang];
  const thanks = {en: 'a thank-you', et: 'aitäh', de: 'ein Dankeschön', es: 'un gracias'}[lang];
  if (reward === 'praise') return thanks;
  if (reward === 'character') return minutes > 0 ? `+${minutes} ${min} + ${character}` : character;
  return `+${minutes} ${min}`;
}

/**
 * The notification for a new claim, in the family language: who did what, what a yes gives, and the two answers a
 * grown-up can give right on the notification.
 */
export function claimNotice(lang: Lang, child: string, claim: Pick<Claim, 'choreTitle' | 'minutes' | 'promised'>): {title: string; body: string; actions: {action: 'yes' | 'not_yet'; title: string}[]} {
  const done = {en: 'is done', et: '– tehtud', de: '– erledigt', es: '– hecho'}[lang];
  const yes = {en: 'Yes', et: 'Jah', de: 'Ja', es: 'Sí'}[lang];
  const notYet = {en: 'Not yet', et: 'Veel mitte', de: 'Noch nicht', es: 'Todavía no'}[lang];
  return {
    title: `${child}: ${claim.choreTitle} ${done}`,
    body: gives(lang, claim),
    actions: [{action: 'yes', title: yes}, {action: 'not_yet', title: notYet}],
  };
}

/** How long a notification's answers work; after that the grown-up opens the app. */
const PASS_MS = DAY;

export async function subscribe(deps: Deps, family: Family, parent: Parent, input: Pick<PushSubscription, 'endpoint' | 'keys'>) {
  await deps.repo.putPushSubscription(family.id, {endpoint: input.endpoint, keys: input.keys, sub: parent.sub, createdAt: deps.now()});
}

export async function unsubscribe(deps: Deps, family: Family, endpoint: string) {
  await deps.repo.deletePushSubscription(family.id, endpoint);
}

/**
 * Tells every subscribed browser of the family's parents about a new claim. Best-effort, after the claim is stored:
 * a failure is logged and never fails the claim. Subscriptions the push service reports gone are deleted.
 */
export async function pushNewClaim(deps: Deps, family: Family, claim: Claim, childName: string): Promise<void> {
  try {
    const subscriptions = await deps.repo.pushSubscriptions(family.id);
    if (!subscriptions.length) return;
    const notice = claimNotice(family.lang, childName, claim);
    await Promise.all(subscriptions.map(async subscription => {
      // Each browser gets its own single-use pass, so "Yes" on the notification is that parent's yes (claims.ts
      // decideWithPass). The message is encrypted to the browser, so the pass travels safely.
      const token = newDeviceToken();
      await deps.repo.putPushPass(sha256Hex(token), {familyId: family.id, claimId: claim.id, sub: subscription.sub, expiresAt: deps.now() + PASS_MS});
      // A tap on the notification itself opens the page where jobs are approved.
      const payload = JSON.stringify({...notice, data: {url: '/', claimId: claim.id, token}});
      if ((await deps.push.send(subscription, payload)) === 'gone') await deps.repo.deletePushSubscription(family.id, subscription.endpoint);
    }));
  } catch (error) {
    console.error('notifying parents of a claim failed:', error);
  }
}
