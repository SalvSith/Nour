import { useEffect, useRef, useState, useCallback } from 'react';
import { stagger, useAnimate } from 'motion/react';

const LETTER_DURATION = 0.75;
const LETTER_STAGGER = 0.04;
const DUST_DURATION = 0.55;
const DUST_STAGGER = 0.03;
const HOLD_MS = 1600;
const GAP_MS = 500;
const INITIAL_DELAY_MS = 500;
const SOUND_GAIN = 0.12;

const EASE_ENTER: [number, number, number, number] = [0.16, 1, 0.3, 1];
const EASE_DUST: [number, number, number, number] = [0.4, 0, 1, 1];

const MESSAGES: { text: string; holdMs?: number; letterDuration?: number; dustDuration?: number }[] = [
  { text: "Hihiiii, I'm Nour.." },
  { text: "And I'm not just an orb.." },
  { text: "Wiwiwiwi!", holdMs: 600, letterDuration: 0.2, dustDuration: 0.3 },
];

// Sound sprite [startMs, durationMs] — key-down slices from sound.ogg
const SOUND_DEFINES: Record<string, [number, number]> = {
  KeyA: [31542, 85],  KeyB: [40621, 107], KeyC: [39632, 95],  KeyD: [32492, 85],
  KeyE: [23317, 83],  KeyF: [32973, 87],  KeyG: [33453, 94],  KeyH: [33986, 93],
  KeyI: [25795, 91],  KeyJ: [34425, 88],  KeyK: [34932, 90],  KeyL: [35410, 95],
  KeyM: [41610, 93],  KeyN: [41103, 90],  KeyO: [26309, 84],  KeyP: [26804, 83],
  KeyQ: [22245, 95],  KeyR: [23817, 92],  KeyS: [32031, 88],  KeyT: [24297, 92],
  KeyU: [25313, 95],  KeyV: [40136, 94],  KeyW: [22790, 89],  KeyX: [39148, 76],
  KeyY: [24811, 93],  KeyZ: [38694, 80],
  Period:  [42594, 90], Comma: [42110, 92], Quote:  [36428, 87],
  Digit1:  [12946, 96], Slash: [43105, 95],
};

function charToKeyCode(char: string): string | null {
  const c = char.toLowerCase();
  if (c >= 'a' && c <= 'z') return `Key${c.toUpperCase()}`;
  if (c === '.') return 'Period';
  if (c === ',') return 'Comma';
  if (c === "'") return 'Quote';
  if (c === '!') return 'Digit1';
  if (c === '?') return 'Slash';
  return null;
}

const WIND_GAIN = 1.0;

function useIntroSound() {
  const ctxRef     = useRef<AudioContext | null>(null);
  const keyBufRef  = useRef<AudioBuffer | null>(null);
  const windBufRef = useRef<AudioBuffer | null>(null);
  const [keyReady, setKeyReady] = useState(false);

  useEffect(() => {
    let ctx: AudioContext;
    try { ctx = new AudioContext(); } catch { return; }
    ctxRef.current = ctx;

    const decode = (url: string) =>
      fetch(url)
        .then(r => r.ok ? r.arrayBuffer() : Promise.reject())
        .then(ab => ctx.decodeAudioData(ab))
        .catch(() => null);

    decode('/Sounds/sound.ogg').then(b => {
      if (b) { keyBufRef.current = b; setKeyReady(true); }
    });
    decode('/Sounds/LetterWind.mp3').then(b => { if (b) windBufRef.current = b; });

    // Delay close so any playing wind clip finishes before the context shuts down
    return () => { setTimeout(() => ctx.close(), 5000); };
  }, []);

  // Ensure context is running before playing — returns a Promise
  const ensureRunning = () => {
    const ctx = ctxRef.current;
    if (!ctx) return Promise.reject();
    if (ctx.state === 'running') return Promise.resolve(ctx);
    return ctx.resume().then(() => ctx);
  };

  const playKey = useCallback((keyCode: string) => {
    const buf = keyBufRef.current;
    if (!buf) return;
    const def = SOUND_DEFINES[keyCode];
    if (!def) return;
    ensureRunning().then(ctx => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.value = SOUND_GAIN;
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start(0, def[0] / 1000, def[1] / 1000);
    }).catch(() => {});
  }, []);

  const playWind = useCallback(() => {
    const tryPlay = (attemptsLeft: number) => {
      const buf = windBufRef.current;
      if (!buf) {
        // Buffer not decoded yet — retry up to 5× with 200ms gaps
        if (attemptsLeft > 0) setTimeout(() => tryPlay(attemptsLeft - 1), 200);
        return;
      }
      ensureRunning().then(ctx => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const gain = ctx.createGain();
        gain.gain.value = WIND_GAIN;
        src.connect(gain);
        gain.connect(ctx.destination);
        // Play the full clip — no fade ramp so it never gets cut short
        src.start(0);
      }).catch(() => {});
    };
    tryPlay(5);
  }, []);

  return { playKey, playWind, keyReady };
}

function countLetters(text: string) {
  return text.replace(/ /g, '').length;
}

function TextReveal({
  words,
  isActive,
  onDone,
  holdMs = HOLD_MS,
  letterDuration = LETTER_DURATION,
  dustDuration = DUST_DURATION,
  playKey,
  playWind,
}: {
  words: string;
  isActive: boolean;
  onDone: () => void;
  holdMs?: number;
  letterDuration?: number;
  dustDuration?: number;
  playKey: (keyCode: string) => void;
  playWind: () => void;
}) {
  const [scope, animate] = useAnimate();
  const didRun = useRef(false);
  const totalLetters = countLetters(words);
  const soundTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!isActive || didRun.current) return;
    didRun.current = true;

    const inMs = (totalLetters - 1) * LETTER_STAGGER * 1000 + letterDuration * 1000;
    const outMs = (totalLetters - 1) * DUST_STAGGER * 1000 + dustDuration * 1000;

    // Schedule a key sound for each letter timed to its animation start
    const chars = words.replace(/ /g, '').split('');
    chars.forEach((char, i) => {
      const t = setTimeout(() => {
        const kc = charToKeyCode(char);
        if (kc) playKey(kc);
      }, i * LETTER_STAGGER * 1000);
      soundTimers.current.push(t);
    });

    animate(
      '.ltr',
      { opacity: 1, filter: 'blur(0px)', y: 0 },
      { duration: letterDuration, delay: stagger(LETTER_STAGGER), ease: EASE_ENTER },
    );

    const exitTimer = setTimeout(() => {
      playWind();
      const letters = scope.current?.querySelectorAll('.ltr') ?? [];
      letters.forEach((el: Element, i: number) => {
        const dx = (Math.random() - 0.5) * 36;
        const dy = -(Math.random() * 22 + 4);
        const blurPx = 5 + Math.random() * 6;
        animate(
          el as HTMLElement,
          { opacity: 0, filter: `blur(${blurPx}px)`, x: dx, y: dy },
          { duration: dustDuration, delay: i * DUST_STAGGER, ease: EASE_DUST },
        );
      });
    }, inMs + holdMs);

    const doneTimer = setTimeout(onDone, inMs + holdMs + outMs + 60);

    return () => {
      soundTimers.current.forEach(clearTimeout);
      soundTimers.current = [];
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [isActive]);

  const wordsArray = words.split(' ');

  return (
    <div
      ref={scope}
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        whiteSpace: 'nowrap',
        visibility: isActive ? 'visible' : 'hidden',
      }}
    >
      {wordsArray.map((word, wi) => (
        <span
          key={wi}
          style={{
            display: 'inline-block',
            marginRight: wi < wordsArray.length - 1 ? '0.38em' : 0,
          }}
        >
          {word.split('').map((char, ci) => (
            <span
              key={ci}
              className="ltr"
              style={{
                display: 'inline-block',
                opacity: 0,
                filter: 'blur(6px)',
                transform: 'translateY(9px)',
              }}
            >
              {char}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}

function LoadingDots() {
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
      whiteSpace: 'nowrap',
      letterSpacing: '0.3em',
    }}>
      {'.'.repeat(dots)}
    </div>
  );
}

export default function IntroSequence({ onComplete }: { onComplete: () => void }) {
  const [msgIndex, setMsgIndex] = useState(-1);
  const { playKey, playWind, keyReady } = useIntroSound();
  const [dotsReady, setDotsReady] = useState(false);

  // Show dots for at least one full . .. ... cycle before starting
  useEffect(() => {
    const t = setTimeout(() => setDotsReady(true), 1500);
    return () => clearTimeout(t);
  }, []);

  // Start once both the audio buffer is decoded AND the dots have cycled once
  useEffect(() => {
    if (!keyReady || !dotsReady) return;
    const t = setTimeout(() => setMsgIndex(0), INITIAL_DELAY_MS);
    return () => clearTimeout(t);
  }, [keyReady, dotsReady]);

  const handleDone = useCallback(() => {
    if (msgIndex < MESSAGES.length - 1) {
      setTimeout(() => setMsgIndex((i) => i + 1), GAP_MS);
    } else {
      onComplete();
    }
  }, [msgIndex, onComplete]);

  return (
    <>
      <style>{`
        .intro-wrap {
          position: fixed;
          inset: 0;
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
        }
        .intro-stage {
          position: relative;
          width: 100%;
          height: 3em;
          color: #fff;
          font-family: "Cormorant Garamond", Georgia, serif;
          font-weight: 200;
          font-size: clamp(1.5rem, 5.5vw, 1.8rem);
          letter-spacing: 0.08em;
          text-shadow:
            0 0 12px rgba(255,255,255,0.25),
            0 0 35px rgba(255,255,255,0.08),
            0 0 70px rgba(255,255,255,0.04);
          text-align: center;
        }
        @media (max-width: 768px) {
          .intro-wrap {
            transform: translateY(-10vh);
          }
        }
      `}</style>
      <div className="intro-wrap">
        <div className="intro-stage">
          {msgIndex === -1 && <LoadingDots />}
          {MESSAGES.map((msg, i) => (
            <TextReveal
              key={i}
              words={msg.text}
              isActive={msgIndex === i}
              onDone={handleDone}
              holdMs={msg.holdMs}
              letterDuration={msg.letterDuration}
              dustDuration={msg.dustDuration}
              playKey={playKey}
              playWind={playWind}
            />
          ))}
        </div>
      </div>
    </>
  );
}
