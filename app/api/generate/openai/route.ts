import { NextRequest } from 'next/server';
export const runtime = 'edge';

// Allowed models for OpenAI
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
  // OpenAI keys start with 'sk-' and are typically 51+ chars
  return typeof key === 'string' && key.startsWith('sk-') && key.length >= 20;
}

function isValidDataUrl(url: string): boolean {
  return typeof url === 'string' && /^data:image\/[a-z]+;base64,/i.test(url);
}

function isValidModel(model: string): boolean {
  return typeof model === 'string' && ALLOWED_MODELS.includes(model);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { apiKey, model, instruction, instructionHash, imageDataUrl, imageDataUrls } = body as {
      apiKey: string;
      model: string;
      instruction?: string;
      instructionHash?: string;
      imageDataUrl?: string;
      imageDataUrls?: string[];
    };

    // Input validation
    if (!apiKey) {
      return new Response('Missing apiKey', { status: 400 });
    }
    if (!isValidApiKey(apiKey)) {
      return new Response('Invalid API key format', { status: 400 });
    }
    if (!model) {
      return new Response('Missing model', { status: 400 });
    }
    if (!isValidModel(model)) {
      return new Response(`Invalid model. Allowed: ${ALLOWED_MODELS.join(', ')}`, { status: 400 });
    }

    const images: string[] = Array.isArray(imageDataUrls) && imageDataUrls.length > 0
      ? imageDataUrls
      : (imageDataUrl ? [imageDataUrl] : []);

    if (images.length === 0) {
      return new Response('Missing imageDataUrl or imageDataUrls', { status: 400 });
    }
    if (!images.every(isValidDataUrl)) {
      return new Response('Invalid image data URL format', { status: 400 });
    }

    // Cache instruction for batch processing
    if (instruction && instructionHash && !instructionCache.has(instructionHash)) {
      instructionCache.set(instructionHash, instruction);
    }
    const sys = instructionCache.get(instructionHash ?? '') ?? instruction ?? '';

    const payload = {
      model,
      instructions: sys,
      text: {
        format: {
          type: 'json_schema',
          name: 'StockMeta',
          schema: jsonSchema,
          strict: true
        }
      },
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: images.length > 1
                ? 'Analyze this sequence of chronological video keyframes across the entire footage (from start to finish). Do NOT describe only the first frame; synthesize the overall dynamic motion, subject action, camera movement, and progression across all frames into the metadata JSON.'
                : 'Analyze the image and return metadata JSON.'
            },
            ...images.map((img) => ({ type: 'input_image', image_url: img }))
          ]
        }
      ]
    };

    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const bodyText = await resp.text();
    if (!resp.ok) {
      console.error('OpenAI error', resp.status, bodyText);
      return new Response(`OpenAI error (${resp.status}): ${bodyText}`, { status: 500 });
    }

    const json = JSON.parse(bodyText) as {
      output_text?: string;
      output?: { content?: { text?: string }[] }[];
    };
    const out = json.output_text ?? json.output?.[0]?.content?.[0]?.text ?? bodyText;

    return new Response(out, { headers: { 'Content-Type': 'application/json' } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Server error', msg);
    return new Response(`Server error: ${msg}`, { status: 500 });
  }
}
