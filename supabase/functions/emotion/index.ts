import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const { audio, mimeType: clientMime, history } = await req.json();

    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
    if (!GROQ_API_KEY) {
      return new Response(JSON.stringify({ error: 'Missing GROQ_API_KEY secret' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const mime = clientMime || 'audio/webm';
    const ext = mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'webm';
    const audioBytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0));
    const audioFile = new File([audioBytes], `speech.${ext}`, { type: mime });
    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('model', 'whisper-large-v3');
    formData.append('language', 'en');

    const transcriptionRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: formData,
    });

    if (!transcriptionRes.ok) {
      const err = await transcriptionRes.text();
      console.error('Whisper error:', err);
      return new Response(JSON.stringify({ error: 'Transcription failed' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const transcription = await transcriptionRes.json();
    const spokenText = transcription.text?.trim() ?? '';

    if (!spokenText) {
      return new Response(JSON.stringify({ text: '', emotion: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Heard: "${spokenText}"`);

    const historyMessages = ((history as Array<{ text: string }>) || [])
      .slice(-10)
      .map((h) => ({ role: 'user', content: h.text }));

    const completionRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        temperature: 0.3,
        max_tokens: 200,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...historyMessages,
          { role: 'user', content: spokenText },
        ],
      }),
    });

    if (!completionRes.ok) {
      const err = await completionRes.text();
      console.error('LLM error:', err);
      return new Response(JSON.stringify({ error: 'Emotion analysis failed' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const completion = await completionRes.json();
    const responseText = completion.choices?.[0]?.message?.content ?? '';

    let emotion;
    try {
      emotion = JSON.parse(responseText);
    } catch {
      emotion = { emotion: 'calm', valence: 0, arousal: 0.3, dominance: 0.5, intensity: 0.3 };
    }

    console.log(`Emotion: ${emotion.emotion} (v=${emotion.valence}, a=${emotion.arousal})`);

    return new Response(JSON.stringify({ text: spokenText, emotion }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Processing failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
