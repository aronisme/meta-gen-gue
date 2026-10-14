// Cloudflare Pages Function: /api/generate/openai

const ALLOWED_MODELS = [
  'gpt-5.2', 'gpt-5.1', 'gpt-5', 'o4-mini', 'o3', 'o3-mini', 'gpt-4o', 'gpt-4.1',
  'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4'
];

const jsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    keywords: { type: 'string' },
    category: { type: 'string' },
    shutterstockCategory: { type: 'string' }
  },
  required: ['title', 'description', 'keywords', 'category', 'shutterstockCategory']
} as const;

const instructionCache = new Map<string, string>();

function isValidApiKey(key: string): boolean {
  return typeof key === 'string' && key.startsWith('sk-') && key.length >= 20;
}

function isValidDataUrl(url: string): boolean {
  return typeof url === 'string' && /^data:image\/[a-z]+;base64,/i.test(url);
}

function isValidModel(model: string): boolean {
  return typeof model === 'string' && ALLOWED_MODELS.includes(model);
}

export async function onRequestPost(context: { request: Request }) {
  try {
    const body = await context.request.json();
    const { apiKey, model, instruction, instructionHash, imageDataUrl, imageDataUrls } = body as {
      apiKey: string;
      model: string;
      instruction?: string;
      instructionHash?: string;
      imageDataUrl?: string;
      imageDataUrls?: string[];
    };

    if (!apiKey) return new Response('Missing apiKey', { status: 400 });
    if (!isValidApiKey(apiKey)) return new Response('Invalid API key format', { status: 400 });
    if (!model) return new Response('Missing model', { status: 400 });
    if (!isValidModel(model)) return new Response(`Invalid model. Allowed: ${ALLOWED_MODELS.join(', ')}`, { status: 400 });

    const images: string[] = Array.isArray(imageDataUrls) && imageDataUrls.length > 0
      ? imageDataUrls
      : (imageDataUrl ? [imageDataUrl] : []);

    if (images.length === 0) return new Response('Missing imageDataUrl or imageDataUrls', { status: 400 });

    for (const img of images) {
      if (!isValidDataUrl(img)) return new Response('Invalid image data URL format in list', { status: 400 });
    }

    if (instruction && instructionHash && !instructionCache.has(instructionHash)) {
      instructionCache.set(instructionHash, instruction);
    }
    const sys = instructionCache.get(instructionHash ?? '') ?? instruction ?? '';

    const isVideo = images.length > 1;
    let contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

    if (isVideo) {
      const frameCount = images.length;
      contentParts.push({
        type: 'text',
        text: `${sys}\n\n=== CHRONOLOGICAL VIDEO KEYFRAME SEQUENCE (${frameCount} FRAMES) ===\nExamine the temporal progression, movements, camera motion, and action unfolding across these frames:\n`
      });

      images.forEach((img, idx) => {
        const pct = Math.round((idx / (frameCount - 1 || 1)) * 100);
        const positionLabel = idx === 0 ? 'START' : idx === frameCount - 1 ? 'END' : 'MIDDLE';
        contentParts.push({
          type: 'text',
          text: `\n[Keyframe ${idx + 1} of ${frameCount} — ${positionLabel} (Timestamp: ~${pct}% of video duration)]:`
        });
        contentParts.push({
          type: 'image_url',
          image_url: { url: img }
        });
      });

      contentParts.push({
        type: 'text',
        text: `\n=== CRITICAL SYNTHESIS REQUIREMENTS ===\n1. DO NOT describe only the first frame. Your title and description MUST describe the dynamic action that occurs across ALL ${frameCount} keyframes from start to finish.\n2. Include video motion keywords.`
      });
    } else {
      contentParts = [
        { type: 'text', text: sys || 'Analyze image and return metadata' },
        { type: 'image_url', image_url: { url: images[0] } }
      ];
    }

    const payload = {
      model,
      messages: [
        {
          role: 'user',
          content: contentParts
        }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'microstock_metadata',
          strict: true,
          schema: jsonSchema
        }
      }
    };

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    const text = await resp.text();
    if (!resp.ok) {
      return new Response(`OpenAI error (${resp.status}): ${text}`, { status: 500 });
    }

    try {
      const json = JSON.parse(text) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = json.choices?.[0]?.message?.content ?? text;
      return new Response(content, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } catch {
      return new Response(text, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`Server error: ${msg}`, { status: 500 });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
