/**
 * Singleton microphone stream.
 *
 * Caches the getUserMedia stream so multiple modules (AudioCapture, Orb analyser)
 * share the same track without opening duplicate permissions dialogs. Call
 * `releaseMicStream()` at session end to stop all tracks and release hardware.
 */
let cachedStream: MediaStream | null = null;

export async function getMicStream(): Promise<MediaStream> {
  if (cachedStream && cachedStream.active) return cachedStream;
  cachedStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  return cachedStream;
}

export function releaseMicStream() {
  cachedStream?.getTracks().forEach((t) => t.stop());
  cachedStream = null;
}

/** Returns true if the cached stream exists and its audio track is still live. */
export function isMicStreamAlive(): boolean {
  if (!cachedStream || !cachedStream.active) return false;
  const track = cachedStream.getAudioTracks()[0];
  return !!track && track.readyState === 'live';
}
