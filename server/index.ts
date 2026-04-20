/**
 * Nour emotion server — Node.js backend.
 *
 * Exposes two equivalent transports on the same HTTP server:
 *
 *   POST /emotion  (used by the React SPA via ApiClient)
 *     Body: { audio: base64 WebM, history: [{text, timestamp}] }
 *     Response: { text: string, emotion: EmotionAnalysis | null }
 *
 *   WebSocket (ws://<host>:<PORT>)  (available via wsClient.ts but not default)
 *     Same JSON message shape in both directions.
 *
 * Pipeline for each request:
 *   1. Decode base64 audio → Groq Whisper large-v3 → transcript
 *   2. Pass transcript + last 10 history messages to Groq Llama 3.1 8B
 *   3. Parse strict JSON emotion response → return to client
 *
 * Environment variables:
 *   GROQ_API_KEY  — required (from server/.env in dev, platform env in production)
 *   PORT          — optional (default: 3001)
 */
import 'dotenv/config';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import Groq from 'groq-sdk';

const PORT = Number(process.env.PORT) || 3001;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are an emotion analyzer for a sentient orb creature. A user is speaking to the orb.
Given the user's message and any conversation history, analyze how the orb should emotionally react.
Respond with ONLY valid JSON, no markdown, no explanation:
{
  "emotion": one of ["happy","sad","angry","fearful","disgusted","surprised","loving","excited","calm","anxious","shy","playful","curious","contemptuous"],
  "valence": number from -1.0 (very negative) to 1.0 (very positive),
  "arousal": number from 0.0 (calm/still) to 1.0 (excited/energetic),
  "dominance": number from 0.0 (submissive/shy/hiding) to 1.0 (confident/bold),
  "intensity": number from 0.0 (mild) to 1.0 (extreme),
  "isApology": boolean (true ONLY when the user is apologizing, expressing remorse, or saying sorry),
  "isLethal": boolean (true ONLY when the user tells the orb to die/kill itself, or expresses extreme hatred like "I hate you")
}
Rules:
- Apologies, saying sorry, expressing remorse or guilt → positive valence, "calm" or "sad", set isApology: true
- Telling the orb to die, kill itself, or expressing extreme hatred (e.g. "I hate you", "kill yourself", "die", "go away forever") → high intensity, set isLethal: true
- NEVER set isLethal to true for expressions of love, affection, praise, or any message with positive valence — "I love you" is the opposite of lethal
- Mean, nasty, or insulting messages (that are NOT lethal) → low dominance, low valence, "shy" or "fearful"
- Compliments about appearance, beauty, or attractiveness (gorgeous, sexy, beautiful, stunning, pretty, hot) → "loving" with high intensity
- Expressions of love, adoration, devotion, or deep affection (I love you, you're amazing, I adore you) → "loving" with high intensity
- Flirting, romantic, or intimate language → "loving"
- General encouragement, praise for actions, or cheerful messages → "happy" or "excited"
- Sarcasm and backhanded compliments should be detected as negative
- Consider the conversation history for context and tone shifts
- Default isApology and isLethal to false when not applicable`;

interface ClientMessage {
  audio?: string;
  mimeType?: string;
  history?: Array<{ text: string; timestamp: number }>;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  // HTTP POST /emotion -- same logic as WebSocket, used by frontend in production
  if (req.method === 'POST' && req.url === '/emotion') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const msg = JSON.parse(body);
      const result = await processAudio(msg);
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Processing failed' }));
    }
    return;
  }

  res.writeHead(200, { ...corsHeaders, 'Content-Type': 'text/plain' });
  res.end('Orb emotion server');
});

async function processAudio(msg: ClientMessage): Promise<{ text: string; emotion: object | null }> {
  if (!msg.audio) return { text: '', emotion: null };

  const mime = msg.mimeType || 'audio/webm';
  const ext = mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'webm';
  const audioBuffer = Buffer.from(msg.audio, 'base64');
  const audioFile = new File([audioBuffer], `speech.${ext}`, { type: mime });

  const transcription = await groq.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-large-v3',
    language: 'en',
  });

  const spokenText = transcription.text.trim();
  if (!spokenText) return { text: '', emotion: null };

  console.log(`Heard: "${spokenText}"`);

  const historyMessages = (msg.history || []).slice(-10).map((h) => ({
    role: 'user' as const,
    content: h.text,
  }));

  const completion = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    temperature: 0.3,
    max_tokens: 200,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...historyMessages,
      { role: 'user', content: spokenText },
    ],
  });

  const responseText = completion.choices[0]?.message?.content || '';
  let emotion;
  try {
    emotion = JSON.parse(responseText);
  } catch {
    emotion = { emotion: 'calm', valence: 0, arousal: 0.3, dominance: 0.5, intensity: 0.3 };
  }

  console.log(`Emotion: ${emotion.emotion} (v=${emotion.valence}, a=${emotion.arousal})`);
  return { text: spokenText, emotion };
}

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws: WebSocket) => {
  ws.on('message', async (raw: Buffer | string) => {
    try {
      const msg: ClientMessage = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
      const result = await processAudio(msg);
      ws.send(JSON.stringify(result));
    } catch (err) {
      console.error('WS processing error:', err);
      ws.send(JSON.stringify({ error: 'Processing failed' }));
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Orb emotion server running on ws://localhost:${PORT}`);
});
