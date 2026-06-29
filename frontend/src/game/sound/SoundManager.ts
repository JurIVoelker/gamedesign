import { Howl } from "howler";
import { SOUND_CONFIG, type SoundId } from "./soundConfig";

const SOUND_FILES: Record<SoundId, string> = {
  sow: "/sounds/sow.mp3",
  harvest: "/sounds/harvest.mp3",
  crows: "/sounds/crows.mp3",
  "crow-scare": "/sounds/crow-scare.mp3",
  rain: "/sounds/rain.mp3",
  thunder: "/sounds/thunder.mp3",
  angry: "/sounds/angry.mp3",
  "cast-item": "/sounds/item-cast.mp3",
  glass: "/sounds/glass.mp3",
  coin: "/sounds/buy.mp3",
  notification: "/sounds/notification.mp3",
  click: "/sounds/click.mp3",
  victory: "/sounds/victory.mp3",
  loss: "/sounds/loss.mp3",
  "villager-1": "/sounds/villager-1.mp3",
  "villager-2": "/sounds/villager-2.mp3",
  "villager-3": "/sounds/villager-3.mp3",
  "villager-4": "/sounds/villager-4.mp3",
};

const VILLAGER_IDS: SoundId[] = [
  "villager-1",
  "villager-2",
  "villager-3",
  "villager-4",
];

interface LoopEntry {
  howl: Howl;
  targetVol: number;
  playId: number;
}

// Shared one-shot Howl instances (lazy-loaded per sound ID)
const oneShots = new Map<SoundId, Howl>();
// Independent loop Howl instances keyed by caller-supplied string
const loops = new Map<string, LoopEntry>();
// Reference counts per loop key — multiple callers can share one Howl instance
const loopRefs = new Map<string, number>();
// Last-played timestamps for per-category repeat guards
const lastPlayed = new Map<string, number>();
// When true, any call with isEnemy:true is silently ignored
let enemySoundsMuted = false;

function getOneShot(id: SoundId): Howl {
  if (!oneShots.has(id)) {
    oneShots.set(id, new Howl({ src: [SOUND_FILES[id]], preload: true }));
  }
  return oneShots.get(id)!;
}

function resolveVolume(id: SoundId, isEnemy: boolean): number {
  const base = SOUND_CONFIG.VOLUMES[id];
  if (!isEnemy) return base;
  if (id === "sow") return SOUND_CONFIG.ENEMY_SOW_VOLUME;
  if (id === "harvest") return SOUND_CONFIG.ENEMY_HARVEST_VOLUME;
  return base * SOUND_CONFIG.ENEMY_VOLUME_MULTIPLIER;
}

function playOneShot(
  id: SoundId,
  opts: { isEnemy?: boolean; rate?: number; volume?: number } = {},
): void {
  if ((opts.isEnemy ?? false) && enemySoundsMuted) return;
  const vol = opts.volume ?? resolveVolume(id, opts.isEnemy ?? false);
  const howl = getOneShot(id);
  const sid = howl.play();
  howl.volume(0, sid);
  howl.fade(0, vol, SOUND_CONFIG.DEFAULT_FADE_IN_MS, sid);
  if (opts.rate !== undefined) howl.rate(opts.rate, sid);
}

export const SoundManager = {
  /** Play a one-shot sound with a short fade-in. */
  play(
    id: SoundId,
    opts: { isEnemy?: boolean; rate?: number; volume?: number } = {},
  ): void {
    playOneShot(id, opts);
  },

  /**
   * Start a looping sound bound to `key`. Idempotent — calling again with
   * the same key while already playing has no effect.
   */
  startLoop(
    id: SoundId,
    key: string,
    opts: { isEnemy?: boolean; fadeInMs?: number } = {},
  ): void {
    if ((opts.isEnemy ?? false) && enemySoundsMuted) return;
    loopRefs.set(key, (loopRefs.get(key) ?? 0) + 1);
    if (loops.has(key)) return;
    const targetVol = resolveVolume(id, opts.isEnemy ?? false);
    const fadeInMs = opts.fadeInMs ?? SOUND_CONFIG.DEFAULT_FADE_IN_MS;
    const howl = new Howl({ src: [SOUND_FILES[id]], loop: true, volume: 0 });
    const playId = howl.play();
    howl.fade(0, targetVol, fadeInMs, playId);
    loops.set(key, { howl, targetVol, playId });
  },

  /** Fade out and stop a looping sound. Ref-counted: only stops when all callers have released it. */
  stopLoop(key: string, opts: { fadeOutMs?: number } = {}): void {
    const refs = loopRefs.get(key) ?? 0;
    if (refs > 1) {
      loopRefs.set(key, refs - 1);
      return;
    }
    loopRefs.delete(key);
    const entry = loops.get(key);
    if (!entry) return;
    loops.delete(key);
    const fadeOutMs = opts.fadeOutMs ?? SOUND_CONFIG.DEFAULT_FADE_OUT_MS;
    entry.howl.fade(entry.targetVol, 0, fadeOutMs, entry.playId);
    setTimeout(() => entry.howl.unload(), fadeOutMs + 150);
  },

  /**
   * Play a random villager sound. A repeat-delay guard prevents rapid
   * re-triggers (e.g. quick successive clicks).
   */
  playVillager(opts: { rate?: number } = {}): void {
    const now = Date.now();
    const guard = SOUND_CONFIG.REPEAT_DELAY_MS.villager;
    if ((lastPlayed.get("villager") ?? 0) + guard > now) return;
    lastPlayed.set("villager", now);
    const id = VILLAGER_IDS[Math.floor(Math.random() * VILLAGER_IDS.length)];
    playOneShot(id, opts);
  },

  /** Silence (or restore) all sounds whose isEnemy flag is true. */
  muteEnemySounds(muted: boolean): void {
    enemySoundsMuted = muted;
  },

  /** Stop all active sounds immediately (e.g. on game end / disconnect). */
  stopAll(): void {
    for (const [, entry] of loops) {
      entry.howl.stop();
      entry.howl.unload();
    }
    loops.clear();
    loopRefs.clear();
    for (const [, howl] of oneShots) {
      howl.stop();
    }
  },
} as const;
