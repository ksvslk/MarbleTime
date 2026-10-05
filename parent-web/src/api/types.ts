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
export type Topic = Schemas['Topic'];
export type Platform = Schemas['Platform'];
export type DeviceMode = Schemas['DeviceMode'];
export type ClaimStatus = Schemas['ClaimStatus'];
export type JobIcon = Schemas['JobIcon'];

export type Me = Schemas['Me'];
export type Family = Schemas['Family'];
export type FamilyCreate = Schemas['FamilyCreate'];
export type FamilyPatch = Schemas['FamilyPatch'];
export type FamilyBundle = Schemas['FamilyBundle'];
export type GameSettings = Schemas['GameSettings'];
export type Child = Schemas['Child'];
export type ChildInput = Schemas['ChildInput'];
export type ChildPatch = Schemas['ChildPatch'];
export type Repeat = Schemas['Repeat'];
export type Chore = Schemas['Chore'];
export type ChoreInput = Schemas['ChoreInput'];
export type ChorePatch = Schemas['ChorePatch'];
export type Claim = Schemas['Claim'];
export type LedgerEntry = Schemas['LedgerEntry'];
export type Balance = Schemas['Balance'];
export type Handoff = Schemas['Handoff'];
export type Device = Schemas['Device'];

/** The JSON body of an operation whose request schema is written inline in the contract. */
type JsonBody<Op> = Op extends {requestBody?: {content: {'application/json': infer B}}} ? B : never;

export type AdjustInput = JsonBody<paths['/children/{childId}/adjust']['post']>;
export type HandoffMark = JsonBody<paths['/children/{childId}/handoff']['post']>;
export type PairingConfirm = JsonBody<paths['/pairings/{code}/confirm']['post']>;
export type DevicePatch = JsonBody<paths['/devices/{deviceId}']['patch']>;

export {avatarValues, colorValues, deviceModeValues, jobIconValues, langValues, topicValues} from './schema';
