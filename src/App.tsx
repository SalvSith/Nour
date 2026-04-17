import { useCallback, useEffect, useRef, useState } from 'react';
import { useWakeLock } from './useWakeLock';
import Orb, { type GameBlobInfo } from './Orb';
import LavaLampGame from './LavaLampGame';
import { AudioCapture } from './audioCapture';
import { ApiClient, warmupApi } from './apiClient';
import { EmotionEngine } from './emotionEngine';
import { Memory } from './memory';
import { getMicStream, isMicStreamAlive, releaseMicStream } from './micStream';
import IntroSequence from './IntroSequence';
import { SoundManager } from './soundManager';
import {
  SHOW_TRANSCRIPTION_DEBUG,
  TranscriptionDebugPanel,
  type TranscriptEntry,
} from './transcriptionDebug';
import type { EmotionUniforms } from './types';

const NEGLECT_TIMEOUT_MS = 10 * 60 * 1000;
const SESSION_MAX_MS = 15 * 60 * 1000;

const WARM_KEYWORDS = ['love', 'family', 'gorgeous', 'beautiful', 'adore', 'cherish'];
const LOVE_KEYWORDS = ['love', 'adore', 'cherish'];

function containsWarmKeyword(text: string): boolean {
  return WARM_KEYWORDS.some((kw) => new RegExp(`\\b${kw}`, 'i').test(text));
}

function containsLoveKeyword(text: string): boolean {
  return LOVE_KEYWORDS.some((kw) => new RegExp(`\\b${kw}`, 'i').test(text));
}

function containsWiwiPattern(text: string): boolean {
  const clean = text.toLowerCase().replace(/[^a-z]/g, '');
  if (clean.length < 4) return false;
  const stripped = clean.replace(/w[ie]+/g, '');
  return stripped.length <= clean.length * 0.2;
}

const TRICK_PHRASES = [
  /\btricks?\b/i,
  /\bdance\b/i,
  /\bspin\b/i,
  /\bperform\b/i,
  /\bshow\s+off\b/i,
  /\bshow\s+me\s+(something|what)\b/i,
  /\bwhat\s+can\s+you\s+do\b/i,
  /\bdo\s+something\s+(cool|fun|special|awesome|amazing)\b/i,
  /\bimpress\s+me\b/i,
  /\bsurprise\s+me\b/i,
  /\bdo\s+a\s+(flip|spin|move|dance|trick)\b/i,
  /\bshow\s+(me\s+)?your\s+(moves?|skills?|tricks?)\b/i,
  /\bgo\s+(crazy|wild|nuts)\b/i,
];
function containsTrickKeyword(text: string): boolean {
  return TRICK_PHRASES.some((re) => re.test(text));
}

const GAME_TRIGGERS = ['play a game', "let's play", 'start a game'];
function containsGameTrigger(text: string): boolean {
  const lower = text.toLowerCase();
  return GAME_TRIGGERS.some(t => lower.includes(t));
}

const NUM_TRICKS = 5;
const NEGLECT_CHECK_MS = 1000;
const DEATH_FADE_MS = 3000;
const BOOT_FADE_MS = 2000;

function BootLoadingDots() {
  const [dots, setDots] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setDots(d => d === 3 ? 1 : d + 1), 500);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{
      position: 'absolute',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      color: '#fff',
      fontFamily: '"Cormorant Garamond", Georgia, serif',
      fontWeight: 200,
      fontSize: 'clamp(1.5rem, 5.5vw, 1.8rem)',
      letterSpacing: '0.3em',
      whiteSpace: 'nowrap',
      textShadow: '0 0 12px rgba(255,255,255,0.25), 0 0 35px rgba(255,255,255,0.08)',
    }}>
      {'.'.repeat(dots)}
    </div>
  );
}

export default function App() {
  // Dev bypass: ?test=1 skips mic requirement for shader testing
  const devTest = import.meta.env.DEV && new URLSearchParams(location.search).get('test') === '1';
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [isDead, setIsDead] = useState(false);
  const [isFading, setIsFading] = useState(false);
  const [bootPhase, setBootPhase] = useState<'black' | 'fading' | 'done'>(devTest ? 'done' : 'black');
  const [showIntro, setShowIntro] = useState(() => {
    if (devTest) return false;
    try { return localStorage.getItem('nour_intro_seen') !== 'true'; }
    catch { return false; }
  });
  const [micReady, setMicReady] = useState(devTest);
  const [micDenied, setMicDenied] = useState(false);
  const [soundsReady, setSoundsReady] = useState(false);
  const [orbVisible, setOrbVisible] = useState(devTest);
  useWakeLock(orbVisible);
  const [isEuphoric, setIsEuphoric] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [warmPulseTrigger, setWarmPulseTrigger] = useState(0);
  const [trickTrigger, setTrickTrigger] = useState(0);
  const [activeTrickIndex, setActiveTrickIndex] = useState(0);
  const [isGameMode, setIsGameMode] = useState(false);
  const [emotionUniforms, setEmotionUniforms] = useState<EmotionUniforms>({
    valence: 0,
    arousal: 0.3,
    size: 0.55,
    hue: 0,
    saturation: 0.6,
    colorSpread: 15,
    opacity: 1.0,
    intensity: 0.3,
  });

  const captureRef = useRef<AudioCapture | null>(null);
  const wsRef = useRef<ApiClient | null>(null);
  const engineRef = useRef<EmotionEngine | null>(null);
  const memoryRef = useRef<Memory | null>(null);
  const soundManagerRef = useRef<SoundManager | null>(null);
  const lastSpeechRef = useRef(Date.now());
  const deadRef = useRef(false);
  const orbVisibleRef = useRef(false);
  const trickCycleRef = useRef(0);
  const gameModeRef = useRef(false);
  const gameBlobsRef = useRef<GameBlobInfo[]>([]);
  const gameSurfaceYRef = useRef<number>(0.36);
  const transcriptIdRef = useRef(0);
  const [transcriptDebugEntries, setTranscriptDebugEntries] = useState<TranscriptEntry[]>([]);

  const fadeIn = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setBootPhase('fading');
        setOrbVisible(true);
        orbVisibleRef.current = true;
        soundManagerRef.current?.startAmbient();
        setTimeout(() => setBootPhase('done'), BOOT_FADE_MS + 50);
      });
    });
  }, []);

  const handleIntroComplete = useCallback(() => {
    try { localStorage.setItem('nour_intro_seen', 'true'); } catch {}
    setShowIntro(false);
    // fadeIn is handled by the effect below, which also waits for soundsReady.
  }, []);

  useEffect(() => {
    // Wake the Supabase Edge Function in the background on mobile so the
    // cold start happens during the loading screen, not on first utterance.
    if (navigator.maxTouchPoints > 0) warmupApi();

    const memory = new Memory();
    memoryRef.current = memory;

    if (memory.getIsDead()) {
      deadRef.current = true;
      setIsDead(true);
      fadeIn();
      return;
    }

    const soundMgr = new SoundManager();
    soundManagerRef.current = soundMgr;
    soundMgr.ready.then(() => setSoundsReady(true));

    const engine = new EmotionEngine(
      memory.getCurrentMood(),
      memory.getRelationship(),
      memory.getTraumaLevel(),
    );
    const isMobile = navigator.maxTouchPoints > 0;
    const ws = new ApiClient();
    const capture = new AudioCapture({ mobile: isMobile });

    engineRef.current = engine;
    wsRef.current = ws;
    captureRef.current = capture;

    setEmotionUniforms(engine.getUniforms());

    const triggerDeath = () => {
      if (deadRef.current) return;
      deadRef.current = true;
      memory.setTraumaLevel(engine.getTraumaLevel());
      memory.markDead();
      soundMgr.playDying();
      capture.destroy();
      ws.destroy();
      setEmotionUniforms(engine.getUniforms());
      setIsFading(true);
      setTimeout(() => {
        releaseMicStream();
        setMicStream(null);
        setIsDead(true);
      }, DEATH_FADE_MS);
    };

    // Check euphoric state on initial load (persisted love count)
    const checkEuphoric = (mem: typeof memory) => {
      return mem.getLoveCount() >= 3;
    };
    if (checkEuphoric(memory)) setIsEuphoric(true);

    ws.connect((text, emotion) => {
      if (deadRef.current) return;

      if (SHOW_TRANSCRIPTION_DEBUG) {
        const id = transcriptIdRef.current++;
        setTranscriptDebugEntries((prev) =>
          [...prev, { id, text, at: Date.now() }].slice(-40),
        );
      }

      if (containsGameTrigger(text)) {
        gameModeRef.current = true;
        setIsGameMode(true);
        lastSpeechRef.current = Date.now();
        soundManagerRef.current?.playGameStart();
        return;
      }

      if (containsWiwiPattern(text) || containsTrickKeyword(text)) {
        // Pick a random trick, but avoid repeating the same one twice in a row
        let idx: number;
        do {
          idx = Math.floor(Math.random() * NUM_TRICKS);
        } while (NUM_TRICKS > 1 && idx === trickCycleRef.current);
        trickCycleRef.current = idx;
        setActiveTrickIndex(idx);
        setTrickTrigger((n) => n + 1);
        if (orbVisibleRef.current) soundMgr.playTrick(idx);
        lastSpeechRef.current = Date.now();
        return;
      }

      // Guard: a small LLM can occasionally flip "I love you" → isLethal (confusing it
      // with "I hate you" which is structurally similar). Never let a positive or loving
      // emotion trigger death, regardless of what the model returned.
      if (emotion.valence > 0 || emotion.emotion === 'loving') {
        emotion.isLethal = false;
      }
      const isWarmKeyword = containsWarmKeyword(text);
      if (isWarmKeyword) {
        setWarmPulseTrigger((n) => n + 1);
      }
      memory.addMessage(text, emotion);
      // Only genuine love expressions (not family/gorgeous/etc.) count toward vibrant mode.
      // Require the love keyword in the transcript and a positive valence — the LLM doesn't
      // always return 'loving' for "I love you" (it may say 'happy' or 'excited'), so we
      // can't gate on the emotion label alone.
      if (containsLoveKeyword(text) && emotion.valence > 0.4) {
        memory.incrementLoveCount();
      } else if (emotion.valence < -0.25) {
        // Negative feelings shatter the love — has to be rebuilt from zero
        memory.resetLoveCount();
      }
      setIsEuphoric(checkEuphoric(memory));
      const { uniforms } = engine.setEmotion(emotion);
      memory.setTraumaLevel(engine.getTraumaLevel());
      if (orbVisibleRef.current) {
        soundMgr.playForEmotion(emotion.emotion, engine.getTraumaLevel());
      }
      setEmotionUniforms(uniforms);
      if (engine.isDead()) triggerDeath();
    });

    const skipMic = import.meta.env.DEV && new URLSearchParams(location.search).get('test') === '1';
    if (!skipMic) {
      getMicStream()
        .then((stream) => {
          // Attempt AudioContext unlock while still close to the getUserMedia
          // gesture — helps first-time users on iOS where the mic permission
          // tap is the only user gesture before the orb appears.
          soundMgr.tryResume();
          setMicReady(true);
          if (deadRef.current) return;
          setMicStream(stream);
          capture.init(stream, (blob, mimeType) => {
            if (deadRef.current) return;
            lastSpeechRef.current = Date.now();
            ws.sendAudio(blob, memory.getMessages(), mimeType);
          });
        })
        .catch(() => { setMicDenied(true); setMicReady(true); });
    }

    const neglectInterval = setInterval(() => {
      if (deadRef.current || gameModeRef.current) return;
      const elapsed = Date.now() - lastSpeechRef.current;
      if (elapsed > NEGLECT_TIMEOUT_MS) {
        engine.applyNeglect(NEGLECT_CHECK_MS / 1000);
        memory.setTraumaLevel(engine.getTraumaLevel());
        setEmotionUniforms(engine.getUniforms());
        soundMgr.playTraumaSound(engine.getTraumaLevel());
        if (engine.isDead()) triggerDeath();
      }
    }, NEGLECT_CHECK_MS);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        capture.pause();
      } else {
        if (!isMicStreamAlive()) {
          releaseMicStream();
          getMicStream()
            .then((newStream) => {
              setMicStream(newStream);
              capture.init(newStream, (blob, mimeType) => {
                if (deadRef.current) return;
                lastSpeechRef.current = Date.now();
                ws.sendAudio(blob, memory.getMessages(), mimeType);
              });
              capture.resume();
            })
            .catch(() => {});
        } else {
          capture.resume();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const sessionTimeout = setTimeout(() => {
      if (deadRef.current) return;
      capture.destroy();
      ws.destroy();
      releaseMicStream();
      setMicStream(null);
      setSessionExpired(true);
    }, SESSION_MAX_MS);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(neglectInterval);
      clearTimeout(sessionTimeout);
      soundMgr.destroy();
      capture.destroy();
      ws.destroy();
      releaseMicStream();
    };
  }, []);

  // Hold the black screen until the intro is done, mic is ready, and enough
  // sounds are loaded. Applies to both first-time and returning visitors.
  useEffect(() => {
    const skipMic = import.meta.env.DEV && new URLSearchParams(location.search).get('test') === '1';
    if (!showIntro && micReady && (soundsReady || skipMic) && bootPhase === 'black') {
      fadeIn();
    }
  }, [micReady, soundsReady, showIntro, bootPhase, fadeIn]);

  useEffect(() => {
    const PALETTE_CYCLE_MS = 15_000;
    const timer = setInterval(() => {
      if (deadRef.current) return;
      const engine = engineRef.current;
      if (!engine) return;
      setEmotionUniforms(engine.cycleColorPalette());
    }, PALETTE_CYCLE_MS);
    return () => clearInterval(timer);
  }, []); // persistent — never restarts; cycleColorPalette() resets to palette 0 via setEmotion()

  const handleAudioLevel = useCallback((level: number) => {
    captureRef.current?.feedLevel(level);
  }, []);

  const handleMicRetry = useCallback(() => {
    getMicStream()
      .then((stream) => {
        setMicDenied(false);
        setMicStream(stream);
        captureRef.current?.init(stream, (blob, mimeType) => {
          if (deadRef.current) return;
          lastSpeechRef.current = Date.now();
          wsRef.current?.sendAudio(blob, memoryRef.current?.getMessages() ?? [], mimeType);
        });
      })
      .catch(() => {});
  }, []);

  if (micDenied) {
    return (
      <div
        onClick={handleMicRetry}
        style={{
          position: 'fixed',
          inset: 0,
          background: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 99999,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="52"
            height="52"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#2e2e2e"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          <span style={{
            fontFamily: '"Cormorant Garamond", Georgia, serif',
            fontWeight: 200,
            fontSize: '0.7rem',
            letterSpacing: '0.18em',
            color: '#2e2e2e',
            textTransform: 'uppercase',
          }}>
            Unmute Mic
          </span>
        </div>
      </div>
    );
  }

  const bootOverlay = bootPhase !== 'done' && (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: '#000',
      zIndex: 9999,
      opacity: bootPhase === 'black' ? 1 : 0,
      transition: `opacity ${BOOT_FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
      pointerEvents: 'none',
    }}>
      {bootPhase === 'black' && !showIntro && <BootLoadingDots />}
    </div>
  );

  if (sessionExpired) {
    return <div style={{ width: '100vw', height: '100vh', background: '#000' }} />;
  }

  if (isDead) {
    return (
      <>
        <div style={{ width: '100vw', height: '100vh', background: '#000' }} />
        {bootOverlay}
      </>
    );
  }

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .orb-shift { transform: translateY(-10vh); }
        }
      `}</style>
      <div style={{
        width: '100vw',
        height: '100vh',
        background: '#000',
        opacity: isFading ? 0 : orbVisible ? 1 : 0,
        transform: orbVisible ? 'scale(1)' : 'scale(0.88)',
        transition: isFading
          ? `opacity ${DEATH_FADE_MS}ms ease-out`
          : orbVisible
            ? 'opacity 2200ms ease-out, transform 2600ms cubic-bezier(0.16, 1, 0.3, 1)'
            : undefined,
      }}>
        <div className="orb-shift" style={{ width: '100%', height: '100%' }}>
          <Orb
            micStream={micStream}
            emotionUniforms={emotionUniforms}
            onAudioLevel={handleAudioLevel}
            euphoric={isEuphoric}
            warmPulseTrigger={warmPulseTrigger}
            trickTrigger={trickTrigger}
            trickIndex={activeTrickIndex}
            soundManager={soundManagerRef.current}
            gameMode={isGameMode}
            gameBlobsRef={gameBlobsRef}
            gameSurfaceYRef={gameSurfaceYRef}
          />
        </div>
      </div>
      {isGameMode && orbVisible && (
        <LavaLampGame
          onGameEnd={() => {
            gameModeRef.current = false;
            setIsGameMode(false);
            lastSpeechRef.current = Date.now();
          }}
          soundManager={soundManagerRef.current}
          gameBlobsRef={gameBlobsRef}
          gameSurfaceYRef={gameSurfaceYRef}
        />
      )}
      {bootOverlay}
      {showIntro && micReady && <IntroSequence onComplete={handleIntroComplete} />}
      {SHOW_TRANSCRIPTION_DEBUG && (
        <TranscriptionDebugPanel entries={transcriptDebugEntries} />
      )}
    </>
  );
}
