/**
 * Client-side persistence layer for Nour's emotional state.
 *
 * All data is stored as JSON in localStorage under the key `orb_memory`.
 * The schema (OrbMemory) captures:
 *   - Full message history (capped at 50 entries)
 *   - A weighted rolling mood average across the last 8 messages
 *   - A relationship score (-1 to 1) updated incrementally per interaction
 *   - Trauma level (0 – 1.5) and love count (0+), persisted across sessions
 *   - A permanent death flag (isDead) that survives page reloads
 *
 * Constructor automatically updates `lastSeen` on every visit. Storage errors
 * (quota exceeded, Safari private-mode restrictions) are caught and silently
 * ignored so the experience continues in-memory.
 */
import type { EmotionAnalysis, OrbMemory, StoredMessage } from './types';
import { DEFAULT_EMOTION } from './types';

const STORAGE_KEY = 'orb_memory';
const MAX_MESSAGES = 50;

function generateId(): string {
  return crypto.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createFreshMemory(): OrbMemory {
  const now = Date.now();
  return {
    visitorId: generateId(),
    messages: [],
    currentMood: { ...DEFAULT_EMOTION },
    relationship: 0,
    totalInteractions: 0,
    firstSeen: now,
    lastSeen: now,
  };
}

export class Memory {
  private data: OrbMemory;

  constructor() {
    this.data = this.load();
    this.data.lastSeen = Date.now();
    this.save();
  }

  private load(): OrbMemory {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as OrbMemory;
    } catch { /* corrupted data, start fresh */ }
    return createFreshMemory();
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch { /* storage full, silently fail */ }
  }

  addMessage(text: string, emotion: EmotionAnalysis) {
    this.data.messages.push({ text, emotion, timestamp: Date.now() });
    if (this.data.messages.length > MAX_MESSAGES) {
      this.data.messages = this.data.messages.slice(-MAX_MESSAGES);
    }
    this.data.totalInteractions++;
    this.data.lastSeen = Date.now();
    this.updateRelationship(emotion);
    this.updateMood();
    this.save();
  }

  private updateRelationship(emotion: EmotionAnalysis) {
    const delta = emotion.valence * emotion.intensity * 0.1;
    this.data.relationship = Math.max(-1, Math.min(1,
      this.data.relationship + delta
    ));
  }

  private updateMood() {
    const recent = this.data.messages.slice(-8);
    if (recent.length === 0) return;

    let totalWeight = 0;
    let v = 0, a = 0, d = 0, i = 0;
    recent.forEach((m, idx) => {
      const w = idx + 1; // more recent = higher weight
      v += m.emotion.valence * w;
      a += m.emotion.arousal * w;
      d += m.emotion.dominance * w;
      i += m.emotion.intensity * w;
      totalWeight += w;
    });

    this.data.currentMood = {
      emotion: recent[recent.length - 1].emotion.emotion,
      valence: v / totalWeight,
      arousal: a / totalWeight,
      dominance: d / totalWeight,
      intensity: i / totalWeight,
    };
  }

  getMessages(): StoredMessage[] {
    return this.data.messages;
  }

  getRelationship(): number {
    return this.data.relationship;
  }

  getCurrentMood(): EmotionAnalysis {
    return this.data.currentMood;
  }

  getTotalInteractions(): number {
    return this.data.totalInteractions;
  }

  getIsDead(): boolean {
    return this.data.isDead === true;
  }

  markDead() {
    this.data.isDead = true;
    this.save();
  }

  getTraumaLevel(): number | undefined {
    return this.data.traumaLevel;
  }

  setTraumaLevel(level: number) {
    this.data.traumaLevel = level;
    this.save();
  }

  getLoveCount(): number {
    return this.data.loveCount ?? 0;
  }

  incrementLoveCount() {
    this.data.loveCount = (this.data.loveCount ?? 0) + 1;
    this.save();
  }

  resetLoveCount() {
    this.data.loveCount = 0;
    this.save();
  }
}
