/** Every route in openapi.yaml, with who may call it. infra/stack.ts creates the same routes in API Gateway. */
import {characterArt, createCharacter, listCharacters, removeCharacter} from '../domain/characters';
import {claimChore, decide, decideOnTv, listClaims, takeBack} from '../domain/claims';
import {authenticateDevice, confirmPairing, deviceState, heartbeat, listDevices, patchDevice, pollPairing, removeDevice, startPairing} from '../domain/devices';
import {ApiError} from '../domain/errors';
import {
  addChild, addChore, changeSettingsOnTv, createFamily, familyBundle, me, patchChild, patchChore, patchFamily, patchMe, removeChild, removeChore,
  requireFamily,
} from '../domain/family';
import {adjust, handoff, history, settleHandoff} from '../domain/ledger';
import {subscribe, unsubscribe} from '../domain/push';
import {speak, speechToText} from '../domain/speech';
import type {Device, Family, Parent} from '../domain/types';
import * as check from '../domain/validate';
import {type Context, type HttpResponse, json, noContent, type Route} from './router';

type ParentContext = Context & {parent: Parent};
type FamilyContext = ParentContext & {family: Family};
type DeviceContext = Context & {device: Device; family: Family};
type Handler<C> = (ctx: C) => Promise<HttpResponse>;

const open = (method: Route['method'], path: string, handle: Handler<Context>): Route => ({method, path, auth: 'none', handle});

const parent = (method: Route['method'], path: string, handle: Handler<ParentContext>, raw = false): Route => ({
  method, path, auth: 'parent', ...(raw && {raw}),
  handle: async ctx => {
    if (!ctx.req.parent) throw new ApiError(401, 'unauthorized', 'Sign in first');
    return handle({...ctx, parent: ctx.req.parent});
  },
});

/** A parent route that needs the parent's family (404 no_family before onboarding). */
const family = (method: Route['method'], path: string, handle: Handler<FamilyContext>, raw = false): Route =>
  parent(method, path, async ctx => handle({...ctx, family: await requireFamily(ctx.deps, ctx.parent)}), raw);

const device = (method: Route['method'], path: string, handle: Handler<DeviceContext>): Route => ({
  method, path, auth: 'device',
  handle: async ctx => handle({...ctx, ...(await authenticateDevice(ctx.deps, ctx.req.headers.authorization))}),
});

/** If-None-Match may list several tags, weak ones (W/"…") or "*". */
const etagMatches = (header: string | undefined, etag: string) =>
  header !== undefined && header.split(',').some(tag => ['*', etag].includes(tag.trim().replace(/^W\//, '')));

/** A ready character's art never changes: the TV may keep it for good. */
const FOREVER = {'cache-control': 'private, max-age=31536000, immutable'};

// GET /me stays first: API Gateway's Lambda integration is named after the first route that uses it (infra/stack.ts).
export const routes: Route[] = [
  // Parent: family
  parent('GET', '/me', async ({deps, parent}) => json(200, await me(deps, parent))),
  parent('PATCH', '/me', async ({deps, parent, body}) => json(200, await patchMe(deps, parent, check.meInput(body, 'body')))),
  parent('POST', '/family', async ({deps, parent, body}) => json(201, await createFamily(deps, parent, check.familyCreate(body, 'body')))),
  family('GET', '/family', async ({deps, family}) => json(200, await familyBundle(deps, family))),
  family('PATCH', '/family', async ({deps, family, body}) => json(200, await patchFamily(deps, family, check.familyPatch(body, 'body')))),

  // Parent: children
  family('POST', '/children', async ({deps, family, body}) => json(201, await addChild(deps, family, check.childInput(body, 'body')))),
  family('PATCH', '/children/{childId}', async ({deps, family, params, body}) =>
    json(200, await patchChild(deps, family, params.childId, check.childPatch(body, 'body')))),
  family('DELETE', '/children/{childId}', async ({deps, family, params}) => {
    await removeChild(deps, family, params.childId);
    return noContent();
  }),
  family('POST', '/children/{childId}/adjust', async ({deps, parent, family, params, body}) =>
    json(200, await adjust(deps, family, parent, params.childId, check.adjustInput(body, 'body')))),
  family('GET', '/children/{childId}/ledger', async ({deps, family, params, req}) =>
    json(200, await history(deps, family, params.childId, check.ledgerLimit(req.query.limit)))),
  family('GET', '/children/{childId}/characters', async ({deps, family, params}) => json(200, await listCharacters(deps, family, params.childId))),
  family('POST', '/children/{childId}/characters', async ({deps, family, params, body}) =>
    json(202, await createCharacter(deps, family, params.childId, check.characterInput(body, 'body')))),
  family('DELETE', '/children/{childId}/characters/{characterId}', async ({deps, family, params}) => {
    await removeCharacter(deps, family, params.childId, params.characterId);
    return noContent();
  }),
  family('POST', '/speech-to-text', async ({deps, family, raw}) => json(200, await speechToText(deps, family, raw)), true),
  family('GET', '/children/{childId}/handoff', async ({deps, family, params}) => json(200, await handoff(deps, family, params.childId))),
  family('POST', '/children/{childId}/handoff', async ({deps, family, params, body}) =>
    json(200, await settleHandoff(deps, family, params.childId, check.handoffInput(body, 'body')))),

  // Parent: chores
  family('POST', '/chores', async ({deps, family, body}) => json(201, await addChore(deps, family, check.choreInput(body, 'body')))),
  family('PATCH', '/chores/{choreId}', async ({deps, family, params, body}) =>
    json(200, await patchChore(deps, family, params.choreId, check.chorePatch(body, 'body')))),
  family('DELETE', '/chores/{choreId}', async ({deps, family, params}) => {
    await removeChore(deps, family, params.choreId);
    return noContent();
  }),

  // Parent: claims
  family('GET', '/claims', async ({deps, family, req}) => {
    const status = req.query.status === undefined ? undefined : check.claimStatus(req.query.status, 'status');
    return json(200, await listClaims(deps, family, status));
  }),
  family('POST', '/claims/{claimId}/approve', async ({deps, parent, family, params}) =>
    json(200, await decide(deps, family, params.claimId, true, {by: 'parent', sub: parent.sub}))),
  family('POST', '/claims/{claimId}/reject', async ({deps, parent, family, params}) =>
    json(200, await decide(deps, family, params.claimId, false, {by: 'parent', sub: parent.sub}))),

  // Parent: notifications
  open('GET', '/push/key', async ({deps}) => json(200, {publicKey: await deps.push.publicKey()})),
  family('POST', '/push/subscriptions', async ({deps, parent, family, body}) => {
    await subscribe(deps, family, parent, check.pushSubscriptionInput(body, 'body'));
    return {status: 201};
  }),
  family('DELETE', '/push/subscriptions', async ({deps, family, body}) => {
    await unsubscribe(deps, family, check.pushEndpointInput(body, 'body').endpoint);
    return noContent();
  }),

  // Parent: devices and pairing
  family('POST', '/pairings/{code}/confirm', async ({deps, family, params, body}) => {
    const {created, device} = await confirmPairing(deps, family, check.pairingCode(params.code), check.confirmInput(body, 'body'));
    return json(created ? 201 : 200, device);
  }),
  family('GET', '/devices', async ({deps, family}) => json(200, await listDevices(deps, family))),
  family('PATCH', '/devices/{deviceId}', async ({deps, family, params, body}) =>
    json(200, await patchDevice(deps, family, params.deviceId, check.devicePatch(body, 'body')))),
  family('DELETE', '/devices/{deviceId}', async ({deps, family, params}) => {
    await removeDevice(deps, family, params.deviceId);
    return noContent();
  }),

  // TV: pairing (no auth: the short-lived code is the secret)
  open('POST', '/pairings', async ({deps, body}) => json(201, await startPairing(deps, check.pairingInput(body, 'body').platform))),
  open('GET', '/pairings/{code}', async ({deps, params}) => json(200, await pollPairing(deps, check.pairingCode(params.code)))),

  // TV (device token)
  device('GET', '/device/state', async ({deps, family, device, req}) => {
    const {etag, body} = await deviceState(deps, family, device);
    return etagMatches(req.headers['if-none-match'], etag) ? {status: 304, headers: {etag}} : json(200, body, {etag});
  }),
  device('POST', '/device/claims', async ({deps, family, body}) => {
    const {created, claim} = await claimChore(deps, family, check.claimInput(body, 'body'));
    return json(created ? 201 : 200, claim);
  }),
  device('DELETE', '/device/claims/{claimId}', async ({deps, family, params}) => {
    await takeBack(deps, family, params.claimId);
    return noContent();
  }),
  device('POST', '/device/claims/{claimId}/decide', async ({deps, family, device, params, body}) =>
    json(200, await decideOnTv(deps, family, device, params.claimId, check.decideInput(body, 'body')))),
  device('GET', '/device/characters/{characterId}', async ({deps, family, params}) =>
    json(200, await characterArt(deps, family, params.characterId), FOREVER)),
  device('POST', '/device/speech', async ({deps, family, device, body}) => json(200, await speak(deps, family, device, check.speechInput(body, 'body')))),
  device('POST', '/device/settings', async ({deps, family, device, body}) =>
    json(200, await changeSettingsOnTv(deps, family, device, check.tvSettingsInput(body, 'body')))),
  device('POST', '/device/heartbeat', async ({deps, family, device, body}) => {
    await heartbeat(deps, family, device, body === undefined ? undefined : check.heartbeatInput(body, 'body').appVersion);
    return noContent();
  }),
];
