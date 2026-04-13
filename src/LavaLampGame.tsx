import { useEffect, useRef, useCallback } from 'react';
import type { SoundManager } from './soundManager';
import type { GameBlobInfo } from './Orb';

interface GameBlobInternal {
  id: number;
  x: number;
  y: number;
  r: number;
  vy: number;
  wobblePhase: number;
  wobbleFreq: number;
  wobbleAmp: number;
  scale: number;
  popping: boolean;
  popProgress: number;
}

interface LavaLampGameProps {
  onGameEnd: () => void;
  soundManager: SoundManager | null;
  gameBlobsRef: React.MutableRefObject<GameBlobInfo[]>;
  gameSurfaceYRef?: React.MutableRefObject<number>;
}

const MAX_ACTIVE = 8;
const SPAWN_Y = 0.36;

/** Tiered radii (viewport-normalized) so blobs read as small / medium / large, not one mushy size. */
function randomBlobRadius(): number {
  const t = Math.random();
  if (t < 0.30) {
    return 0.014 + Math.random() * 0.012; // small
  }
  if (t < 0.65) {
    return 0.026 + Math.random() * 0.020; // medium
  }
  return 0.046 + Math.random() * 0.028; // large
}
const BASE_SPEED = 0.050;
const SPEED_INC = 0.004;
const MAX_SPEED = 0.24;
const INIT_SPAWN_MS = 2200;
const MIN_SPAWN_MS = 380;
const SPAWN_DEC = 55;
const POP_DUR = 0.22;
const TOP_EDGE = 0.03;
const EXIT_DELAY_MS = 700;

export default function LavaLampGame({ onGameEnd, soundManager, gameBlobsRef, gameSurfaceYRef }: LavaLampGameProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({
    blobs: [] as GameBlobInternal[],
    score: 0,
    nextId: 0,
    lastSpawn: 0,
    gameOver: false,
    startTime: 0,
    exiting: false,
  });
  const soundManagerRef = useRef(soundManager);
  const onGameEndRef = useRef(onGameEnd);

  soundManagerRef.current = soundManager;
  onGameEndRef.current = onGameEnd;

  const getSpawnMs = useCallback((score: number) =>
    Math.max(MIN_SPAWN_MS, INIT_SPAWN_MS - score * SPAWN_DEC), []);

  const getBlobSpeed = useCallback((score: number) =>
    Math.min(MAX_SPEED, BASE_SPEED + score * SPEED_INC), []);

  useEffect(() => {
    const state = stateRef.current;
    state.blobs = [];
    state.score = 0;
    state.nextId = 0;
    state.lastSpawn = 0;
    state.gameOver = false;
    state.startTime = 0;
    state.exiting = false;
    gameBlobsRef.current = [];

    let rafId: number;
    let lastT = 0;

    function spawn(time: number) {
      const active = state.blobs.filter(b => !b.popping).length;
      if (active >= MAX_ACTIVE) return;
      const speed = getBlobSpeed(state.score);
      // Spawn just below the orb's actual surface in viewport y, so the blob
      // starts inside the mass and the smin creates a visible dome from frame one.
      const surfaceY = gameSurfaceYRef?.current ?? SPAWN_Y;
      const spawnY = surfaceY - 0.015 - Math.random() * 0.025;
      state.blobs.push({
        id: state.nextId++,
        x: 0.18 + Math.random() * 0.64,
        y: spawnY,
        r: randomBlobRadius(),
        vy: speed * (0.85 + Math.random() * 0.3),
        wobblePhase: Math.random() * Math.PI * 2,
        wobbleFreq: 1.1 + Math.random() * 1.6,
        wobbleAmp: 0.004 + Math.random() * 0.009,
        scale: 0,
        popping: false,
        popProgress: 0,
      });
      state.lastSpawn = time;
    }

    function writeToRef() {
      gameBlobsRef.current = state.blobs.slice(0, MAX_ACTIVE).map(b => ({
        x: b.x, y: b.y, r: b.r, scale: b.scale,
      }));
    }

    function tick(t: number) {
      rafId = requestAnimationFrame(tick);
      const dt = Math.min((t - lastT) * 0.001, 0.05);
      lastT = t;
      const time = t * 0.001;
      if (state.startTime === 0) state.startTime = time;

      if (state.gameOver) {
        for (const b of state.blobs) b.scale = Math.max(0, b.scale - dt * 3);
        state.blobs = state.blobs.filter(b => b.scale > 0.005);
        writeToRef();
        if (!state.exiting) {
          state.exiting = true;
          setTimeout(() => onGameEndRef.current(), EXIT_DELAY_MS);
        }
        return;
      }

      if (time - state.startTime > 1.2) {
        if ((time - state.lastSpawn) * 1000 > getSpawnMs(state.score)) spawn(time);
      }

      for (const b of state.blobs) {
        if (b.popping) {
          b.popProgress += dt / POP_DUR;
          if (b.popProgress < 0.15) {
            b.scale = 1 + (b.popProgress / 0.15) * 0.45;
          } else {
            b.scale = Math.max(0, 1.45 * (1 - (b.popProgress - 0.15) / 0.85));
          }
          continue;
        }
        b.scale = Math.min(1, b.scale + dt * 1.2);
        b.y += b.vy * dt;
        b.x += Math.sin(time * b.wobbleFreq + b.wobblePhase) * b.wobbleAmp * dt;
        b.x = Math.max(b.r + 0.02, Math.min(1 - b.r - 0.02, b.x));
        if (b.y >= 1 - TOP_EDGE) {
          state.gameOver = true;
          soundManagerRef.current?.playGameOver();
          break;
        }
      }

      state.blobs = state.blobs.filter(b => !(b.popping && b.popProgress >= 1));
      writeToRef();
    }

    rafId = requestAnimationFrame(tick);

    function handlePointer(clientX: number, clientY: number) {
      if (state.gameOver) return;
      const nx = clientX / window.innerWidth;
      const ny = 1 - clientY / window.innerHeight;
      const minDim = Math.min(window.innerWidth, window.innerHeight);
      for (const b of state.blobs) {
        if (b.popping || b.scale < 0.3) continue;
        const dx = (b.x - nx) * window.innerWidth;
        const dy = (b.y - ny) * window.innerHeight;
        // Slightly generous tap on tiny blobs so small visuals stay playable on mobile.
        const hitR = Math.max(b.r, 0.019);
        if (Math.sqrt(dx * dx + dy * dy) < hitR * minDim * 1.55) {
          b.popping = true;
          b.popProgress = 0;
          b.scale = 1;
          state.score++;
          soundManagerRef.current?.playBubblePop();
          break;
        }
      }
    }

    const onClick = (e: MouseEvent) => handlePointer(e.clientX, e.clientY);
    const onTouch = (e: TouchEvent) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        handlePointer(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
      }
    };

    const div = divRef.current;
    div?.addEventListener('click', onClick);
    div?.addEventListener('touchstart', onTouch, { passive: false });

    return () => {
      cancelAnimationFrame(rafId);
      gameBlobsRef.current = [];
      div?.removeEventListener('click', onClick);
      div?.removeEventListener('touchstart', onTouch);
    };
  }, [getSpawnMs, getBlobSpeed, gameBlobsRef]);

  return (
    <div
      ref={divRef}
      style={{ position: 'fixed', inset: 0, zIndex: 10 }}
    />
  );
}
