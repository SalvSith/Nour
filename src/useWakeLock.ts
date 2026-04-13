import { useEffect, useRef } from 'react';

/**
 * Acquires a Screen Wake Lock while `active` is true so the device screen
 * doesn't dim or lock during an orb session (same behaviour as video players
 * and games).  The lock is automatically re-acquired whenever the page becomes
 * visible again after being backgrounded, because browsers release it on hide.
 */
export function useWakeLock(active: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;

    let cancelled = false;

    async function acquire() {
      try {
        lockRef.current = await navigator.wakeLock.request('screen');
      } catch {
        // Silently ignore — device may deny the request (low battery, etc.)
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && !cancelled) {
        acquire();
      }
    }

    acquire();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
    };
  }, [active]);
}
