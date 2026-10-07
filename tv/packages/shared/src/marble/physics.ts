/**
 * Marble physics for the jar: each marble falls through the neck, bounces off the glass and the
 * marbles already inside, rolls into a gap and settles. Pure and deterministic (seeded), so
 * Fire OS and Vega get the same pile, and it can be computed up front and played back as a native
 * animation (smooth on a 32-bit TV stick). Units: design px inside the jar glass (384 × 464).
 */

export const JAR = {
  width: 384,
  height: 464,
  /** Radius of the rounded bottom corners (inside the 8 px glass). */
  cornerBottom: 88,
  /** The neck opening the marbles fall through. */
  neckLeft: 60,
  neckRight: 324,
  /** The marbles' radius in a jar of unknown size (it holds JAR_CAPACITY). */
  radius: 36,
};
/** Most marbles drawn in the jar (more minutes are still counted, just not drawn). */
export const JAR_CAPACITY = 24;

/**
 * Marble radius for a jar that holds n marbles, so a full jar looks full: the largest radius at which n settled
 * marbles leave only the top 8% of the glass free. Searched offline with this file's simulation (deterministic);
 * a test checks the table still fits it.
 */
const RADIUS_FOR = [110, 110, 98, 84, 75.5, 74, 66.5, 65.5, 61.5, 57, 57, 50.5, 50.5, 48.5, 47, 46.5, 44, 44, 42, 42, 38.5, 38.5, 38.5, 38.5];
export const radiusFor = (capacity: number) => RADIUS_FOR[Math.max(1, Math.min(JAR_CAPACITY, Math.round(capacity))) - 1];

const G = 2600; // px/s², tuned so a drop takes ~0.6 s
const RESTITUTION = 0.32;
const FRICTION = 0.985;
const DT = 1 / 240;
const FRAME = 1 / 60;
const MAX_TIME = 4;

export interface Point {
  x: number;
  y: number;
}
export interface Impact {
  /** Seconds after this marble starts falling. */
  t: number;
  /** 0–1, for the clink volume. */
  strength: number;
}
export interface Drop {
  /** Positions at 60 fps from release to rest (marble centre). */
  path: Point[];
  final: Point;
  impacts: Impact[];
  duration: number;
}

/** Small seeded RNG (mulberry32): same jar on every device. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Drop one marble of radius `r` from `startX` onto the settled `pile` (which doesn't move). */
export function simulateDrop(pile: Point[], startX: number, r = JAR.radius): Drop {
  const {width: W, height: H, cornerBottom: C} = JAR;
  let x = startX;
  let y = -r - 20;
  let vx = 0;
  let vy = 0;
  let t = 0;
  let rest = 0;
  let nextFrame = 0;
  let lastImpact = -1;
  const path: Point[] = [];
  const impacts: Impact[] = [];

  const hit = (vn: number) => {
    // Only real knocks clink; contact while rolling doesn't.
    if (vn > 140 && t - lastImpact > 0.045) {
      impacts.push({t, strength: Math.min(1, vn / 900)});
      lastImpact = t;
    }
  };
  // Reflect the velocity off a surface with outward normal (nx, ny) when moving into it.
  const bounce = (nx: number, ny: number) => {
    const vn = vx * nx + vy * ny;
    if (vn < 0) {
      hit(-vn);
      vx -= (1 + RESTITUTION) * vn * nx;
      vy -= (1 + RESTITUTION) * vn * ny;
      vx *= FRICTION;
      vy *= FRICTION;
    }
  };

  while (t < MAX_TIME) {
    vy += G * DT;
    x += vx * DT;
    y += vy * DT;

    for (let pass = 0; pass < 3; pass++) {
      // Neck walls while above the body.
      if (y < 0) {
        if (x < JAR.neckLeft + r) { x = JAR.neckLeft + r; bounce(1, 0); }
        if (x > JAR.neckRight - r) { x = JAR.neckRight - r; bounce(-1, 0); }
      }
      // Side walls and floor.
      if (x < r) { x = r; bounce(1, 0); }
      if (x > W - r) { x = W - r; bounce(-1, 0); }
      if (y > H - r) { y = H - r; bounce(0, -1); }
      // Rounded bottom corners.
      for (const cx of [C, W - C]) {
        const cy = H - C;
        const inCorner = (cx === C ? x < C : x > W - C) && y > cy;
        if (inCorner) {
          const dx = x - cx;
          const dy = y - cy;
          const d = Math.hypot(dx, dy);
          if (d > C - r) {
            const nx = -dx / d;
            const ny = -dy / d;
            x = cx + (dx / d) * (C - r);
            y = cy + (dy / d) * (C - r);
            bounce(nx, ny);
          }
        }
      }
      // The marbles already in the jar.
      for (const p of pile) {
        const dx = x - p.x;
        const dy = y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 2 * r && d > 1e-6) {
          const nx = dx / d;
          const ny = dy / d;
          x = p.x + nx * 2 * r;
          y = p.y + ny * 2 * r;
          bounce(nx, ny);
        }
      }
    }

    t += DT;
    if (t >= nextFrame) {
      path.push({x, y});
      nextFrame += FRAME;
    }
    rest = Math.hypot(vx, vy) < 12 ? rest + DT : 0;
    if (rest > 0.2) break;
  }
  path.push({x, y});
  return {path, final: {x, y}, impacts, duration: path.length * FRAME};
}

const caches = new Map<number, Drop[]>();

/**
 * The settled jar with `n` marbles of radius `r`: marble i fell after marbles 0…i−1 had settled, so a jar with
 * more marbles only adds to the pile. Memoized per radius.
 */
export function jarDrops(n: number, r = JAR.radius): Drop[] {
  const cache = caches.get(r) ?? [];
  caches.set(r, cache);
  const count = Math.min(n, JAR_CAPACITY);
  while (cache.length < count) {
    const i = cache.length;
    const random = rng(i + 1);
    const span = JAR.neckRight - JAR.neckLeft - 2 * r;
    const startX = JAR.neckLeft + r + span * (0.2 + 0.6 * random());
    cache.push(simulateDrop(cache.map(d => d.final), startX, r));
  }
  return cache.slice(0, count);
}

/** The top of the pile (px from the top of the glass) when `n` marbles of radius `r` have settled. */
export const pileTop = (n: number, r: number) => Math.min(...jarDrops(n, r).map(d => d.final.y - r));
