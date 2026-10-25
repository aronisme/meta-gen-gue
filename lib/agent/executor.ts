// lib/agent/executor.ts
/**
 * In-Process Agent Loop Executor for MetaGen Omnigent Live Agent.
 * Runs the autonomous reasoning -> tool calling -> observation -> response loop.
 */

import { getGlobalKeyRotator } from './key-rotator';
import { getSkillById } from './skills';
import { dispatchAgentTool, AGENT_TOOLS } from './tools';
import type {
  AgentActivityLog,
  AgentMessage,
  AgentSkill,
  AgentToolCall,
  AgentToolResult,
  ProviderType,
} from './types';

export interface ExecutorCallbacks {
  onThinking?: (thought: string) => void;
  onToolStart?: (toolCall: AgentToolCall) => void;
  onToolComplete?: (toolCall: AgentToolCall, result: AgentToolResult) => void;
  onActivity?: (activity: AgentActivityLog) => void;
  onMessageUpdate?: (message: AgentMessage) => void;
}

export class AgentExecutor {
  private skill: AgentSkill;
  private providerId: ProviderType;

  constructor(skillId = 'general-coworker', providerId: ProviderType = 'gemini') {
    this.skill = getSkillById(skillId);
    this.providerId = providerId;
  }

  public setSkill(skillId: string): void {
    this.skill = getSkillById(skillId);
  }

  public setProvider(providerId: ProviderType): void {
    this.providerId = providerId;
  }

  /**
   * Run one complete agent conversational or autonomous turn.
   */
  public async runTurn(
    userQuery: string,
    history: AgentMessage[] = [],
    callbacks: ExecutorCallbacks = {}
  ): Promise<AgentMessage> {
    const timestamp = Date.now();
    const assistantMsgId = `msg_${timestamp}_${Math.random().toString(36).substring(2, 7)}`;

    callbacks.onActivity?.({
      id: `act_${Date.now()}`,
      timestamp: Date.now(),
      level: 'info',
      type: 'brain',
      title: 'Menganalisis Perintah',
      details: userQuery.slice(0, 80),
    });

    // 1. Analyze user intent to determine if any tool call is needed
    const lower = userQuery.toLowerCase();
    const plannedToolCalls: AgentToolCall[] = [];

    // Heuristik intent matching to tools
    if (lower.includes('scan') || lower.includes('render') || lower.includes('download') || lower.includes('folder')) {
      plannedToolCalls.push({
        id: `call_${Date.now()}_1`,
        name: 'agent_scan_renders',
        args: { folder: 'Downloads/MetaGen_Flow', limit: 20 },
        status: 'executing',
      });
    } else if (lower.includes('qc') || lower.includes('cek') || lower.includes('kualitas') || lower.includes('preflight')) {
      plannedToolCalls.push({
        id: `call_${Date.now()}_2`,
        name: 'agent_run_qc',
        args: { filename: 'sample_asset.jpg', width: 4096, height: 2304, sizeBytes: 3_500_000 },
        status: 'executing',
      });
    } else if (lower.includes('upload') || lower.includes('ftp') || lower.includes('unggah') || lower.includes('kirim')) {
      plannedToolCalls.push({
        id: `call_${Date.now()}_3`,
        name: 'agent_upload_ftp',
        args: { filePaths: ['Downloads/MetaGen_Flow/sample.jpg'], agencies: ['adobestock'] },
        status: 'pending_confirmation', // Safety guard!
      });
    } else if (lower.includes('prompt') || lower.includes('ide') || lower.includes('midjourney') || lower.includes('flux') || lower.includes('sdxl')) {
      let count = 3;
      const countMatch = userQuery.match(/\b([1-5])\b/);
      if (countMatch) count = parseInt(countMatch[1], 10);

      let ar = '16:9';
      const arMatch = userQuery.match(/\b(\d+:\d+)\b/);
      if (arMatch) ar = arMatch[1];

      const platform = lower.includes('flux') ? 'FLUX' : lower.includes('sdxl') ? 'SDXL' : 'Midjourney';

      let cleanTopic = userQuery
        .replace(/^(tolong|coba|bisa)?\s*(buatkan|bikinin|generate|rancang|buat|kasih)\s*(\d+)?\s*(variasi|paket|buah)?\s*(prompt|ide)?\s*(midjourney|flux|sdxl)?\s*(untuk|tentang|soal)?/i, '')
        .replace(/,\s*rasio\s*\d+:\d+/i, '')
        .replace(/,\s*ada\s*copy\s*space/i, ' with generous copy space for advertising')
        .trim();
      if (!cleanTopic) cleanTopic = userQuery;

      plannedToolCalls.push({
        id: `call_${Date.now()}_4`,
        name: 'agent_generate_prompts',
        args: {
          topic: cleanTopic,
          style: 'commercial stock photography, clean aesthetic',
          aspectRatio: ar,
          targetPlatform: platform,
          count,
        },
        status: 'executing',
      });
    } else if (lower.includes('status') || lower.includes('kesehatan') || lower.includes('bridge') || lower.includes('sistem')) {
      plannedToolCalls.push({
        id: `call_${Date.now()}_5`,
        name: 'agent_get_system_status',
        args: {},
        status: 'executing',
      });
    } else if (lower.includes('metadata') || lower.includes('judul') || lower.includes('keyword') || lower.includes('tag')) {
      plannedToolCalls.push({
        id: `call_${Date.now()}_6`,
        name: 'agent_generate_metadata',
        args: { subject: userQuery, category: 'Business' },
        status: 'executing',
      });
    }

    // 2. Synthesize Reasoning / Chain of Thought
    let reasoning = `Menganalisis permintaan pengguna: "${userQuery}". Menggunakan keahlian [${this.skill.name}].\n`;

    if (plannedToolCalls.length > 0) {
      reasoning += `Merencanakan eksekusi ${plannedToolCalls.length} tool otonom: ${plannedToolCalls.map((t) => t.name).join(', ')}.`;
    } else {
      reasoning += `Pertanyaan bersifat konsultasi atau informasi umum. Memberikan panduan strategis langsung.`;
    }

    callbacks.onThinking?.(reasoning);

    // 3. Execute planned tools
    const toolResults: AgentToolResult[] = [];
    for (const toolCall of plannedToolCalls) {
      callbacks.onToolStart?.(toolCall);
      callbacks.onActivity?.({
        id: `act_${Date.now()}`,
        timestamp: Date.now(),
        level: 'info',
        type: 'tool',
        title: `Menjalankan Tool: ${toolCall.name}`,
        details: JSON.stringify(toolCall.args),
      });

      if (toolCall.status === 'pending_confirmation') {
        // Stop here and present confirmation card to user
        const spec = AGENT_TOOLS.find((t) => t.name === toolCall.name);
        const res: AgentToolResult = {
          success: true,
          actionCard: {
            type: 'upload_confirm',
            title: `Konfirmasi Diperlukan: ${spec?.description || toolCall.name}`,
            description: `Tool ini membutuhkan persetujuan manual Anda sebelum dieksekusi ke server jaringan.`,
            payload: toolCall.args,
          },
          message: 'Menunggu konfirmasi aksi dari pengguna.',
        };
        toolCall.result = res;
        toolResults.push(res);
        callbacks.onToolComplete?.(toolCall, res);
        continue;
      }

      try {
        const res = await dispatchAgentTool(toolCall.name, toolCall.args);
        toolCall.status = res.success ? 'success' : 'error';
        toolCall.result = res.data;
        toolCall.error = res.error;
        toolResults.push(res);
        callbacks.onToolComplete?.(toolCall, res);

        callbacks.onActivity?.({
          id: `act_${Date.now()}`,
          timestamp: Date.now(),
          level: res.success ? 'success' : 'error',
          type: 'tool',
          title: `Tool Selesai: ${toolCall.name}`,
          details: res.message || res.error,
        });
      } catch (err: unknown) {
        const errorMsg = String(err);
        toolCall.status = 'error';
        toolCall.error = errorMsg;
        const errRes: AgentToolResult = { success: false, error: errorMsg };
        toolResults.push(errRes);
        callbacks.onToolComplete?.(toolCall, errRes);

        callbacks.onActivity?.({
          id: `act_${Date.now()}`,
          timestamp: Date.now(),
          level: 'error',
          type: 'tool',
          title: `Tool Gagal: ${toolCall.name}`,
          details: errorMsg,
        });
      }
    }

    // 4. Construct Human-like Natural Language Response via LLM
    callbacks.onActivity?.({
      id: `act_${Date.now()}`,
      timestamp: Date.now(),
      level: 'info',
      type: 'brain',
      title: 'Menyusun Respon Percakapan',
      details: 'Menghubungkan ke GAS AI Proxy cluster...',
    });

    const finalContent = await callLlmChat({
      systemPrompt: this.skill.systemPrompt,
      userQuery,
      history,
      toolResults,
      providerId: this.providerId,
    });

    const assistantMessage: AgentMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: finalContent,
      reasoning,
      toolCalls: plannedToolCalls.length > 0 ? plannedToolCalls : undefined,
      timestamp: Date.now(),
    };

    callbacks.onMessageUpdate?.(assistantMessage);
    return assistantMessage;
  }
}

function formatToolResultsAsMarkdown(results: AgentToolResult[]): string {
  const sections: string[] = [];

  for (const r of results) {
    if (!r.success) {
      sections.push(`⚠️ **Kendala Eksekusi:** ${r.error || 'Terjadi kesalahan sistem.'}`);
      continue;
    }

    const d = (r.data || {}) as Record<string, unknown>;

    // Case 1: Prompts Generator
    if (Array.isArray(d.prompts) && d.prompts.length > 0) {
      const promptList = d.prompts
        .map((p, idx) => `**Variasi #${idx + 1} (${d.platform || 'AI'} - ${d.aspectRatio || '16:9'}):**\n\`\`\`text\n${p}\n\`\`\``)
        .join('\n\n');
      sections.push(`Berikut paket prompt komersial yang berhasil dirancang:\n\n${promptList}`);
      continue;
    }

    // Case 2: Metadata SEO Generator
    if (d.title || d.keywords) {
      sections.push(
        `Berikut rekomendasi metadata SEO microstock:\n\n` +
        `📌 **Judul Komersial:**\n${d.title || '-'}\n\n` +
        `📝 **Deskripsi:**\n${d.description || '-'}\n\n` +
        `🏷️ **Keywords (${typeof d.keywords === 'string' ? d.keywords.split(',').length : 0} tag):**\n\`${d.keywords || '-'}\``
      );
      continue;
    }

    // Case 3: QC Audit
    if (d.status) {
      const isPass = d.status === 'PASS';
      const reasons = Array.isArray(d.failReasons) && d.failReasons.length > 0
        ? `\n\n**Catatan Evaluasi:**\n${d.failReasons.map((f) => `- ${f}`).join('\n')}`
        : '\n\n**Status:** Semua parameter teknis lolos batas aman Adobe Stock.';
      sections.push(
        `📋 **Hasil Preflight QC (${d.filename || 'Aset'}):**\n` +
        `• Status: ${isPass ? '✅ LOLOS AUDIT' : '❌ PERLU PERBAIKAN'}\n` +
        `• Resolusi: ${d.width || 0} x ${d.height || 0} (${d.megapixels || 0} MP)\n` +
        `• Ukuran File: ${typeof d.sizeBytes === 'number' ? (d.sizeBytes / 1024 / 1024).toFixed(2) + ' MB' : '-'}` +
        reasons
      );
      continue;
    }

    // Case 4: Local Scan Renders
    if (Array.isArray(d.files)) {
      const filesSummary = d.files
        .slice(0, 10)
        .map((f: { filename?: string; resolutionTag?: string }) => `- 🖼️ \`${f.filename}\` (${f.resolutionTag || '2K'})`)
        .join('\n');
      sections.push(
        `📂 **Hasil Pindaian Folder Flow Lokal:**\n` +
        `Ditemukan ${d.files.length} file render siap proses.\n\n${filesSummary || '- Tidak ada file baru.'}`
      );
      continue;
    }

    // Default Fallback
    sections.push(r.message || JSON.stringify(d, null, 2));
  }

  return sections.join('\n\n---\n\n');
}

async function callLlmChat(params: {
  systemPrompt: string;
  userQuery: string;
  history: AgentMessage[];
  toolResults: AgentToolResult[];
  providerId: ProviderType;
}): Promise<string> {
  const rotator = getGlobalKeyRotator();
  const formattedToolSummary =
    params.toolResults.length > 0 ? formatToolResultsAsMarkdown(params.toolResults) : '';

  const conversationHistory = params.history.slice(-6).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));

  let userContent = params.userQuery;
  if (params.toolResults.length > 0) {
    userContent = `${params.userQuery}\n\n=== HASIL EKSEKUSI TOOL SISTEM ===\n${formattedToolSummary}\n\n=== INSTRUKSI RESPON ===\nSampaikan hasil di atas kepada saya dengan bahasa Indonesia yang hangat, ramah, dan komunikatif layaknya rekan kerja manusia ahli microstock. Pastikan seluruh detail hasil tool (seperti seluruh variasi prompt lengkap, metadata, atau hasil QC) ditampilkan dengan jelas dan rapi di dalam balasan Anda agar saya bisa langsung menggunakannya.`;
  }

  const messagesPayload = [
    {
      role: 'system',
      content: `${params.systemPrompt}\n\n=== PANDUAN GAYA BICARA MANUSIAWI ===\nBicaralah secara ramah, luwes, santai, namun berbobot dan profesional seperti rekan kerja desainer/kontributor microstock manusia. Jangan kaku. Berikan saran atau jawaban yang solutif. Jika ada hasil tool sistem di pesan pengguna, sajikan seluruh prompt atau datanya secara lengkap dan jangan dipotong.`,
    },
    ...conversationHistory,
    {
      role: 'user',
      content: userContent,
    },
  ];

  // Map providerId to target GAS proxy model (or auto for full rotation across Groq, Gemini, TokenHarbor, Mistral, etc)
  let targetModel = 'auto';
  if (params.providerId === 'gemini') targetModel = 'gemini-2.5-flash';
  else if (params.providerId === 'groq') targetModel = 'groq/llama-3.3-70b-versatile';
  else if (params.providerId === 'deepseek') targetModel = 'deepseek';
  else if (params.providerId === 'openai') targetModel = 'openrouter/auto';
  else targetModel = 'auto';

  // 1. Try server-side relay endpoint (/api/agent/chat) when in browser to bypass CORS completely
  if (typeof window !== 'undefined') {
    try {
      const relayRes = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: targetModel,
          messages: messagesPayload,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(20000),
      });

      if (relayRes.ok) {
        const relayData = await relayRes.json();
        if (relayData.ok && relayData.content && typeof relayData.content === 'string') {
          return relayData.content.trim();
        }
      }
    } catch {
      // Relay failed or running in non-server context, continue to fallback
    }
  }

  // 2. Direct GAS AI Proxy call via Key Rotator
  try {
    return await rotator.executeWithFailover(
      params.providerId,
      async (lease) => {
        const targetUrl =
          lease.baseUrl ||
          'https://script.google.com/macros/s/AKfycbz0TfjsTcaMF6WvXqf8SIfHCHVqkHQjB8I8O5l_zfKmoqeqDdh0IyHvg0PJlg8kWzXKwA/exec';

        const payload = {
          model: targetModel,
          messages: messagesPayload,
          temperature: 0.7,
        };

        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 25000) : null;

        let res: Response;
        try {
          res = await fetch(targetUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${lease.keyValue}`,
            },
            body: JSON.stringify(payload),
            redirect: 'follow',
            signal: controller ? controller.signal : undefined,
          });
        } finally {
          if (timer) clearTimeout(timer);
        }

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 150)}`);
        }

        const data = await res.json();
        const content =
          data.choices?.[0]?.message?.content ||
          data.result ||
          data.output ||
          (typeof data === 'string' ? data : '');

        if (!content || typeof content !== 'string') {
          throw new Error('Model tidak mengembalikan respon teks yang valid');
        }

        return content.trim();
      },
      2
    );
  } catch (err) {
    console.warn('[AgentExecutor] LLM conversation call failed, using smart structured fallback:', err);
    if (params.toolResults.length > 0) {
      return `Tentu, berikut hasil lengkap yang berhasil saya siapkan untuk Anda:\n\n${formattedToolSummary}\n\nAda aspek yang ingin kita modifikasi atau poles lebih lanjut?`;
    }
    const qLower = params.userQuery.toLowerCase();
    if (qLower.includes('hai') || qLower.includes('halo') || qLower.includes('hello')) {
      return 'Halo! Senang bisa menyapa Anda. Saya asisten otonom MetaGen Omnigent — rekan kerja Anda untuk alur kerja microstock (konsep prompt, inspeksi QC Adobe Stock, metadata, hingga distribusi FTP). Ada proyek atau aset yang ingin kita kerjakan hari ini?';
    }
    return `Saya mendengar Anda: "${params.userQuery}". Saya siap membantu menganalisis aset, merancang prompt, atau mengecek kualitas file microstock Anda!`;
  }
}
