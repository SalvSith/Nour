import type { EmotionAnalysis, EmotionUniforms } from './types';
import { DEFAULT_EMOTION, EMOTION_UNIFORM_MAP } from './types';

const DEATH_THRESHOLD = 1.5;
const NEGLECT_RATE = 0.003;

/**
 * Manages emotion state with cumulative trauma tracking.
 *
 * Trauma increases with each negative message and heals very slowly.
 * It acts as a persistent floor -- even a "happy" emotion won't restore full
 * size/saturation while the orb is traumatised. Only sustained kindness heals it.
 *
 * Beyond trauma 1.0 the orb enters a "dying" state -- fading, shrinking,
 * losing all color and motion until it becomes nearly invisible.
 * At DEATH_THRESHOLD the orb is permanently dead.
 */
export class EmotionEngine {
  private target: EmotionUniforms;
  private traumaLevel: number;
  private baseUniforms: EmotionUniforms;
  private currentAnalysis: EmotionAnalysis;
  private paletteIndex: number = 0;

  constructor(initialMood?: EmotionAnalysis, initialRelationship: number = 0, savedTraumaLevel?: number) {
    this.traumaLevel = savedTraumaLevel ?? Math.max(0, -initialRelationship * 0.7);
    this.currentAnalysis = initialMood ?? DEFAULT_EMOTION;
    this.baseUniforms = emotionToUniforms(this.currentAnalysis, 0);
    this.target = this.applyTrauma(this.baseUniforms);
  }

  /**
   * Called when a new emotion arrives from the LLM.
   * Returns the new target uniforms and whether to trigger a kindness flash.
   */
  setEmotion(analysis: EmotionAnalysis): { uniforms: EmotionUniforms; flash: boolean } {
    const isNegative = analysis.valence < -0.25;
    const isPositive = analysis.valence > 0.25;

    if (analysis.isLethal) {
      this.traumaLevel = DEATH_THRESHOLD - 0.1;
    } else if (isNegative) {
      this.traumaLevel = Math.min(DEATH_THRESHOLD, this.traumaLevel + analysis.intensity * 0.22);
    } else if (analysis.isApology) {
      this.traumaLevel = Math.max(0, this.traumaLevel - analysis.intensity * 0.15);
    } else if (isPositive) {
      this.traumaLevel = Math.max(0, this.traumaLevel - analysis.intensity * 0.025);
    }

    this.currentAnalysis = analysis;
    this.paletteIndex = 0;
    this.baseUniforms = emotionToUniforms(analysis, 0);
    this.target = this.applyTrauma(this.baseUniforms);

    const flash = !!(isPositive || analysis.isApology) && this.traumaLevel > 0.2;

    return { uniforms: { ...this.target }, flash };
  }

  /**
   * Picks a random colour palette for the current emotion, always different
   * from the one currently showing so a change is guaranteed.
   * Returns the new target uniforms with trauma applied.
   */
  cycleColorPalette(): EmotionUniforms {
    const palettes = EMOTION_UNIFORM_MAP[this.currentAnalysis.emotion]?.colorPalettes;
    if (palettes && palettes.length > 1) {
      let next: number;
      do {
        next = Math.floor(Math.random() * palettes.length);
      } while (next === this.paletteIndex);
      this.paletteIndex = next;
    }
    this.baseUniforms = emotionToUniforms(this.currentAnalysis, this.paletteIndex);
    this.target = this.applyTrauma(this.baseUniforms);
    return { ...this.target };
  }

  applyNeglect(deltaSec: number) {
    this.traumaLevel = Math.min(DEATH_THRESHOLD, this.traumaLevel + deltaSec * NEGLECT_RATE);
    this.target = this.applyTrauma(this.baseUniforms);
  }

  getUniforms(): EmotionUniforms {
    return { ...this.target };
  }

  getTraumaLevel(): number {
    return this.traumaLevel;
  }

  isDead(): boolean {
    return this.traumaLevel >= DEATH_THRESHOLD;
  }

  private applyTrauma(uniforms: EmotionUniforms): EmotionUniforms {
    const t = this.traumaLevel;

    const phase1 = Math.min(t, 1.0);
    let sizeMultiplier = 1 - phase1 * 0.72;
    let satMultiplier = 1 - phase1 * 0.88;
    let opacity = 1.0;
    let arousal = uniforms.arousal;
    let valence = uniforms.valence;

    if (t > 1.0) {
      const dyingProgress = Math.min((t - 1.0) / (DEATH_THRESHOLD - 1.0), 1.0);
      sizeMultiplier *= 1 - dyingProgress;
      satMultiplier *= 1 - dyingProgress;
      opacity = 1 - dyingProgress;
      arousal *= 1 - dyingProgress * 0.8;
      valence -= dyingProgress * 0.3;
    }

    return {
      ...uniforms,
      size: uniforms.size * Math.max(sizeMultiplier, 0),
      saturation: uniforms.saturation * Math.max(satMultiplier, 0),
      arousal,
      valence,
      opacity,
      intensity: uniforms.intensity,
    };
  }
}

export function emotionToUniforms(analysis: EmotionAnalysis, paletteIndex: number = 0): EmotionUniforms {
  const base = EMOTION_UNIFORM_MAP[analysis.emotion] ?? EMOTION_UNIFORM_MAP.calm;
  const t = analysis.intensity;

  const palettes = base.colorPalettes;
  const palette = palettes[paletteIndex % palettes.length];

  // The emotion's base character scales with intensity (soft feeling = subtle effect).
  // The palette *delta* is applied at full strength so colour variation stays visible
  // even for low-intensity emotions like calm (t≈0.25) where lerp would otherwise
  // squash a 60° palette difference down to ~15°.
  const hueOffset    = palette.hue        - base.hue;
  const satOffset    = palette.saturation - base.saturation;
  const spreadOffset = palette.colorSpread - base.colorSpread;

  return {
    valence:     lerp(0,    base.valence * Math.sign(analysis.valence || base.valence), t),
    arousal:     lerp(0.3,  base.arousal, t),
    size:        lerp(0.55, base.size, t),
    hue:         lerp(0,    base.hue, t) + hueOffset,
    saturation:  lerp(0.6,  base.saturation, t) + satOffset,
    colorSpread: lerp(15,   base.colorSpread, t) + spreadOffset,
    opacity:     1.0,
    intensity:   analysis.intensity,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}
