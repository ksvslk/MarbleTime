/** Web Push for parents: browsers that want notifications, and a notification when a kid says "I did it!". */
import type {Deps} from './deps';
import type {Claim, Family, Lang, Parent, PushSubscription} from './types';

/** What the push service answered: "gone" means the browser unsubscribed (404/410) and the subscription can go. */
export type PushResult = 'sent' | 'gone' | 'failed';

export interface PushSender {
  /** The VAPID public key browsers subscribe with (base64url). */
  publicKey(): Promise<string>;
  send(subscription: PushSubscription, payload: string): Promise<PushResult>;
}

/** The notification for a new claim, in the family language. */
export function claimNotice(lang: Lang, child: string, job: string, minutes: number): {title: string; body: string} {
  switch (lang) {
    case 'et':
      return {title: `${child}: ${job} – tehtud`, body: `+${minutes} min · puuduta, et vastata`};
    case 'de':
      return {title: `${child}: ${job} – erledigt`, body: `+${minutes} Min. · tippen zum Antworten`};
    case 'es':
      return {title: `${child}: ${job} – hecho`, body: `+${minutes} min · toca para responder`};
    case 'en':
      return {title: `${child}: ${job} is done`, body: `+${minutes} min · tap to answer`};
  }
}

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
    const payload = JSON.stringify({...claimNotice(family.lang, childName, claim.choreTitle, claim.minutes), data: {url: '/', claimId: claim.id}});
    await Promise.all(subscriptions.map(async subscription => {
      if ((await deps.push.send(subscription, payload)) === 'gone') await deps.repo.deletePushSubscription(family.id, subscription.endpoint);
    }));
  } catch (error) {
    console.error('notifying parents of a claim failed:', error);
  }
}
