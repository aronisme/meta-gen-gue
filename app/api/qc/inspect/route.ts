import { NextRequest, NextResponse } from 'next/server';
import type { QcCheckFinding, QcReport, TechnicalMetrics } from '@/lib/qc/types';
import { evaluateFinalDecision } from '@/lib/qc/decision-engine';
import { scanTextForWatchlistMatches } from '@/lib/qc/rulebook-data';

export const runtime = 'edge';

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

function cleanJsonText(raw: string): string {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1');
  cleaned = cleaned.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return cleaned.slice(start, end + 1);
  }
  return cleaned;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      imageDataUrl,
      filename = 'asset.jpg',
      assetType = 'photo_jpeg',
      model = 'auto',
      metadata,
      technical,
      userEmail,
      googleIdToken,
    } = body as {
      imageDataUrl: string;
      filename?: string;
      assetType?: 'photo_jpeg' | 'transparent_png' | 'auto';
      model?: string;
      metadata?: { title?: string; keywords?: string; isAiGenerated?: boolean };
      technical: TechnicalMetrics;
      userEmail?: string;
      googleIdToken?: string;
    };

    if (!imageDataUrl) {
      return NextResponse.json({ error: 'Missing imageDataUrl' }, { status: 400 });
    }

    // Jika gagal teknis hard sejak preflight lokal, langsung beri keputusan BLOCK tanpa membuang token VLM
    if (technical && !technical.passes_hard_tech) {
      const decisionResult = evaluateFinalDecision(technical, []);
      const report: QcReport = {
        schema_version: '0.1.1',
        asset_id: `qc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        file_name: filename,
        asset_type: assetType === 'auto' ? (technical.format === 'PNG' ? 'transparent_png' : 'photo_jpeg') : assetType,
        decision: decisionResult.decision,
        decision_summary: decisionResult.decision_summary,
        technical,
        checks: technical.fail_reasons.map((reason, idx) => ({
          check_id: `TECH_FAIL_${idx + 1}`,
          rule_id: technical.format === 'PNG' ? 'AS-PNG-TECH-001' : 'AS-PHOTO-TECH-001',
          status: 'FAIL',
          severity: 'CRITICAL',
          confidence: 1.0,
          confidence_calibrated: true,
          source_class: 'official_adobe',
          source_ids: ['ADOBE_PHOTO_TECH', 'ADOBE_PNG_TECH'],
          evidence_type: 'metadata_measurement',
          observation: reason,
          why_it_matters: 'Persyaratan minimum teknis Adobe Stock mutlak dipenuhi agar aset tidak langsung ditolak bot moderasi.',
          suggested_action: 'Perbaiki resolusi atau ukuran file sebelum submit.',
          requires_human_review: false,
        })),
        provenance: {
          is_generative_ai: metadata?.isAiGenerated ?? 'unknown',
          license_status: 'unknown',
          people_property_status: 'unknown',
          model_release_status: 'unknown',
          property_release_status: 'unknown',
        },
        metadata_review: {
          title: metadata?.title || null,
          keywords: metadata?.keywords ? metadata.keywords.split(',').map((k) => k.trim()) : [],
        },
        limitations: [
          'Evaluasi teknis deterministik (Piksel & Ukuran).',
          'Pemeriksaan visual dilewati karena pelanggaran teknis fatal.',
        ],
        policy_version: '0.1.1',
        reviewed_at: new Date().toISOString(),
      };

      return NextResponse.json(report);
    }

    const aspectRatio = technical ? (technical.width_px / Math.max(1, technical.height_px)).toFixed(2) : '1.78';
    const isWidescreen = technical ? technical.width_px > technical.height_px : true;
    const aspectDesc = isWidescreen ? `Landscape Widescreen (~${aspectRatio}:1)` : 'Standard/Portrait';

    // Prompt Spesialis Inspeksi Visual & Kebijakan Adobe Stock untuk VLM
    const systemPrompt = `You are an expert Adobe Stock Quality Control (QC) Inspector examining a stock image asset before submission.
Target Asset Type: ${assetType}
Filename: ${filename}
Source Dimensions: ${technical?.width_px || '2752'} x ${technical?.height_px || '1536'} px (${aspectDesc}, Format: ${technical?.format || 'JPEG'}${technical?.has_alpha ? ' Transparent' : ' Solid'})
User Metadata (if available):
- Title: ${metadata?.title || 'None'}
- Keywords: ${metadata?.keywords || 'None'}

CRITICAL ASPECT RATIO & LETTERBOXING RULES (MANDATORY ANTI-HALLUCINATION):
- The original image has dimensions ${technical?.width_px || '2752'} x ${technical?.height_px || '1536'} px (${aspectDesc}).
- Image transport channels or Vision Transformer preprocessors may letterbox, pillarbox, or pad non-square images with neutral, white, or black background bands (e.g. at the bottom ~44-50% of a square canvas) or slice widescreen photos into sub-tiles.
- DO NOT confuse letterbox canvas padding, coordinate margins, or white/black border bands outside the active photo area with image defects.
- DO NOT flag or hallucinate "blank white space", "area putih kosong", "canvas errors", "crop errors", or "stitching artifacts" if the subject matter inside the active frame is complete and normal.
- Evaluate ONLY the actual visual content inside the photo / illustration frame.

INSPECTION CRITERIA (OFFICIAL ADOBE STOCK QUALITY & TECHNICAL STANDARDS):
1. ANATOMY & GEOMETRY (AI Defects): Check for deformed/extra/fused hands, fingers, limbs, eyes, unnatural teeth, melted object geometry, unnatural physics, or floating artifacts.
2. SHARPNESS, FOCUS & OVER-PROCESSING: Check main-subject sharpness/focus (vs intentional bokeh or motion blur), 100% zoom clarity, oversharpening halos/crunchy edges, plastic skin/loss of texture, severe noise/compression artifacts, and visible camera sensor dust spots (especially in skies or uniform backgrounds).
3. EXPOSURE, LIGHTING & COLOR BALANCE: Check for blown highlights/crushed shadows (clipping), extreme exposure settings, heavy unnatural color casts (poor white balance), and oversaturation/neon colors. Check for color fringing/chromatic aberration on high-contrast edges.
4. COMPOSITION & HORIZON: Check for unintentional tilted/unlevel horizons or accidental awkward cropping (e.g. key subject or anatomy awkwardly cut off at canvas edges without artistic intent). Do NOT penalize close-ups, macro shots, full-frame patterns, or tight compositions for lacking copy space (copy space is purely stylistic and NOT a requirement).
5. VISIBLE IP, LOGOS, & TEXT: Look for readable brand names, trademarks, commercial logos, watermarks, timestamps, protected buildings/monuments, or pseudo-text gibberish.
6. TRANSPARENCY & EDGES (If PNG): Look for dirty alpha fringes, baked checkerboards, harsh cutout edges, or opaque background remnants.
7. METADATA COMPLIANCE: If title/keywords are provided, check if title contains prohibited words (e.g. brand names, real living artist/celebrity names, spammy repetitive keywords, or claims not visible in image).

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this exact shape:
{
  "detected_text": "any text or letters visible in the image, or empty string",
  "has_recognizable_people": boolean,
  "has_property_or_landmark": boolean,
  "checks": [
    {
      "check_id": "string (e.g. VQ-ANATOMY-HANDS, VQ-FOCUS-SHARP, VQ-OVERPROCESSING, VQ-COLOR-WB, VQ-COMPOSITION, VQ-IP-TEXT, VQ-PNG-ALPHA)",
      "rule_id": "string (e.g. AS-VIS-004, AS-PHOTO-TECH-001, AS-IP-001)",
      "status": "PASS | FAIL | REVIEW",
      "severity": "INFO | LOW | MEDIUM | HIGH | CRITICAL",
      "confidence": number between 0 and 1,
      "source_class": "official_adobe | internal_heuristic",
      "region": { "x": number 0..1, "y": number 0..1, "width": number 0..1, "height": number 0..1 } or null,
      "observation": "concise description in Indonesian explaining exactly what was observed",
      "why_it_matters": "explanation of Adobe Stock impact in Indonesian",
      "suggested_action": "actionable advice in Indonesian",
      "requires_human_review": boolean
    }
  ]
}`;

    const payload = {
      model: model || 'auto',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: systemPrompt },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
      temperature: 0.1,
      userEmail: userEmail || undefined,
      googleIdToken: googleIdToken || undefined,
    };

    // Eksekusi ke Multi-Cluster GAS Proxy dengan Smart Failover
    const startIdx = roundRobinIndex;
    roundRobinIndex = (roundRobinIndex + 1) % PROXY_CLUSTERS.length;
    const clusterOrder = [PROXY_CLUSTERS[startIdx], PROXY_CLUSTERS[(startIdx + 1) % PROXY_CLUSTERS.length]];

    let proxyResponseText = '';
    let successModelUsed = model;
    let successProvider = 'gas-proxy';

    for (const cluster of clusterOrder) {
      try {
        const resp = await fetch(cluster.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cluster.token}`,
          },
          body: JSON.stringify(payload),
        });

        if (resp.ok) {
          const rawText = await resp.text();
          let jsonResp: Record<string, unknown>;
          try {
            jsonResp = JSON.parse(rawText);
          } catch {
            jsonResp = { choices: [{ message: { content: rawText } }] };
          }

          if (jsonResp.error && typeof jsonResp.error === 'string') {
            continue; // Coba cluster berikutnya
          }

          const choices = jsonResp.choices as Array<{ message?: { content?: string } }> | undefined;
          proxyResponseText =
            choices?.[0]?.message?.content ||
            (jsonResp.result as string) ||
            (jsonResp.output as string) ||
            '';
          successModelUsed = (jsonResp.model as string) || model;
          successProvider = (jsonResp.provider as string) || cluster.name;
          if (proxyResponseText) break;
        }
      } catch {
        // Coba cluster berikutnya
      }
    }

    // Parsing hasil VLM
    let findings: QcCheckFinding[] = [];
    let detectedText = '';
    let hasPeople = false;

    if (proxyResponseText) {
      try {
        const cleanedJson = cleanJsonText(proxyResponseText);
        const parsed = JSON.parse(cleanedJson) as {
          detected_text?: string;
          has_recognizable_people?: boolean;
          has_property_or_landmark?: boolean;
          checks?: QcCheckFinding[];
        };

        detectedText = parsed.detected_text || '';
        hasPeople = !!parsed.has_recognizable_people;
        if (Array.isArray(parsed.checks)) {
          findings = parsed.checks.map((c) => ({
            ...c,
            source_class: c.source_class || 'official_adobe',
            confidence_calibrated: false,
          }));
        }
      } catch (err) {
        console.warn('[QC Inspector] Gagal parsing JSON VLM, fallback to REVIEW finding:', err);
        findings.push({
          check_id: 'VLM_RESPONSE_MALFORMED',
          status: 'REVIEW',
          severity: 'MEDIUM',
          source_class: 'internal_heuristic',
          observation: 'Model memberikan respon teks yang memerlukan verifikasi manual.',
          suggested_action: 'Periksa gambar secara manual di tab QC.',
          requires_human_review: true,
        });
      }
    }

    // Pindai teks terdeteksi terhadap Daftar Pantauan Pembatasan Resmi (Known Restrictions Watchlist)
    const textToScan = `${detectedText} ${metadata?.title || ''} ${metadata?.keywords || ''}`;
    const watchlistMatches = scanTextForWatchlistMatches(textToScan);

    for (const match of watchlistMatches) {
      findings.unshift({
        check_id: `IP_RESTRICTION_${match.item.id}`,
        rule_id: 'AS-IP-KNOWN-001',
        status: 'REVIEW',
        severity: 'HIGH',
        confidence: 0.9,
        confidence_calibrated: false,
        source_class: 'official_adobe',
        source_ids: ['ADOBE_KNOWN_RESTRICTIONS'],
        evidence_type: 'ocr_text',
        observation: `Terdeteksi indikasi item dalam daftar pembatasan Adobe Stock: "${match.item.name}" (Kategori: ${match.item.match_type}).`,
        why_it_matters: match.item.scope,
        suggested_action: match.item.action,
        requires_human_review: true,
      });
    }

    // Evaluasi Keputusan Akhir Deterministik
    const decisionResult = evaluateFinalDecision(technical, findings);

    const fullReport: QcReport = {
      schema_version: '0.1.1',
      asset_id: `qc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      file_name: filename,
      asset_type: assetType === 'auto' ? (technical.format === 'PNG' ? 'transparent_png' : 'photo_jpeg') : assetType,
      decision: decisionResult.decision,
      decision_summary: decisionResult.decision_summary,
      technical,
      checks: findings,
      provenance: {
        is_generative_ai: metadata?.isAiGenerated ?? 'unknown',
        license_status: 'unknown',
        people_property_status: hasPeople ? 'real' : 'unknown',
        model_release_status: hasPeople ? 'needed' : 'not_applicable',
        property_release_status: 'unknown',
      },
      metadata_review: {
        title: metadata?.title || null,
        keywords: metadata?.keywords ? metadata.keywords.split(',').map((k) => k.trim()) : [],
        claims_to_verify: watchlistMatches.map((m) => m.item.name),
      },
      limitations: [
        'Status READY berarti tidak ada isu yang terdeteksi oleh pengujian yang dikonfigurasi saat ini.',
        'Hasil inspeksi bukan jaminan penerimaan oleh moderator manusia Adobe Stock.',
        'Pemeriksaan kemiripan katalog (similarity search) secara eksplisit dikecualikan.',
      ],
      policy_version: '0.1.1',
      reviewed_at: new Date().toISOString(),
      model_used: successModelUsed,
      provider_used: successProvider,
    };

    return NextResponse.json(fullReport);
  } catch (error) {
    console.error('[QC Inspector API Error]:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Terjadi kegagalan pada proses QC' },
      { status: 500 }
    );
  }
}
