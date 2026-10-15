import { NextRequest } from 'next/server';

export const runtime = 'edge';

function extractJson(text: string): Record<string, unknown> {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1');
  cleaned = cleaned.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    // continue to regex extraction
  }

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const slice = cleaned.slice(start, end + 1);
    try {
      return JSON.parse(slice) as Record<string, unknown>;
    } catch {
      const repaired = slice.replace(/,\s*([\]\}])/g, '$1').replace(/[\u0000-\u001F]+/g, ' ');
      try {
        return JSON.parse(repaired) as Record<string, unknown>;
      } catch {
        // continue to truncation recovery
      }
    }
  }

  // Robust truncation recovery: if tokens cut off mid-array, close to the last valid object
  const lastObjEnd = cleaned.lastIndexOf('}');
  if (lastObjEnd > 0) {
    const fromIdx = start >= 0 ? start : 0;
    const candidate = cleaned.slice(fromIdx, lastObjEnd + 1) + '\n  ]\n}';
    try {
      const recovered = JSON.parse(candidate);
      if (recovered && typeof recovered === 'object') return recovered as Record<string, unknown>;
    } catch {
      // try regex below
    }
  }

  // Regex fallback to extract individual completed prompt items
  const promptRegex = /\{\s*"ordinal"[\s\S]*?\}(?=\s*[,\]])/g;
  const matches = cleaned.match(promptRegex);
  if (matches && matches.length > 0) {
    const parsedPrompts: Array<Record<string, unknown>> = [];
    for (const m of matches) {
      try {
        parsedPrompts.push(JSON.parse(m));
      } catch {
        // skip malformed item
      }
    }
    if (parsedPrompts.length > 0) {
      return { prompts: parsedPrompts };
    }
  }

  throw new Error('Model did not return valid JSON');
}

interface ProxyChatChoice {
  message?: {
    content?: string;
  };
}

interface ProxyChatResponse {
  error?: string | { message?: string };
  choices?: ProxyChatChoice[];
  model?: string;
  provider?: string;
  result?: string;
  output?: string;
}

const PROXY_CLUSTERS = [
  {
    name: 'Cluster-1',
    url:
      process.env.GAS_PROXY_URL_1 ||
      process.env.GAS_PROXY_URL ||
      'https://script.google.com/macros/s/AKfycbzB-MWqSfCXRbolr5yFkS33jkRrDw7Y9mjViluIeYJ5_-PJTbyZynrz1gl1K1UW5dKm/exec',
    token:
      process.env.GAS_PROXY_TOKEN_1 ||
      process.env.GAS_PROXY_TOKEN ||
      'gas_live_8b84dd959b764b4296669623',
  },
  {
    name: 'Cluster-2',
    url:
      process.env.GAS_PROXY_URL_2 ||
      'https://script.google.com/macros/s/AKfycbyxgrWSWQGMYBwbn4mjR_0VaXa6DdkGHmbC3YUJ7cWByxdZ-uJXk76iCYzV1826syjGxA/exec',
    token:
      process.env.GAS_PROXY_TOKEN_2 ||
      'gas_live_8b84dd959b764b4296669602',
  },
];

let roundRobinIndex = 0;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { model, instruction, imageDataUrl, provider, apiKey } = body as {
      model?: string;
      instruction?: string;
      imageDataUrl?: string;
      provider?: string;
      apiKey?: string;
    };

    if (!instruction) {
      return new Response('Missing instruction', { status: 400 });
    }

    const targetModel = !model || model === 'auto' ? 'gemini-2.5-flash' : model;

    const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

    if (imageDataUrl) {
      contentParts.push({
        type: 'image_url',
        image_url: { url: imageDataUrl },
      });
    }

    contentParts.push({ type: 'text', text: instruction });

    const payload = {
      model: targetModel,
      messages: [
        {
          role: 'user',
          content: contentParts,
        },
      ],
      temperature: 0.7,
      max_tokens: 4096,
    };

    // If direct OpenAI provider is selected and key is provided
    if (provider === 'openai' && apiKey) {
      const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!openAiRes.ok) {
        throw new Error(`OpenAI HTTP ${openAiRes.status}: ${(await openAiRes.text()).slice(0, 200)}`);
      }

      const openAiData = (await openAiRes.json()) as ProxyChatResponse;
      const rawContent = openAiData.choices?.[0]?.message?.content || '';
      const parsed = extractJson(rawContent);
      return new Response(JSON.stringify(parsed), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Provider': 'openai',
          'X-Target-Model': targetModel,
        },
      });
    }

    let lastError: Error | null = null;
    const startIndex = roundRobinIndex % PROXY_CLUSTERS.length;
    roundRobinIndex++;

    for (let i = 0; i < PROXY_CLUSTERS.length; i++) {
      const clusterIdx = (startIndex + i) % PROXY_CLUSTERS.length;
      const cluster = PROXY_CLUSTERS[clusterIdx];

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 55000);

        const res = await fetch(cluster.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cluster.token}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`[${cluster.name}] HTTP ${res.status}: ${errText.slice(0, 200)}`);
        }

        const data: ProxyChatResponse = await res.json();

        if (data.error) {
          const errMsg = typeof data.error === 'object' ? data.error.message || 'Unknown error' : data.error;
          throw new Error(`[${cluster.name}] ${errMsg}`);
        }

        const rawContent = data.choices?.[0]?.message?.content || data.result || data.output || '';
        if (!rawContent) {
          throw new Error(`[${cluster.name}] Empty response content`);
        }

        const parsed = extractJson(rawContent);
        return new Response(JSON.stringify(parsed), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Proxy-Cluster': cluster.name,
            'X-Target-Model': targetModel,
          },
        });
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`[Proxy-Failover] Cluster ${cluster.name} failed:`, lastError.message);
      }
    }

    throw lastError || new Error('All AI Proxy clusters failed');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[VCPA Route Error]:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
