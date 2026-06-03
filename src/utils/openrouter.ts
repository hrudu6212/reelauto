const API_KEYS = [
  "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",
  "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",
  "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",
  "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",
  "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",
];

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "liquid/lfm-2.5-1.2b-instruct:free";

export interface ReelCaptionData {
  hook: string;
  body: string;
  hashtags: string[];
  suggestedAudioType: string;
  visualSuggestions: string[];
}

/**
 * Try a single API call with one key
 */
async function tryCallWithKey(
  apiKey: string,
  messages: Array<{role: string; content: string}>
): Promise<string> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://supercontentmaster.vercel.app",
      "X-Title": "Super Content Master"
    },
    body: JSON.stringify({
      model: MODEL,
      messages
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "Unknown error");
    throw new Error(`API Error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const result = await response.json();

  if (!result.choices || !result.choices[0]?.message?.content) {
    throw new Error("Empty or malformed API response");
  }

  return result.choices[0].message.content;
}

/**
 * Call API with automatic fallback through all keys
 */
async function callAPI(
  messages: Array<{role: string; content: string}>
): Promise<string> {
  const errors: string[] = [];

  for (let i = 0; i < API_KEYS.length; i++) {
    try {
      const result = await tryCallWithKey(API_KEYS[i], messages);
      return result;
    } catch (err: any) {
      const msg = err?.message || "Unknown error";
      errors.push(`Key ${i + 1}: ${msg}`);
      console.warn(`API key ${i + 1} failed, ${i < API_KEYS.length - 1 ? `trying key ${i + 2}...` : "no more keys left"}`);
    }
  }

  throw new Error(
    `All ${API_KEYS.length} API keys failed:\n${errors.join("\n")}\n\nPlease try again later.`
  );
}

/**
 * Generate viral Reels captions and hashtags based on video topic, transcription, and tone.
 */
export async function generateReelCaptions(
  topic: string,
  tone: string,
  transcription?: string,
  keyFocusPoints?: string
): Promise<ReelCaptionData> {
  const systemPrompt = `You are a high-performing social media manager and growth expert. 
You specialize in writing extremely viral, high-converting Instagram Reels captions. 
You must respond with valid JSON ONLY. Respond with a JSON object. Ensure all strings are correctly closed and escaped. No markdown code fences, no extra text.`;

  const contextPrompt = `Create viral captions for an Instagram Reel.
  
Parameters:
- Topic/Context: "${topic}"
- Tone of Voice: "${tone}"
${transcription ? `- Audio Transcript: "${transcription}"` : ""}
${keyFocusPoints ? `- Key points to highlight: "${keyFocusPoints}"` : ""}

Provide a JSON object with this exact structure:
{
  "hook": "A short, attention-grabbing hook (less than 10 words).",
  "body": "The main caption text. Use line breaks, emojis, and a call to action.",
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "suggestedAudioType": "Description of the music style.",
  "visualSuggestions": ["Suggestion 1", "Suggestion 2", "Suggestion 3"]
}

Return ONLY the JSON object.`;

  const response = await callAPI([
    { role: "system", content: systemPrompt },
    { role: "user", content: contextPrompt }
  ]);

  const defaultData: ReelCaptionData = {
    hook: `Unlocking the truth about ${topic}`,
    body: `Here's what you need to know about ${topic}. This changes everything.\n\nMake sure to save this reel for later and share it with a friend!`,
    hashtags: ["reels", "viral", topic.toLowerCase().replace(/[^a-z0-9]/g, "")],
    suggestedAudioType: "Trending aesthetic instrumental",
    visualSuggestions: ["Show hook text on screen", "Dynamic zoom in on subject", "CTA to follow for more"]
  };

  try {
    const cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    
    return {
      hook: parsed.hook || defaultData.hook,
      body: parsed.body || defaultData.body,
      hashtags: Array.isArray(parsed.hashtags)
        ? parsed.hashtags.map((t: any) => String(t || '').trim()).filter(Boolean)
        : defaultData.hashtags,
      suggestedAudioType: parsed.suggestedAudioType || defaultData.suggestedAudioType,
      visualSuggestions: Array.isArray(parsed.visualSuggestions)
        ? parsed.visualSuggestions.map((t: any) => String(t || '').trim()).filter(Boolean)
        : defaultData.visualSuggestions
    };
  } catch (error) {
    console.error("JSON parsing error for response:", response, error);
    return defaultData;
  }
}

/**
 * Automatically analyze a video segment's dialogue transcription to construct viral captions.
 */
export async function analyzeReelAndGenerateCaption(
  transcription: string,
  videoFileName: string
): Promise<ReelCaptionData> {
  const systemPrompt = `You are a high-performing social media manager and growth expert. 
You specialize in writing extremely viral, high-converting Instagram Reels captions. 
You must respond with valid JSON ONLY. Respond with a JSON object. Ensure all strings are correctly closed and escaped. No markdown code fences, no extra text.`;

  const contextPrompt = `Analyze the following spoken dialogue transcript from a video clip. Deduce the main topic, target audience, and key highlights. Then, generate a high-performing Instagram Reel caption for it.
  
Dialogue Transcript:
"${transcription || `(No transcript available. Video filename: ${videoFileName})`}"

Provide a JSON object with this exact structure:
{
  "hook": "A short, attention-grabbing hook overlay text (less than 10 words). Make it pop!",
  "body": "The main caption text. Use line breaks, emojis, and a clear call to action.",
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "suggestedAudioType": "Description of the music style.",
  "visualSuggestions": ["Suggestion 1", "Suggestion 2", "Suggestion 3"]
}

Return ONLY the JSON object.`;

  const response = await callAPI([
    { role: "system", content: systemPrompt },
    { role: "user", content: contextPrompt }
  ]);

  const defaultData: ReelCaptionData = {
    hook: `Check this out!`,
    body: `Here's a breakdown of this segment. Let me know what you think in the comments!\n\nLike and follow for more!`,
    hashtags: ["reels", "shorts", "viral"],
    suggestedAudioType: "Trending aesthetic beat",
    visualSuggestions: ["Show hook text on screen", "Dynamic zoom in on subject"]
  };

  try {
    const cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    
    return {
      hook: parsed.hook || defaultData.hook,
      body: parsed.body || defaultData.body,
      hashtags: Array.isArray(parsed.hashtags)
        ? parsed.hashtags.map((t: any) => String(t || '').trim()).filter(Boolean)
        : defaultData.hashtags,
      suggestedAudioType: parsed.suggestedAudioType || defaultData.suggestedAudioType,
      visualSuggestions: Array.isArray(parsed.visualSuggestions)
        ? parsed.visualSuggestions.map((t: any) => String(t || '').trim()).filter(Boolean)
        : defaultData.visualSuggestions
    };
  } catch (error) {
    console.error("JSON parsing error for auto response:", response, error);
    return defaultData;
  }
}
