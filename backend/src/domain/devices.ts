/** TVs: pairing by QR code (docs/03 §4.3), device tokens, the state the TV polls, heartbeats. */
import {recentClaims} from './claims';
import type {Deps} from './deps';
import {ApiError, busy, conflict, notFound} from './errors';
import {newDeviceToken, newId, newPairingCode, sha256Hex} from './secrets';
import {localDay, MINUTE} from './time';
import type {Device, Family, Pairing} from './types';
import type {ConfirmInput, DevicePatch} from './validate';
import {byCreated, childView, choreView, claimView, deviceView} from './views';

const PAIRING_TIME = 10 * MINUTE;
/** Ordinary requests write `lastSeen` at most this often (the TV polls every few seconds); heartbeats always do. */
const LAST_SEEN_EVERY = MINUTE;

/** A TV asks to be paired. The short-lived code is the only secret; its QR code links to the parent app. */
export async function startPairing(deps: Deps, platform: Pairing['platform']) {
  const now = deps.now();
  for (let attempt = 0; attempt < 5; attempt++) {
    const pairing: Pairing = {code: newPairingCode(), platform, status: 'waiting', createdAt: now, expiresAt: now + PAIRING_TIME};
    if (await deps.repo.createPairing(pairing)) {
      return {code: pairing.code, expiresAt: pairing.expiresAt, pairUrl: `${deps.pwaUrl}/pair/${pairing.code}`};
    }
  }
  throw busy();
}

type PairingStatus = {status: 'waiting' | 'expired'} | {status: 'paired'; deviceId: string; deviceToken?: string};

/**
 * The TV polls until a parent confirms. The first poll after that gets the device token: it is made right then
 * and only its hash is stored, so no copy of it exists anywhere else. Later polls say "paired" without a token.
 */
export async function pollPairing(deps: Deps, code: string): Promise<PairingStatus> {
  const pairing = await deps.repo.getPairing(code);
  if (!pairing) throw notFound('pairing code');
  if (pairing.status === 'waiting') return {status: deps.now() > pairing.expiresAt ? 'expired' : 'waiting'};
  const {deviceId} = pairing;
  if (pairing.tokenIssued) return {status: 'paired', deviceId};
  const token = newDeviceToken();
  if (await deps.repo.issueToken(code, pairing.familyId, deviceId, sha256Hex(token))) return {status: 'paired', deviceId, deviceToken: token};
  // Another poll got the token first, or the parent removed the TV before it got one (then the TV starts over).
  const now = await deps.repo.getPairing(code);
  return now?.status === 'paired' && now.tokenIssued ? {status: 'paired', deviceId} : {status: 'expired'};
}

/** The parent scanned the code and named the TV. Confirming again from the same family returns the same TV. */
export async function confirmPairing(deps: Deps, family: Family, code: string, input: ConfirmInput) {
  const pairing = await deps.repo.getPairing(code);
  if (!pairing) throw notFound('pairing code');
  if (pairing.status === 'waiting') {
    const now = deps.now();
    if (now > pairing.expiresAt) throw new ApiError(410, 'expired', 'This code has expired; the TV shows a new one');
    const device: Device = {
      id: newId(), familyId: family.id, name: input.name, platform: pairing.platform, mode: input.mode ?? 'amazon_kids', createdAt: now,
    };
    if (await deps.repo.confirmPairing(code, device, now)) return {created: true, device: deviceView(device)};
  }
  // Paired already (maybe a moment ago, by a second tap), or it just expired.
  const now = await deps.repo.getPairing(code);
  if (now?.status !== 'paired') throw new ApiError(410, 'expired', 'This code has expired; the TV shows a new one');
  const device = now.familyId === family.id ? await deps.repo.getDevice(family.id, now.deviceId) : undefined;
  if (!device) throw conflict('already_paired', 'This code was already used');
  return {created: false, device: deviceView(device)};
}

export async function listDevices(deps: Deps, family: Family) {
  return {devices: (await deps.repo.listDevices(family.id)).sort(byCreated).map(deviceView)};
}

export async function patchDevice(deps: Deps, family: Family, deviceId: string, input: DevicePatch) {
  const device = await deps.repo.updateDevice(family.id, deviceId, input);
  if (!device) throw notFound('TV');
  return deviceView(device);
}

/** Unpairs a TV: its token stops working. */
export async function removeDevice(deps: Deps, family: Family, deviceId: string) {
  await deps.repo.deleteDevice(family.id, deviceId);
}

/** `Authorization: Device <token>` → the TV and its family, or 401. Notes when the TV was last seen. */
export async function authenticateDevice(deps: Deps, authorization: string | undefined): Promise<{device: Device; family: Family}> {
  const token = /^Device\s+(\S+)$/i.exec(authorization ?? '')?.[1];
  if (!token) throw new ApiError(401, 'unauthorized', 'Send "Authorization: Device <token>" (the token comes from pairing)');
  const device = await deps.repo.deviceByToken(sha256Hex(token));
  const family = device && (await deps.repo.getFamily(device.familyId));
  if (!device || !family) throw new ApiError(401, 'unpaired', 'This TV is not paired; pair it again');
  const now = deps.now();
  if (device.lastSeen === undefined || now - device.lastSeen >= LAST_SEEN_EVERY) {
    await deps.repo.updateDevice(family.id, device.id, {lastSeen: now});
  }
  return {device, family};
}

export async function heartbeat(deps: Deps, family: Family, device: Device, appVersion: string | undefined) {
  await deps.repo.updateDevice(family.id, device.id, {lastSeen: deps.now(), ...(appVersion !== undefined && {appVersion})});
}

/**
 * Everything the TV shows (DeviceState). The ETag covers everything except `serverTime`, which changes on every
 * call: an unchanged board answers If-None-Match with 304.
 */
export async function deviceState(deps: Deps, family: Family) {
  const now = deps.now();
  const today = localDay(now, family.timezone);
  const [children, chores, claims] = await Promise.all([
    deps.repo.listChildren(family.id), deps.repo.listChores(family.id), recentClaims(deps, family.id, now),
  ]);
  children.sort(byCreated);
  const state = {
    family: {
      id: family.id, name: family.name, lang: family.lang, caps: family.caps, voice: family.voice,
      pin: family.pin && {salt: family.pin.salt, hash: family.pin.hash},
    },
    children: children.map(childView),
    chores: chores.filter(k => k.childIds.length > 0).sort(byCreated).map(choreView),
    claims: claims.map(claimView),
    gameMarblesToday: Object.fromEntries(children.map(c => [c.id, c.gameDay === today ? (c.gameMarbles ?? 0) : 0])),
    today,
  };
  return {etag: `"${sha256Hex(JSON.stringify(state)).slice(0, 32)}"`, body: {...state, serverTime: now}};
}
