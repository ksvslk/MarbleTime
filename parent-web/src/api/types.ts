/**
 * Names for the API's types. All of them come from src/api/schema.ts, which `npm run gen:api` generates from
 * backend/openapi.yaml (the contract), so they can't drift apart without a test failing (schema.test.ts).
 * The API says child/chore/parent; the screens say kid/job/grown-up.
 */
import type {components, paths} from './schema';

type Schemas = components['schemas'];

export type ApiErrorBody = Schemas['Error'];
export type Lang = Schemas['Lang'];
export type Color = Schemas['Color'];
export type Avatar = Schemas['Avatar'];
export type Platform = Schemas['Platform'];
export type DeviceMode = Schemas['DeviceMode'];
export type ClaimStatus = Schemas['ClaimStatus'];
export type JobIcon = Schemas['JobIcon'];

export type Me = Schemas['Me'];
export type Family = Schemas['Family'];
export type FamilyCreate = Schemas['FamilyCreate'];
export type FamilyPatch = Schemas['FamilyPatch'];
export type FamilyBundle = Schemas['FamilyBundle'];
export type Child = Schemas['Child'];
export type ChildInput = Schemas['ChildInput'];
export type ChildPatch = Schemas['ChildPatch'];
export type Repeat = Schemas['Repeat'];
export type Chore = Schemas['Chore'];
export type ChoreInput = Schemas['ChoreInput'];
export type ChorePatch = Schemas['ChorePatch'];
export type Claim = Schemas['Claim'];
/** What an approval gave: marbles in the jar, a new character (the jar was full), or praise (a routine job). */
export type Reward = NonNullable<Claim['reward']>;
export type LedgerEntry = Schemas['LedgerEntry'];
export type Balance = Schemas['Balance'];
export type Handoff = Schemas['Handoff'];
export type Device = Schemas['Device'];
export type Character = Schemas['Character'];
export type CharacterStatus = Character['status'];

/** The JSON body of an operation whose request schema is written inline in the contract. */
type JsonBody<Op> = Op extends {requestBody?: {content: {'application/json': infer B}}} ? B : never;

export type MePatch = JsonBody<paths['/me']['patch']>;
export type AdjustInput = JsonBody<paths['/children/{childId}/adjust']['post']>;
export type HandoffMark = JsonBody<paths['/children/{childId}/handoff']['post']>;
export type CharacterInput = JsonBody<paths['/children/{childId}/characters']['post']>;
export type PairingConfirm = JsonBody<paths['/pairings/{code}/confirm']['post']>;
export type DevicePatch = JsonBody<paths['/devices/{deviceId}']['patch']>;
export type PushSubscriptionInput = JsonBody<paths['/push/subscriptions']['post']>;
export type PushUnsubscribe = JsonBody<paths['/push/subscriptions']['delete']>;

export {avatarValues, colorValues, deviceModeValues, jobIconValues, langValues} from './schema';
