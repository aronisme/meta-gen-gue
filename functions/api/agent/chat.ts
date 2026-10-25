// Cloudflare Pages Function: /api/agent/chat
// Server-side relay to GAS AI Proxy clusters (bypasses browser CORS restrictions completely)

interface Env {
  GAS_PROXY_URL_1?: string;
  GAS_PROXY_TOKEN_1?: string;
  GAS_PROXY_URL_2?: string;
  GAS_PROXY_TOKEN_2?: string;
  GAS_PROXY_URL?: string;
  GAS_PROXY_TOKEN?: string;
  [key: string]: unknown;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { headers: CORS_HEADERS });
}

let roundRobinIndex = 0;

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const env = context.env || {};

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
    const body = (await context.request.json()) as {
      messages?: Array<{ role: string; content: string }>;
      model?: string;
      temperature?: number;
    };

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing or invalid messages array' }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const payload = {
      model: body.model || 'auto',
      messages: body.messages,
      temperature: body.temperature ?? 0.7,
    };

    const startIdx = roundRobinIndex;
    roundRobinIndex = (roundRobinIndex + 1) % PROXY_CLUSTERS.length;

    const clusterOrder = [
      PROXY_CLUSTERS[startIdx],
      PROXY_CLUSTERS[(startIdx + 1) % PROXY_CLUSTERS.length],
    ];

    const errors: string[] = [];

    for (const cluster of clusterOrder) {
      try {
        const resp = await fetch(cluster.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cluster.token}`,
          },
          body: JSON.stringify(payload),
          redirect: 'follow',
        });

        const resText = await resp.text();
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status} from ${cluster.name}: ${resText.slice(0, 150)}`);
        }

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(resText) as Record<string, unknown>;
        } catch {
          throw new Error(`Invalid JSON from ${cluster.name}: ${resText.slice(0, 150)}`);
        }

        if (parsed.error) {
          const errMessage =
            typeof parsed.error === 'string'
              ? parsed.error
              : (parsed.error as { message?: string }).message || JSON.stringify(parsed.error);
          throw new Error(errMessage);
        }

        const content =
          ((parsed.choices as Array<{ message?: { content?: string } }>)?.[0]?.message?.content) ||
          (parsed.result as string) ||
          (parsed.output as string) ||
          (typeof parsed === 'string' ? parsed : '');

        return new Response(
          JSON.stringify({
            ok: true,
            cluster: cluster.name,
            model: (parsed.model as string) || payload.model,
            content: String(content || '').trim(),
            raw: parsed,
          }),
          { status: 200, headers: CORS_HEADERS }
        );
      } catch (clusterErr) {
        const msg = clusterErr instanceof Error ? clusterErr.message : String(clusterErr);
        errors.push(`${cluster.name}: ${msg}`);
      }
    }

    return new Response(
      JSON.stringify({
        ok: false,
        error: `All GAS Proxy clusters failed: ${errors.join('; ')}`,
      }),
      { status: 502, headers: CORS_HEADERS }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
}
