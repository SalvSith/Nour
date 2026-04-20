export type Emotion =
  | 'happy' | 'sad' | 'angry' | 'fearful' | 'disgusted'
  | 'surprised' | 'loving' | 'excited' | 'calm' | 'anxious'
  | 'shy' | 'playful' | 'curious' | 'contemptuous';

export interface EmotionAnalysis {
  emotion: Emotion;
  valence: number;
  arousal: number;
  dominance: number;
  intensity: number;
  isApology?: boolean;
  isLethal?: boolean;
}

export interface StoredMessage {
  text: string;
  emotion: EmotionAnalysis;
  timestamp: number;
}

export interface OrbMemory {
  visitorId: string;
  messages: StoredMessage[];
  currentMood: EmotionAnalysis;
  relationship: number;
  totalInteractions: number;
  firstSeen: number;
  lastSeen: number;
  isDead?: boolean;
  traumaLevel?: number;
  loveCount?: number;
}

export interface EmotionUniforms {
  valence: number;
  arousal: number;
  size: number;
  hue: number;
  saturation: number;
  colorSpread: number;
  opacity: number;
  intensity: number;
}

export interface EmotionColorPalette {
  hue: number;
  saturation: number;
  colorSpread: number;
}

export const DEFAULT_EMOTION: EmotionAnalysis = {
  emotion: 'calm',
  valence: 0,
  arousal: 0.3,
  dominance: 0.5,
  intensity: 0.3,
};

export const EMOTION_UNIFORM_MAP: Record<Emotion, Omit<EmotionUniforms, 'opacity'> & { colorPalettes: EmotionColorPalette[] }> = {
  // ── Positive: big hue jumps + dramatic saturation swings per variant ──────────
  happy: {
    valence: 0.8, arousal: 0.75, size: 0.78, hue: 110, saturation: 1.0, colorSpread: 45, intensity: 0.7,
    colorPalettes: [
      { hue: 110, saturation: 1.0,  colorSpread: 45 }, // vivid lime-green
      { hue: 50,  saturation: 1.45, colorSpread: 55 }, // SUPER vivid amber-gold
      { hue: 175, saturation: 0.6,  colorSpread: 40 }, // soft pastel aqua
      { hue: -15, saturation: 1.25, colorSpread: 50 }, // vivid warm coral
    ],
  },
  excited: {
    valence: 0.9, arousal: 1.0, size: 0.92, hue: 70, saturation: 1.1, colorSpread: 55, intensity: 1.0,
    colorPalettes: [
      { hue: 70,  saturation: 1.1,  colorSpread: 55 }, // vivid yellow-orange
      { hue: -50, saturation: 1.55, colorSpread: 65 }, // SUPER vivid hot magenta
      { hue: 145, saturation: 1.3,  colorSpread: 58 }, // vivid neon green
      { hue: 10,  saturation: 0.75, colorSpread: 52 }, // muted warm red
    ],
  },
  loving: {
    valence: 0.95, arousal: 0.65, size: 0.82, hue: -145, saturation: 1.05, colorSpread: 30, intensity: 0.65,
    colorPalettes: [
      { hue: -145, saturation: 1.05, colorSpread: 30 }, // rose-pink
      { hue: -90,  saturation: 1.45, colorSpread: 36 }, // VIVID raspberry
      { hue: -185, saturation: 0.65, colorSpread: 26 }, // soft deep violet
      { hue: -60,  saturation: 1.25, colorSpread: 34 }, // bright coral-magenta
    ],
  },
  playful: {
    valence: 0.65, arousal: 0.85, size: 0.72, hue: -80, saturation: 1.0, colorSpread: 50, intensity: 0.75,
    colorPalettes: [
      { hue: -80,  saturation: 1.0,  colorSpread: 50 }, // violet-purple
      { hue: -20,  saturation: 1.4,  colorSpread: 58 }, // VIVID bubblegum pink
      { hue: 130,  saturation: 1.15, colorSpread: 52 }, // vivid lime-teal
      { hue: -145, saturation: 0.65, colorSpread: 46 }, // soft deep magenta
    ],
  },
  surprised: {
    valence: 0.4, arousal: 0.95, size: 0.74, hue: 45, saturation: 0.95, colorSpread: 40, intensity: 0.9,
    colorPalettes: [
      { hue: 45,  saturation: 0.95, colorSpread: 40 }, // golden
      { hue: 120, saturation: 1.4,  colorSpread: 46 }, // VIVID bright green
      { hue: -30, saturation: 1.15, colorSpread: 44 }, // vivid electric purple
      { hue: 170, saturation: 0.6,  colorSpread: 36 }, // soft aqua
    ],
  },
  curious: {
    valence: 0.35, arousal: 0.55, size: 0.62, hue: 160, saturation: 0.88, colorSpread: 35, intensity: 0.5,
    colorPalettes: [
      { hue: 160, saturation: 0.88, colorSpread: 35 }, // teal
      { hue: 90,  saturation: 1.2,  colorSpread: 40 }, // vivid green
      { hue: 220, saturation: 0.55, colorSpread: 28 }, // soft azure-blue
      { hue: 25,  saturation: 1.05, colorSpread: 38 }, // warm amber
    ],
  },

  // ── Neutral: noticeable sat swings so even calm looks different each cycle ────
  calm: {
    valence: 0.15, arousal: 0.18, size: 0.52, hue: 25, saturation: 0.6, colorSpread: 15, intensity: 0.25,
    colorPalettes: [
      { hue: 25,  saturation: 0.6,  colorSpread: 15 }, // warm sand
      { hue: -55, saturation: 0.85, colorSpread: 20 }, // cooler, more colourful blue
      { hue: 85,  saturation: 0.4,  colorSpread: 12 }, // very soft sage
    ],
  },

  // ── Negative: wider sat swings, stay moody ────────────────────────────────────
  angry: {
    valence: -0.8, arousal: 0.9, size: 0.26, hue: -120, saturation: 0.55, colorSpread: 10, intensity: 0.95,
    colorPalettes: [
      { hue: -120, saturation: 0.55, colorSpread: 10 }, // dark crimson
      { hue: -160, saturation: 0.75, colorSpread: 14 }, // deeper vivid burgundy
      { hue: -80,  saturation: 0.4,  colorSpread: 8  }, // muted burnt orange
    ],
  },
  disgusted: {
    valence: -0.85, arousal: 0.35, size: 0.28, hue: 140, saturation: 0.45, colorSpread: 15, intensity: 0.6,
    colorPalettes: [
      { hue: 140, saturation: 0.45, colorSpread: 15 }, // murky olive
      { hue: 90,  saturation: 0.65, colorSpread: 12 }, // vivid sickly green
      { hue: 185, saturation: 0.3,  colorSpread: 14 }, // very muted swamp teal
    ],
  },
  contemptuous: {
    valence: -0.95, arousal: 0.22, size: 0.26, hue: -90, saturation: 0.28, colorSpread: 8, intensity: 0.5,
    colorPalettes: [
      { hue: -90,  saturation: 0.28, colorSpread: 8  }, // cold grey-purple
      { hue: -50,  saturation: 0.45, colorSpread: 12 }, // slightly warmer, more colour
      { hue: -135, saturation: 0.18, colorSpread: 6  }, // very cold, near-grey
    ],
  },
  anxious: {
    valence: -0.45, arousal: 0.82, size: 0.32, hue: -45, saturation: 0.5, colorSpread: 20, intensity: 0.75,
    colorPalettes: [
      { hue: -45,  saturation: 0.5,  colorSpread: 20 }, // murky violet
      { hue: -100, saturation: 0.7,  colorSpread: 18 }, // more vivid cold blue
      { hue: 5,    saturation: 0.35, colorSpread: 24 }, // muted sickly green
    ],
  },

  // ── Very muted: saturation is the primary variable since hue barely reads ─────
  sad: {
    valence: -0.6, arousal: 0.1, size: 0.36, hue: -10, saturation: 0.2, colorSpread: 8, intensity: 0.45,
    colorPalettes: [
      { hue: -10, saturation: 0.2,  colorSpread: 8  }, // washed blue-grey
      { hue: 35,  saturation: 0.38, colorSpread: 12 }, // faint warm blush (more colour)
      { hue: -60, saturation: 0.15, colorSpread: 6  }, // very cold, nearly grey
    ],
  },
  fearful: {
    valence: -0.7, arousal: 0.6, size: 0.09, hue: -5, saturation: 0.08, colorSpread: 5, intensity: 0.85,
    colorPalettes: [
      { hue: -5,  saturation: 0.08, colorSpread: 5 }, // near-greyscale
      { hue: 45,  saturation: 0.2,  colorSpread: 4 }, // faint warm tinge (more visible)
      { hue: -55, saturation: 0.16, colorSpread: 6 }, // faint cold tinge (more visible)
    ],
  },
  shy: {
    valence: -0.35, arousal: 0.07, size: 0.07, hue: -25, saturation: 0.06, colorSpread: 5, intensity: 0.2,
    colorPalettes: [
      { hue: -25, saturation: 0.06, colorSpread: 5 }, // barely-there
      { hue: 25,  saturation: 0.18, colorSpread: 4 }, // faint warmth (tripled sat)
      { hue: -75, saturation: 0.14, colorSpread: 6 }, // faint cool (doubled sat)
    ],
  },
};
