// Cloudflare Pages Function: /api/generate/prompt-agent

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

interface D1PreparedStatement {
  bind(...values: unknown[]): {
    first<T = unknown>(): Promise<T | null>;
    run(): Promise<unknown>;
    all<T = unknown>(): Promise<{ results: T[] }>;
  };
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface Env {
  DB?: D1Database;
  metagen_db?: D1Database;
  GAS_PROXY_URL_1?: string;
  GAS_PROXY_URL_2?: string;
  GAS_PROXY_URL?: string;
  GAS_PROXY_TOKEN_1?: string;
  GAS_PROXY_TOKEN_2?: string;
  GAS_PROXY_TOKEN?: string;
  [key: string]: unknown;
}

let roundRobinIndex = 0;

function getWibDateString(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(date);
  } catch {
    return date.toISOString().split('T')[0];
  }
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  const env = context.env || {};
  const d1Db = env.DB || env.metagen_db;

  const PROXY_CLUSTERS = [
    {
      name: 'Cluster-1',
      url:
        (env.GAS_PROXY_URL_1 as string) ||
        (env.GAS_PROXY_URL as string) ||
        'https://script.google.com/macros/s/AKfycbz0TfjsTcaMF6WvXqf8SIfHCHVqkHQjB8I8O5l_zfKmoqeqDdh0IyHvg0PJlg8kWzXKwA/exec',
      token:
        (env.GAS_PROXY_TOKEN_1 as string) ||
        (env.GAS_PROXY_TOKEN as string) ||
        'sk-gas-default-token133',
    },
    {
      name: 'Cluster-2',
      url:
        (env.GAS_PROXY_URL_2 as string) ||
        'https://script.google.com/macros/s/AKfycbyxgrWSWQGMYBwbn4mjR_0VaXa6DdkGHmbC3YUJ7cWByxdZ-uJXk76iCYzV1826syjGxA/exec',
      token:
        (env.GAS_PROXY_TOKEN_2 as string) ||
        'gas_live_8b84dd959b764b4296669602',
    },
  ];

  try {
    const body = await context.request.json();
    const { model, instruction, imageDataUrl, provider, apiKey, userEmail, googleIdToken } = body as {
      model?: string;
      instruction?: string;
      imageDataUrl?: string;
      provider?: string;
      apiKey?: string;
      userEmail?: string;
      googleIdToken?: string;
    };

    if (!instruction) {
      return new Response('Missing instruction', { status: 400 });
    }

    // Cloudflare D1 Pre-flight Quota & Whitelist Verification
    let cleanEmail = '';

    if (d1Db && typeof d1Db.prepare === 'function' && userEmail) {
      try {
        cleanEmail = (userEmail as string).trim().toLowerCase();

        const userRow = await d1Db
          .prepare('SELECT role, status, daily_quota, usage_count, quota_reset_date, last_login FROM users WHERE email = ?')
          .bind(cleanEmail)
          .first<{
            role?: string;
            status?: string;
            daily_quota?: number;
            usage_count?: number;
            quota_reset_date?: string;
            last_login?: string;
          }>();

        if (userRow) {
          if (userRow.status === 'blocked') {
            return new Response('Akses ditolak: Akun Anda dinonaktifkan oleh administrator.', { status: 403 });
          }
          if (userRow.status === 'pending' && userRow.role !== 'admin') {
            return new Response('Akses ditolak: Akun Anda sedang menunggu persetujuan whitelist.', { status: 403 });
          }

          const quota = userRow.daily_quota ?? 100;
          let usage = userRow.usage_count ?? 0;

          const now = new Date();
          const todayWib = getWibDateString(now);

          let shouldReset = false;
          if (userRow.quota_reset_date) {
            if (userRow.quota_reset_date !== todayWib) shouldReset = true;
          } else if (userRow.last_login) {
            const lastWib = getWibDateString(new Date(userRow.last_login));
            if (lastWib !== todayWib) shouldReset = true;
          }

          if (shouldReset) {
            usage = 0;
            await d1Db
              .prepare('UPDATE users SET usage_count = 0, quota_reset_date = ? WHERE email = ?')
              .bind(todayWib, cleanEmail)
              .run();
          }

          if (userRow.role !== 'admin' && usage >= quota) {
            return new Response(`Akses ditolak: Kuota harian Anda (${quota} generasi) telah habis.`, { status: 403 });
          }
        }
      } catch (d1Err) {
        console.warn('[D1 Prompt Agent Quota] Check skipped on error:', d1Err);
      }
    }

    const targetModel = model || 'auto';

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
      userEmail: cleanEmail || undefined,
      googleIdToken: googleIdToken || undefined,
    };

    // If direct OpenAI provider is selected and key is provided
    if (provider === 'openai' && apiKey) {
      const openAiPayload = {
        ...payload,
        model: targetModel === 'auto' ? 'gpt-4o-mini' : targetModel,
      };
      const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(openAiPayload),
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
        const timeoutId = setTimeout(() => controller.abort(), 75000);

        const res = await fetch(cluster.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cluster.token}`,
          },
          body: JSON.stringify(payload),
          redirect: 'follow',
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

        // Deduct quota only after success
        if (d1Db && cleanEmail) {
          try {
            const todayWib = getWibDateString();
            await d1Db
              .prepare("UPDATE users SET usage_count = usage_count + 1, last_login = datetime('now'), quota_reset_date = ? WHERE email = ?")
              .bind(todayWib, cleanEmail)
              .run();
          } catch (deductErr) {
            console.warn('[D1 Prompt Agent Deduct Error]:', deductErr);
          }
        }

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
    console.error('[VCPA Cloudflare Error]:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
