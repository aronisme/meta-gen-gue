// app/api/agent/chat/route.ts
// Next.js Route Handler relay to GAS AI Proxy clusters

import { NextResponse } from 'next/server';

const PROXY_CLUSTERS = [
  {
    name: 'Cluster-1',
    url:
      process.env.GAS_PROXY_URL_1 ||
      process.env.GAS_PROXY_URL ||
      'https://script.google.com/macros/s/AKfycbz0TfjsTcaMF6WvXqf8SIfHCHVqkHQjB8I8O5l_zfKmoqeqDdh0IyHvg0PJlg8kWzXKwA/exec',
    token:
      process.env.GAS_PROXY_TOKEN_1 ||
      process.env.GAS_PROXY_TOKEN ||
      'sk-gas-default-token133',
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

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      messages?: Array<{ role: string; content: string }>;
      model?: string;
      temperature?: number;
    };

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: 'Missing or invalid messages array' }, { status: 400 });
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

        return NextResponse.json({
          ok: true,
          cluster: cluster.name,
          model: (parsed.model as string) || payload.model,
          content: String(content || '').trim(),
          raw: parsed,
        });
      } catch (clusterErr) {
        const msg = clusterErr instanceof Error ? clusterErr.message : String(clusterErr);
        errors.push(`${cluster.name}: ${msg}`);
      }
    }

    return NextResponse.json(
      { ok: false, error: `All GAS Proxy clusters failed: ${errors.join('; ')}` },
      { status: 502 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
