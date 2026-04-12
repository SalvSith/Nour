/**
 * TEMP: delete this file and remove its import + usage from App.tsx when done debugging.
 */
export const SHOW_TRANSCRIPTION_DEBUG = false;

export type TranscriptEntry = { id: number; text: string; at: number };

export function TranscriptionDebugPanel({ entries }: { entries: TranscriptEntry[] }) {
  if (!SHOW_TRANSCRIPTION_DEBUG) return null;

  return (
    <div
      className="transcription-debug-panel"
      style={{
        position: 'fixed',
        left: 8,
        bottom: 8,
        right: 8,
        maxWidth: 420,
        maxHeight: 'min(40vh, 280px)',
        zIndex: 10050,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '10px 12px',
        borderRadius: 8,
        background: 'rgba(12, 12, 12, 0.92)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 11,
        lineHeight: 1.45,
        color: 'rgba(255,255,255,0.88)',
        pointerEvents: 'auto',
        touchAction: 'auto',
        userSelect: 'text',
        WebkitUserSelect: 'text',
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.45)',
          flexShrink: 0,
        }}
      >
        Transcript debug (remove transcriptionDebug.tsx)
      </div>
      <div
        style={{
          overflowY: 'auto',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {entries.length === 0 ? (
          <span style={{ color: 'rgba(255,255,255,0.35)' }}>Waiting for speech…</span>
        ) : (
          entries.map((e, i) => (
            <div
              key={e.id}
              style={{
                borderLeft: i === entries.length - 1 ? '2px solid rgba(180,220,255,0.5)' : '2px solid transparent',
                paddingLeft: 8,
                marginLeft: 2,
                wordBreak: 'break-word',
              }}
            >
              {e.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
