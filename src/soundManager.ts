/**
 * Audio engine for Nour.
 *
 * Manages a single Web Audio API context with:
 *   - Per-emotion sound samples (loaded eagerly on construction)
 *   - Ambient idle sounds that play randomly while the orb is visible
 *   - Trick / game / death / dying sounds
 *   - Lava lamp bubble-pop samples
 *   - Microphone ducking — master gain drops fast when the user speaks and
 *     recovers slowly when they stop, so playback never masks the user's voice
 *   - An AnalyserNode that exposes frequency bands used by the orb shader for
 *     audio-reactive visuals
 *
 * Mobile AudioContext unlock is handled automatically: the context is resumed
 * on the first user gesture (click / touch / keydown) that reaches the document.
 * A pending play call is queued and flushed on that first unlock.
 *
 * The `ready` promise resolves once at least READY_THRESHOLD sounds are decoded,
 * which is used to gate the orb fade-in in App.tsx.
 */
import type { Emotion } from './types';

const SOUND_BASE = '/Nour%20Sounds/';

/** Lava lamp tap — one of these is chosen at random per pop. */
const BUBBLE_POP_SOUNDS = [
  'BubblePop01',
  'BubblePop02',
  'BubblePop03',
  'BubblePop04',
  'BubblePop05',
  'BubblePop06',
  'BubblePop07',
] as const;

const ALL_SOUNDS = [
  'AffectionSound',
  'AffectionSound2',
  'AngrySound',
  'AngrySound2',
  'AngrySound3',
  'Anxious',
  'Anxious2',
  'CloseToDeathSound',
  'Contempt',
  'Contempt2',
  'Curious2',
  'CuriousSound',
  'CuriousSound3',
  'CuteSound',
  'CuteSound3',
  'DisapointedSound',
  'DisgustedSound',
  'DisgustedSound2',
  'DisgustedSound3',
  'DyingSound',
  'ExcitedSound',
  'ExcitedSound2',
  'NeutralSound',
  'NeutralSound2',
  'NeutralSound3',
  'NeutralSound4',
  'NeutralSound5',
  'Playful',
  'RandomIdle',
  'Sad2',
  'SadSound',
  'ShockedSound',
  'ShockedSound2',
  'Shy',
  'ShySound2',
  'TrickBounce',
  'TrickBurst',
  'TrickFigure8',
  'TrickScatter',
  'TrickSpin',
  'VeryHappySound',
  'VeryHappySound2',
  'VeryHappySound3',
  ...BUBBLE_POP_SOUNDS,
  'StartGameBuzz',
  'GameOverBuzz',
] as const;

const TRICK_SOUNDS = ['TrickSpin', 'TrickBounce', 'TrickScatter', 'TrickFigure8', 'TrickBurst'];

const IDLE_SOUNDS = [
  'NeutralSound',
  'NeutralSound2',
  'NeutralSound3',
  'NeutralSound4',
  'NeutralSound5',
  'RandomIdle',
];

const EMOTION_SOUNDS: Record<Emotion, string[]> = {
  happy:        ['VeryHappySound', 'VeryHappySound2', 'VeryHappySound3'],
  excited:      ['ExcitedSound', 'ExcitedSound2'],
  loving:       ['AffectionSound', 'AffectionSound2'],
  playful:      ['CuteSound', 'CuteSound3', 'Playful'],
  surprised:    ['ShockedSound', 'ShockedSound2'],
  curious:      ['CuriousSound', 'Curious2', 'CuriousSound3'],
  calm:         ['NeutralSound', 'NeutralSound2', 'NeutralSound3', 'NeutralSound4', 'NeutralSound5'],
  angry:        ['AngrySound', 'AngrySound2', 'AngrySound3'],
  disgusted:    ['DisgustedSound', 'DisgustedSound2', 'DisgustedSound3'],
  contemptuous: ['Contempt', 'Contempt2'],
  anxious:      ['Anxious', 'Anxious2', 'DisapointedSound'],
  sad:          ['SadSound', 'Sad2'],
  fearful:      ['CloseToDeathSound'],
  shy:          ['Shy', 'ShySound2'],
};

const EMOTION_VOLUME: Partial<Record<Emotion, number>> = {
  shy:          0.1,
  fearful:      0.14,
  sad:          0.15,
  calm:         0.13,
  anxious:      0.14,
  contemptuous: 0.12,
  curious:      0.16,
};

const DEFAULT_VOLUME       = 0.2;
const AMBIENT_VOLUME       = 0.12;
const AMBIENT_FIRST_MIN_MS = 4_000;
const AMBIENT_FIRST_MAX_MS = 10_000;
const AMBIENT_MIN_MS       = 18_000;
const AMBIENT_MAX_MS       = 45_000;
const AMBIENT_COOLDOWN     = 4_000;
const FADE_IN_SEC          = 0.12;
const FADE_OUT_SEC         = 0.2;
const MIC_DUCK_THRESHOLD   = 0.035;
const MIC_DUCK_ATTACK      = 12;
const MIC_DUCK_RELEASE     = 2.5;
const MIC_DUCK_FLOOR       = 0.08;

export interface SoundFrequencyData {
  level: number;
  bass: number;
  mid: number;
  treble: number;
}

const READY_THRESHOLD = 5;

export class SoundManager {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private master: GainNode | null = null;
  private dataArray: Uint8Array<ArrayBuffer> | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private activeSource: AudioBufferSourceNode | null = null;
  private activeGain: GainNode | null = null;
  private activeKey: string | null = null;
  private ambientTimer: ReturnType<typeof setTimeout> | null = null;
  private ambientOn = false;
  private ambientFirstFired = false;
  private lastPlayTime = 0;
  private destroyed = false;
  private unlocked = false;
  private pendingPlay: { key: string; volume: number } | null = null;
  private gestureHandler: (() => void) | null = null;
  private duckLevel = 1.0;
  private _readyCount = 0;
  private _readyResolve: (() => void) | null = null;
  readonly ready: Promise<void>;

  constructor() {
    this.ready = new Promise<void>(r => { this._readyResolve = r; });

    try {
      const ctx = new AudioContext();
      this.ctx = ctx;

      this.master = ctx.createGain();
      this.master.gain.value = 1.0;

      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.85;

      this.master.connect(this.analyser);
      this.analyser.connect(ctx.destination);
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      for (const name of ALL_SOUNDS) this.load(name);

      if (ctx.state === 'running') {
        this.unlocked = true;
      } else if (navigator.maxTouchPoints > 0) {
        // On mobile the AudioContext starts suspended. The mic permission dialog
        // is a user gesture — attempt resume immediately the same way the intro
        // sounds do via ensureRunning(), rather than waiting for a tap on the orb.
        ctx.resume().then(() => { this.unlocked = true; }).catch(() => {});
      }

      this.gestureHandler = () => this.handleGesture();
      document.addEventListener('click', this.gestureHandler, true);
      document.addEventListener('touchstart', this.gestureHandler, true);
      document.addEventListener('touchend', this.gestureHandler, true);
      document.addEventListener('keydown', this.gestureHandler, true);
    } catch {
      this._readyResolve?.();
      this._readyResolve = null;
    }
  }

  private handleGesture() {
    if (!this.ctx || this.destroyed) return;
    const wasLocked = !this.unlocked;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => {
        this.unlocked = true;
        this.flushPending(wasLocked);
      });
    } else {
      this.unlocked = true;
      this.flushPending(wasLocked);
    }
  }

  private flushPending(firstUnlock = false) {
    if (this.pendingPlay) {
      const { key, volume } = this.pendingPlay;
      this.pendingPlay = null;
      this.playInternal(key, volume);
    } else if (firstUnlock && this.ambientOn && !this.activeKey) {
      // Nothing was queued but this is the first gesture unlock — play an
      // idle sound immediately so there's instant audio feedback on mobile.
      this.playInternal(this.pickSoundKey(IDLE_SOUNDS), AMBIENT_VOLUME);
    }
    // If ambient was started but the timer was never scheduled (e.g. the
    // AudioContext was suspended at the time), kick it now.
    if (this.ambientOn && !this.destroyed && this.ambientTimer === null) {
      this.scheduleAmbient();
    }
  }

  /** Call immediately after getUserMedia resolves — may still be in the gesture window. */
  tryResume() {
    if (!this.ctx || this.unlocked || this.destroyed) return;
    this.ctx.resume().then(() => {
      this.unlocked = true;
      this.flushPending();
    }).catch(() => {});
  }

  playForEmotion(emotion: Emotion, traumaLevel = 0) {
    if (this.destroyed) return;
    if (traumaLevel > 1.0)  { this.play('DyingSound', 0.22); return; }
    if (traumaLevel > 0.8)  { this.play('CloseToDeathSound', 0.2); return; }

    const pool = EMOTION_SOUNDS[emotion];
    if (!pool?.length) return;
    this.play(this.pickSoundKey(pool), EMOTION_VOLUME[emotion] ?? DEFAULT_VOLUME);
  }

  playTraumaSound(traumaLevel: number) {
    if (this.destroyed) return;
    if (traumaLevel > 1.0 && this.activeKey !== 'DyingSound') {
      this.play('DyingSound', 0.22);
    } else if (
      traumaLevel > 0.8 &&
      this.activeKey !== 'CloseToDeathSound' &&
      this.activeKey !== 'DyingSound'
    ) {
      this.play('CloseToDeathSound', 0.2);
    }
  }

  playDying() {
    if (this.destroyed) return;
    this.stopAmbient();
    this.play('DyingSound', 0.25);
  }

  playTrick(trickIndex: number) {
    if (this.destroyed) return;
    const key = TRICK_SOUNDS[trickIndex % TRICK_SOUNDS.length];
    this.play(key, DEFAULT_VOLUME);
  }

  playBubblePop() {
    if (this.destroyed) return;
    this.play(this.pickSoundKey(BUBBLE_POP_SOUNDS), 0.36);
  }

  playGameStart() {
    if (this.destroyed) return;
    this.play('StartGameBuzz', 0.3);
  }

  playGameOver() {
    if (this.destroyed) return;
    this.play('GameOverBuzz', 0.3);
  }

  startAmbient() {
    if (this.ambientOn || this.destroyed) return;
    this.ambientOn = true;
    this.ambientFirstFired = false;
    this.scheduleAmbient();
  }

  /** Call every frame with the mic's smoothed level. Ducks sound when user speaks. */
  feedMicLevel(micLevel: number, dt: number) {
    if (!this.master || this.destroyed) return;

    const speaking = micLevel > MIC_DUCK_THRESHOLD;
    const target = speaking ? MIC_DUCK_FLOOR : 1.0;
    const rate = speaking ? MIC_DUCK_ATTACK : MIC_DUCK_RELEASE;
    this.duckLevel += (target - this.duckLevel) * (1 - Math.exp(-rate * dt));
    this.master.gain.value = this.duckLevel;
  }

  stopAmbient() {
    this.ambientOn = false;
    if (this.ambientTimer !== null) {
      clearTimeout(this.ambientTimer);
      this.ambientTimer = null;
    }
  }

  getFrequencyData(): SoundFrequencyData {
    if (!this.analyser || !this.dataArray) {
      return { level: 0, bass: 0, mid: 0, treble: 0 };
    }

    this.analyser.getByteFrequencyData(this.dataArray);

    const len     = this.dataArray.length;
    const bassEnd = Math.floor(len * 0.12);
    const midEnd  = Math.floor(len * 0.45);

    let total = 0, bass = 0, mid = 0, treble = 0;
    for (let i = 0; i < len; i++) {
      const v = this.dataArray[i] / 255;
      total += v;
      if (i < bassEnd)       bass   += v;
      else if (i < midEnd)   mid    += v;
      else                   treble += v;
    }

    return {
      level:  total / len,
      bass:   bass  / bassEnd,
      mid:    mid   / (midEnd - bassEnd),
      treble: treble / (len - midEnd),
    };
  }

  destroy() {
    this.destroyed = true;
    this.stopAmbient();
    this.pendingPlay = null;
    this.stopCurrent(0.02);
    this.buffers.clear();
    if (this.gestureHandler) {
      document.removeEventListener('click', this.gestureHandler, true);
      document.removeEventListener('touchstart', this.gestureHandler, true);
      document.removeEventListener('touchend', this.gestureHandler, true);
      document.removeEventListener('keydown', this.gestureHandler, true);
    }
    this.ctx?.close();
    this.ctx = null;
  }

  // -- internals ------------------------------------------------------

  private async load(name: string) {
    if (!this.ctx) return;
    try {
      const res = await fetch(`${SOUND_BASE}${name}.mp3`);
      if (!res.ok) return;
      const arrayBuf = await res.arrayBuffer();
      const audioBuf = await this.ctx!.decodeAudioData(arrayBuf);
      this.buffers.set(name, audioBuf);
      this._readyCount++;
      if (this._readyCount >= READY_THRESHOLD && this._readyResolve) {
        this._readyResolve();
        this._readyResolve = null;
      }
      this.retryPendingPlay();
    } catch { /* failed to load / decode */ }
  }

  /** Prefer clips that are already decoded so random choice isn't biased toward early fetch order. */
  private pickSoundKey(pool: readonly string[]): string {
    const loaded = pool.filter((k) => this.buffers.has(k));
    const choices = loaded.length > 0 ? loaded : [...pool];
    return choices[Math.floor(Math.random() * choices.length)];
  }

  /** If we queued a play before its buffer existed, start it as soon as the file finishes loading. */
  private retryPendingPlay() {
    if (!this.pendingPlay || !this.ctx) return;
    const { key, volume } = this.pendingPlay;
    if (!this.buffers.has(key)) return;
    if (!this.unlocked || this.ctx.state === 'suspended') return;
    this.pendingPlay = null;
    this.playInternal(key, volume);
  }

  private stopCurrent(fadeSec = FADE_OUT_SEC) {
    if (!this.activeSource || !this.activeGain || !this.ctx) {
      this.activeKey = null;
      return;
    }

    const now = this.ctx.currentTime;
    this.activeGain.gain.cancelScheduledValues(now);
    this.activeGain.gain.setValueAtTime(this.activeGain.gain.value, now);
    this.activeGain.gain.linearRampToValueAtTime(0, now + fadeSec);

    const src = this.activeSource;
    const g = this.activeGain;
    setTimeout(() => {
      try { src.stop(); } catch { /* already stopped */ }
      src.disconnect();
      g.disconnect();
    }, fadeSec * 1000 + 50);

    this.activeSource = null;
    this.activeGain = null;
    this.activeKey = null;
  }

  private play(key: string, volume: number) {
    if (!this.ctx) return;
    if (!this.buffers.has(key)) {
      this.pendingPlay = { key, volume };
      return;
    }

    if (!this.unlocked || this.ctx.state === 'suspended') {
      this.pendingPlay = { key, volume };
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().then(() => {
          this.unlocked = true;
          this.flushPending();
        });
      }
      return;
    }

    this.playInternal(key, volume);
  }

  private playInternal(key: string, volume: number) {
    if (!this.ctx || this.destroyed) return;
    const buffer = this.buffers.get(key);
    if (!buffer) return;

    this.stopCurrent(FADE_OUT_SEC * 0.4);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + FADE_IN_SEC);

    source.connect(gain);
    gain.connect(this.master!);

    source.onended = () => {
      if (this.activeSource === source) {
        this.activeSource = null;
        this.activeGain = null;
        this.activeKey = null;
      }
      source.disconnect();
      gain.disconnect();
    };

    source.start(0);

    this.activeSource = source;
    this.activeGain = gain;
    this.activeKey = key;
    this.lastPlayTime = Date.now();
  }

  private scheduleAmbient() {
    if (!this.ambientOn || this.destroyed) return;

    let delay: number;
    if (!this.ambientFirstFired) {
      delay = AMBIENT_FIRST_MIN_MS + Math.random() * (AMBIENT_FIRST_MAX_MS - AMBIENT_FIRST_MIN_MS);
    } else {
      delay = AMBIENT_MIN_MS + Math.random() * (AMBIENT_MAX_MS - AMBIENT_MIN_MS);
    }

    this.ambientTimer = setTimeout(() => {
      if (!this.ambientOn || this.destroyed) return;
      this.ambientFirstFired = true;

      if (Date.now() - this.lastPlayTime < AMBIENT_COOLDOWN || this.activeKey) {
        this.scheduleAmbient();
        return;
      }

      this.play(this.pickSoundKey(IDLE_SOUNDS), AMBIENT_VOLUME);
      this.scheduleAmbient();
    }, delay);
  }
}
