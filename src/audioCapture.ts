/**
 * Voice-activity detection (VAD) and audio recording.
 *
 * Receives a smoothed RMS level from the Orb's audio analyser every frame via
 * `feedLevel()`. When the level crosses SPEECH_START_THRESHOLD the recorder
 * starts capturing. When it drops below SPEECH_END_THRESHOLD for at least
 * SILENCE_DURATION_MS (and the clip is longer than MIN_RECORDING_MS) the blob
 * is finalised and handed to the `onUtterance` callback.
 *
 * Long continuous speech is chunked at MAX_RECORDING_MS to keep feedback snappy
 * (~5 words at normal pace). The recording immediately resumes after each chunk
 * so no audio is lost.
 */
const SPEECH_START_THRESHOLD = 0.04;
const SPEECH_END_THRESHOLD = 0.02;
const SILENCE_DURATION_MS = 700;
const MIN_RECORDING_MS = 300;
const MAX_RECORDING_MS = 2500;
const MAX_RECORDING_MS_MOBILE = 5000;

export class AudioCapture {
  private recorder: MediaRecorder | null = null;
  private recorderMimeType = 'audio/webm';
  private chunks: Blob[] = [];
  private isSpeaking = false;
  private silenceStart = 0;
  private recordingStart = 0;
  private onUtterance: ((blob: Blob, mimeType: string) => void) | null = null;
  private stream: MediaStream | null = null;
  private paused = false;
  private maxRecordingMs: number;

  constructor(opts?: { mobile?: boolean }) {
    this.maxRecordingMs = opts?.mobile ? MAX_RECORDING_MS_MOBILE : MAX_RECORDING_MS;
  }

  init(stream: MediaStream, onUtterance: (blob: Blob, mimeType: string) => void) {
    this.stream = stream;
    this.onUtterance = onUtterance;
  }

  pause() {
    this.paused = true;
    this.isSpeaking = false;
    this.silenceStart = 0;
    this.cancelRecording();
  }

  resume() {
    this.paused = false;
  }

  feedLevel(smoothLevel: number) {
    if (!this.stream || !this.onUtterance || this.paused) return;

    const now = performance.now();

    if (!this.isSpeaking && smoothLevel > SPEECH_START_THRESHOLD) {
      this.isSpeaking = true;
      this.silenceStart = 0;
      this.recordingStart = now;
      this.startRecording();
    }

    if (this.isSpeaking) {
      if (now - this.recordingStart > this.maxRecordingMs) {
        this.stopRecording();
        this.silenceStart = 0;
        this.recordingStart = now;
        this.startRecording();
        return;
      }

      if (smoothLevel < SPEECH_END_THRESHOLD) {
        if (this.silenceStart === 0) this.silenceStart = now;
        if (now - this.silenceStart > SILENCE_DURATION_MS) {
          this.isSpeaking = false;
          const duration = now - this.recordingStart;
          if (duration > MIN_RECORDING_MS) {
            this.stopRecording();
          } else {
            this.cancelRecording();
          }
        }
      } else {
        this.silenceStart = 0;
      }
    }
  }

  private startRecording() {
    if (!this.stream) return;
    this.chunks = [];
    try {
      this.recorder = new MediaRecorder(this.stream, {
        mimeType: 'audio/webm;codecs=opus',
      });
    } catch {
      this.recorder = new MediaRecorder(this.stream);
    }
    this.recorderMimeType = this.recorder.mimeType || 'audio/webm';
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(100);
  }

  private stopRecording() {
    if (!this.recorder || this.recorder.state === 'inactive') return;
    const chunks = this.chunks;
    const mime = this.recorderMimeType;
    this.recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mime });
      if (blob.size > 0) this.onUtterance?.(blob, mime);
    };
    this.recorder.stop();
    this.recorder = null;
    this.chunks = [];
  }

  private cancelRecording() {
    if (!this.recorder || this.recorder.state === 'inactive') return;
    this.recorder.onstop = null;
    this.recorder.stop();
    this.recorder = null;
    this.chunks = [];
  }

  destroy() {
    this.cancelRecording();
    this.onUtterance = null;
    this.stream = null;
  }
}
