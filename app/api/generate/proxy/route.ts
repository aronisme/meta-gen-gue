import { NextRequest } from 'next/server';

export const runtime = 'edge';

function extractJson(text: string): Record<string, unknown> {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1');
  cleaned = cleaned.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      if (parsed[0] && typeof parsed[0] === 'object') return parsed[0] as Record<string, unknown>;
    } else if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
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
      try {
        const repaired = slice
          .replace(/,\s*([\]\}])/g, '$1')
          .replace(/[\u0000-\u001F]+/g, (m) => (m === '\n' ? '\\n' : m === '\r' ? '\\r' : m === '\t' ? '\\t' : ' '));
        return JSON.parse(repaired) as Record<string, unknown>;
      } catch {
        const loose = slice.replace(/,\s*([\]\}])/g, '$1').replace(/[\u0000-\u001F]+/g, ' ');
        return JSON.parse(loose) as Record<string, unknown>;
      }
    }
  }

  throw new Error('Model did not return valid JSON metadata');
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

// Konfigurasi 2 Cluster GAS AI Proxy (Bergantian Otomatis & Anti-Gagal)
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
      'sk-gas-default-token133'
  },
  {
    name: 'Cluster-2',
    url:
      process.env.GAS_PROXY_URL_2 ||
      'https://script.google.com/macros/s/AKfycbyxgrWSWQGMYBwbn4mjR_0VaXa6DdkGHmbC3YUJ7cWByxdZ-uJXk76iCYzV1826syjGxA/exec',
    token:
      process.env.GAS_PROXY_TOKEN_2 ||
      'gas_live_8b84dd959b764b4296669602'
  }
];

let roundRobinIndex = 0;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { model, instruction, imageDataUrl, imageDataUrls, userEmail, googleIdToken } = body as {
      model?: string;
      instruction?: string;
      imageDataUrl?: string;
      imageDataUrls?: string[];
      userEmail?: string;
      googleIdToken?: string;
    };

    const images: string[] = Array.isArray(imageDataUrls) && imageDataUrls.length > 0
      ? imageDataUrls
      : (imageDataUrl ? [imageDataUrl] : []);

    if (images.length === 0 && !instruction) {
      return new Response('Missing imageDataUrl, imageDataUrls, or instruction', { status: 400 });
    }

    const isVideoClip = images.length > 1;
    const targetModel = (isVideoClip && (!model || model === 'auto'))
      ? 'gemini-2.5-flash'
      : (model || 'auto');

    let contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

    if (images.length === 0) {
      contentParts = [
        { type: 'text', text: instruction || 'Analyze and respond in JSON.' }
      ];
    } else if (isVideoClip) {
      const frameCount = images.length;
      const baseInstruction = instruction || 'Generate microstock metadata for this stock video clip.';

      contentParts.push({
        type: 'text',
        text: `${baseInstruction}\n\n=== CHRONOLOGICAL VIDEO KEYFRAME SEQUENCE (${frameCount} FRAMES) ===\nBelow are ${frameCount} sequential keyframes extracted across the duration of this stock video clip (from beginning to end). Examine the temporal progression, character/object movements, camera motion, and action unfolding across these frames:\n`
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
        text: `\n=== CRITICAL SYNTHESIS REQUIREMENTS ===\n1. DO NOT describe only the first frame. Your title and description MUST describe the overall dynamic action, movement progression, and change that occurs across ALL ${frameCount} keyframes from start to finish.\n2. Include video-specific motion keywords (e.g. actions, walking, panning, zoom, transitioning, sequence, footage) in addition to subject keywords.\n3. Return ONLY a valid JSON object. No explanation, no markdown wrap. Format: {"title": "...", "description": "...", "keywords": "...", "category": "19", "shutterstockCategory": "Technology"}`
      });
    } else {
      const promptText = `${instruction || 'Generate microstock metadata for this image.'}\n\nIMPORTANT: Return ONLY a valid JSON object. No explanation, no markdown. Format: {"title": "...", "description": "...", "keywords": "...", "category": "19", "shutterstockCategory": "Technology"}`;
      contentParts = [
        { type: 'text', text: promptText },
        { type: 'image_url', image_url: { url: images[0] } }
      ];
    }

    const payload = {
      model: targetModel,
      messages: [
        {
          role: 'user',
          content: contentParts
        }
      ],
      temperature: 0.2,
      userEmail: userEmail || undefined,
      googleIdToken: googleIdToken || undefined
    };

    // Ambil urutan rotasi untuk request ini (Round-robin + Failover)
    const startIdx = roundRobinIndex;
    roundRobinIndex = (roundRobinIndex + 1) % PROXY_CLUSTERS.length;

    const clusterOrder = [
      PROXY_CLUSTERS[startIdx],
      PROXY_CLUSTERS[(startIdx + 1) % PROXY_CLUSTERS.length]
    ];

    const errors: string[] = [];

    // Loop mencoba kedua cluster secara bergantian anti-gagal
    for (const cluster of clusterOrder) {
      try {
        console.log(`[Proxy Gateway] Mengirim request ke ${cluster.name} (${cluster.url.slice(0, 50)}...)`);

        const resp = await fetch(cluster.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cluster.token}`
          },
          body: JSON.stringify(payload),
          redirect: 'follow'
        });

        const resText = await resp.text();
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}: ${resText.slice(0, 150)}`);
        }

        let parsedResponse: ProxyChatResponse;
        try {
          parsedResponse = JSON.parse(resText) as ProxyChatResponse;
        } catch {
          throw new Error(`Invalid JSON: ${resText.slice(0, 150)}`);
        }

        if (parsedResponse.error) {
          const errMessage =
            typeof parsedResponse.error === 'string'
              ? parsedResponse.error
              : parsedResponse.error.message || JSON.stringify(parsedResponse.error);
          throw new Error(errMessage);
        }

        const content =
          parsedResponse.choices?.[0]?.message?.content ||
          parsedResponse.result ||
          parsedResponse.output ||
          resText;

        const metadataJson = extractJson(content);
        if (parsedResponse.model) {
          metadataJson.aiModel = parsedResponse.model;
        }
        metadataJson.aiCluster = cluster.name;

        // Berhasil! Langsung kembalikan respons
        return new Response(JSON.stringify(metadataJson), {
          headers: { 'Content-Type': 'application/json' }
        });

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[Proxy Gateway] ${cluster.name} gagal (${errorMsg}). Melompat ke cluster cadangan...`);
        errors.push(`${cluster.name}: ${errorMsg}`);
      }
    }

    // Jika kedua cluster gagal
    return new Response(
      `Semua endpoint GAS Proxy gagal dipanggil:\n${errors.join('\n')}`,
      { status: 500 }
    );

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Proxy route error:', msg);
    return new Response(`Server error: ${msg}`, { status: 500 });
  }
}
