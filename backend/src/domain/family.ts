/** Parent side: the family, its kids and its jobs. */
import type {Deps} from './deps';
import {ApiError, busy, conflict, invalid, notFound} from './errors';
import {hashPin, newId} from './secrets';
import {type Chore, type Child, type Color, DAILY_BASE_MIN, type Family, type GameSettings, type Parent, type Topic} from './types';
import type {ChildInput, ChildPatch, ChoreInput, ChorePatch, FamilyCreate, FamilyPatch} from './validate';
import {byCreated, childView, choreView, deviceView, familyView} from './views';

/** Default daily cap on game marbles (4 = 20 min), so real-life jobs stay the main way to earn (docs/03 §11). */
const DAILY_GAME_MARBLES = 4;

/** Card colours for new jobs, in turn, so neighbouring cards differ. Gold stays for time and the main button (docs/03 §12). */
const CARD_COLORS: Color[] = ['peach', 'mint', 'sky', 'lilac'];

export async function me(deps: Deps, parent: Parent) {
  const family = await findFamily(deps, parent);
  return {
    parent: {id: parent.sub, ...(parent.email !== undefined && {email: parent.email})},
    family: family ? familyView(family) : null,
  };
}

async function findFamily(deps: Deps, parent: Parent): Promise<Family | undefined> {
  const familyId = await deps.repo.familyIdOf(parent.sub);
  return familyId === undefined ? undefined : deps.repo.getFamily(familyId);
}

export async function requireFamily(deps: Deps, parent: Parent): Promise<Family> {
  const family = await findFamily(deps, parent);
  if (!family) throw new ApiError(404, 'no_family', 'Create the family first (POST /family)');
  return family;
}

export async function createFamily(deps: Deps, parent: Parent, input: FamilyCreate) {
  if (await deps.repo.familyIdOf(parent.sub)) throw conflict('family_exists', 'You already have a family');
  const family: Family = {
    id: newId(), name: input.name, lang: input.lang, timezone: input.timezone, caps: false, voice: true, pin: hashPin(input.pin), createdAt: deps.now(),
  };
  await deps.repo.createFamily(family, parent);
  return familyView(family);
}

export async function familyBundle(deps: Deps, family: Family) {
  const [children, chores, devices] = await Promise.all([
    deps.repo.listChildren(family.id), deps.repo.listChores(family.id), deps.repo.listDevices(family.id),
  ]);
  return {
    family: familyView(family),
    children: children.sort(byCreated).map(childView),
    chores: chores.sort(byCreated).map(choreView),
    devices: devices.sort(byCreated).map(deviceView),
  };
}

export async function patchFamily(deps: Deps, family: Family, input: FamilyPatch) {
  const {pin, ...fields} = input;
  const next: Family = {...family, ...fields, ...(pin !== undefined && {pin: hashPin(pin)})};
  await deps.repo.putFamily(next);
  return familyView(next);
}

/** Without a choice from the parent: the built-in question bank has word games only for ages 7 and up. */
const defaultGames = (age: number): GameSettings => ({
  topics: age <= 6 ? ['numbers', 'puzzles'] : ['numbers', 'words', 'puzzles'],
  dailyCapMarbles: DAILY_GAME_MARBLES,
});

const gameSettings = (games: {topics: Topic[]; dailyCapMarbles?: number}): GameSettings => ({
  topics: games.topics,
  dailyCapMarbles: games.dailyCapMarbles ?? DAILY_GAME_MARBLES,
});

export async function addChild(deps: Deps, family: Family, input: ChildInput) {
  const child: Child = {
    id: newId(), name: input.name, avatar: input.avatar, color: input.color, age: input.age,
    dailyBaseMin: input.dailyBaseMin ?? DAILY_BASE_MIN,
    games: input.games ? gameSettings(input.games) : defaultGames(input.age),
    createdAt: deps.now(), balanceSec: 0, debtSec: 0,
  };
  await deps.repo.putChild(family.id, child);
  return childView(child);
}

export async function patchChild(deps: Deps, family: Family, childId: string, input: ChildPatch) {
  const {games, ...profile} = input;
  const child = await deps.repo.updateChildProfile(family.id, childId, {...profile, ...(games && {games: gameSettings(games)})});
  if (!child) throw notFound('child');
  return childView(child);
}

/** Removes a kid and everything about them. Their jobs lose them; a job left with no kids goes too. */
export async function removeChild(deps: Deps, family: Family, childId: string) {
  for (const chore of await deps.repo.listChores(family.id)) {
    if (chore.childIds.includes(childId)) await changeChore(deps, family.id, chore.id, k => withoutChild(k, childId));
  }
  await deps.repo.deleteChild(family.id, childId);
}

/** The job without one kid; null when nobody is left on it. */
export function withoutChild(chore: Chore, childId: string): Chore | null {
  const childIds = chore.childIds.filter(id => id !== childId);
  return childIds.length ? {...chore, childIds} : null;
}

/** A newer `updatedAt` than the job's, even within the same millisecond. */
export const bumped = (deps: Deps, chore: Chore) => Math.max(deps.now(), chore.updatedAt + 1);

/** Reads, changes and writes a job, again if someone wrote it meanwhile. `null` from `change` deletes it. */
async function changeChore(deps: Deps, familyId: string, choreId: string, change: (chore: Chore) => Chore | null) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const chore = await deps.repo.getChore(familyId, choreId);
    if (!chore) return undefined;
    const next = change(chore);
    if (next === null) {
      if (await deps.repo.deleteChore(familyId, choreId, chore.updatedAt)) return null;
    } else {
      const written = {...next, updatedAt: bumped(deps, chore)};
      if (await deps.repo.putChore(familyId, written, chore.updatedAt)) return written;
    }
  }
  throw busy();
}

async function checkChildren(deps: Deps, familyId: string, childIds: string[]) {
  const known = new Set((await deps.repo.listChildren(familyId)).map(c => c.id));
  const unknown = childIds.find(id => !known.has(id));
  if (unknown !== undefined) throw invalid(`childIds: there is no child ${unknown} in this family`);
}

export async function addChore(deps: Deps, family: Family, input: ChoreInput) {
  const childIds = [...new Set(input.childIds)];
  await checkChildren(deps, family.id, childIds);
  const count = (await deps.repo.listChores(family.id)).length;
  const now = deps.now();
  const chore: Chore = {
    id: newId(),
    title: input.title,
    icon: input.icon ?? (await deps.pickIcon(input.title)),
    color: input.color ?? CARD_COLORS[count % CARD_COLORS.length],
    minutes: input.minutes,
    repeat: input.repeat ?? {kind: 'daily'},
    childIds,
    createdAt: now,
    updatedAt: now,
  };
  await deps.repo.putChore(family.id, chore);
  return choreView(chore);
}

/** Changes only what's given. The icon stays as it is when only the title changes (the parent may have picked it). */
export async function patchChore(deps: Deps, family: Family, choreId: string, input: ChorePatch) {
  const childIds = input.childIds && [...new Set(input.childIds)];
  if (childIds) await checkChildren(deps, family.id, childIds);
  const chore = await changeChore(deps, family.id, choreId, k => ({...k, ...input, ...(childIds && {childIds})}));
  if (!chore) throw notFound('job');
  return choreView(chore);
}

/** Its claims and ledger entries stay (they carry the title and minutes). */
export async function removeChore(deps: Deps, family: Family, choreId: string) {
  await deps.repo.deleteChore(family.id, choreId);
}
