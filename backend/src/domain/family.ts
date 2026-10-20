/** Parent side: the parent's name, the family, its kids and its jobs. */
import {budgetOf, changedBudget} from './budget';
import type {Deps} from './deps';
import {ApiError, busy, conflict, invalid, notFound} from './errors';
import {currentChildren, settleDue} from './ledger';
import {checkTvPin} from './pin';
import {wantNextSession} from './puzzle-results';
import {hashPin, newId} from './secrets';
import type {Chore, Child, Color, Device, Family, Parent} from './types';
import type {ChildInput, ChildPatch, ChoreInput, ChorePatch, FamilyCreate, FamilyPatch, MeInput, TvSettingsInput} from './validate';
import {byCreated, childView, choreView, deviceView, familyView} from './views';

/** Card colours for new jobs, in turn, so neighbouring cards differ. Gold stays for time and the main button (docs/03 §12). */
const CARD_COLORS: Color[] = ['peach', 'mint', 'sky', 'lilac'];

export async function me(deps: Deps, parent: Parent) {
  const [family, name] = await Promise.all([findFamily(deps, parent), deps.repo.getParentName(parent.sub)]);
  return {
    parent: {id: parent.sub, ...(parent.email !== undefined && {email: parent.email}), ...(name !== undefined && {name})},
    family: family ? familyView(family) : null,
  };
}

/** The parent's name as kids see it when this parent approves a job ("– Dad"). Works before onboarding too. */
export async function patchMe(deps: Deps, parent: Parent, input: MeInput) {
  const [familyId, before] = await Promise.all([deps.repo.familyIdOf(parent.sub), deps.repo.getParentName(parent.sub)]);
  if (input.name !== before) {
    await deps.repo.setParentName(parent.sub, input.name);
    if (familyId !== undefined) deps.changed(familyId);
  }
  return me(deps, parent);
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
  const [children, chores, devices] = await Promise.all([currentChildren(deps, family), deps.repo.listChores(family.id), deps.repo.listDevices(family.id)]);
  return {
    family: familyView(family),
    children: children.sort(byCreated).map(childView),
    chores: chores.sort(byCreated).map(choreView),
    devices: devices.sort(byCreated).map(deviceView),
  };
}

/** Changes only the given fields, so changes made at once on a TV and in the parent app don't undo each other. */
export async function patchFamily(deps: Deps, family: Family, input: FamilyPatch) {
  const {pin, ...fields} = input;
  const next = await deps.repo.updateFamily(family.id, {...fields, ...(pin !== undefined && {pin: hashPin(pin)})});
  if (!next) throw notFound('family');
  deps.changed(family.id);
  return familyView(next);
}

/**
 * A grown-up changes language, CAPITAL LETTERS or read-aloud on the TV, with the family PIN (pin.ts: the same
 * per-TV wrong-PIN limit as decisions). It's the family's setting: other TVs get a new ETag, the parent app sees it
 * on its next load, and the last change wins wherever it was made.
 */
export async function changeSettingsOnTv(deps: Deps, family: Family, device: Device, input: TvSettingsInput) {
  const {pin, ...settings} = input;
  await checkTvPin(deps, family, device, pin);
  return patchFamily(deps, family, settings);
}

/**
 * A new kid. The daily budget defaults by age (60 minutes under 7, 90 from 7; the base half of it) and is clamped to
 * the rules (budget.ts): never above the age's ceiling, the base never above the maximum.
 */
export async function addChild(deps: Deps, family: Family, input: ChildInput) {
  const child: Child = {
    id: newId(), name: input.name, avatar: input.avatar, color: input.color, age: input.age,
    ...changedBudget(undefined, input.age, input),
    characterTokens: 0, createdAt: deps.now(), balanceSec: 0, debtSec: 0, ...(input.puzzles === false && {puzzlesOff: true}),
    ...(input.puzzleLevel && {puzzleLevel: input.puzzleLevel}),
  };
  await deps.repo.putChild(family.id, child);
  deps.changed(family.id);
  return childView(child);
}

/**
 * Changes only what's given; a new age or maximum clamps the budget (budget.ts changedBudget). A new puzzle level
 * counts from the kid's next session: one already written for them at the old level is dropped and a new one started.
 */
export async function patchChild(deps: Deps, family: Family, childId: string, input: ChildPatch) {
  const {dailyMaxMin, dailyBaseMin, puzzles, ...rest} = input;
  const profile = {...rest, ...(puzzles !== undefined && {puzzlesOff: !puzzles})};
  let budget = {};
  let levelChanged = false;
  if (input.age !== undefined || dailyMaxMin !== undefined || dailyBaseMin !== undefined || input.puzzleLevel !== undefined) {
    const current = await deps.repo.getChild(family.id, childId);
    if (!current) throw notFound('child');
    if (input.age !== undefined || dailyMaxMin !== undefined || dailyBaseMin !== undefined) budget = changedBudget(budgetOf(current), input.age ?? current.age, {dailyMaxMin, dailyBaseMin});
    levelChanged = input.puzzleLevel !== undefined && input.puzzleLevel !== (current.puzzleLevel ?? 0);
  }
  const updated = await deps.repo.updateChildProfile(family.id, childId, {...profile, ...budget});
  if (!updated) throw notFound('child');
  if (levelChanged) {
    const waiting = await deps.repo.getPuzzleSet(family.id, childId);
    if (waiting?.questions.length) await deps.repo.putPuzzleSet(family.id, childId, {questions: [], madeAt: waiting.madeAt, recent: waiting.recent});
    await wantNextSession(deps, family, updated);
  }
  deps.changed(family.id);
  return childView((await settleDue(deps, family, updated)).child);
}

/** Removes a kid and everything about them. Their jobs lose them; a job left with no kids goes too. */
export async function removeChild(deps: Deps, family: Family, childId: string) {
  for (const chore of await deps.repo.listChores(family.id)) {
    if (chore.childIds.includes(childId)) await changeChore(deps, family.id, chore.id, k => withoutChild(k, childId));
  }
  await deps.repo.deleteChild(family.id, childId);
  deps.changed(family.id);
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
    routine: false,
    repeat: input.repeat ?? {kind: 'daily'},
    childIds,
    createdAt: now,
    updatedAt: now,
  };
  await deps.repo.putChore(family.id, chore);
  deps.changed(family.id);
  return choreView(chore);
}

/** Changes only what's given. The icon stays as it is when only the title changes (the parent may have picked it). */
export async function patchChore(deps: Deps, family: Family, choreId: string, input: ChorePatch) {
  const childIds = input.childIds && [...new Set(input.childIds)];
  if (childIds) await checkChildren(deps, family.id, childIds);
  // `routine` is accepted and ignored (every job gives its minutes); a job saved again loses an old flag.
  const chore = await changeChore(deps, family.id, choreId, k => ({...k, ...input, routine: false, ...(childIds && {childIds})}));
  if (!chore) throw notFound('job');
  deps.changed(family.id);
  return choreView(chore);
}

/** Its claims and ledger entries stay (they carry the title and minutes). */
export async function removeChore(deps: Deps, family: Family, choreId: string) {
  await deps.repo.deleteChore(family.id, choreId);
  deps.changed(family.id);
}
