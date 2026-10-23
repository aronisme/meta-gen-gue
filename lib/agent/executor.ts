// lib/agent/executor.ts
/**
 * In-Process Agent Loop Executor for MetaGen Omnigent Live Agent.
 * Runs the autonomous reasoning -> tool calling -> observation -> response loop.
 */

import { getSkillById } from './skills';
import { dispatchAgentTool } from './tools';
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
    } else if (lower.includes('prompt') || lower.includes('ide') || lower.includes('midjourney') || lower.includes('flux')) {
      plannedToolCalls.push({
        id: `call_${Date.now()}_4`,
        name: 'agent_generate_prompts',
        args: { topic: userQuery, style: 'commercial stock', aspectRatio: '16:9', count: 3 },
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
            title: `Konfirmasi Diperlukan: ${toolCall.name}`,
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

    // 4. Construct Final Natural Language Response
    let finalContent = '';
    if (toolResults.length > 0) {
      const summaries = toolResults.map((r) => r.message || r.error).filter(Boolean);
      finalContent = `${summaries.join('\n\n')}\n\nAda hal lain yang ingin saya bantu selesaikan?`;
    } else {
      finalContent = `Halo! Saya siap membantu Anda di alur kerja mikrostock.\n\nAnda dapat meminta saya untuk:\n- Merancang prompt Midjourney/FLUX/SDXL komersial\n- Memindai folder hasil render 2K lokal (` + '`Downloads/MetaGen_Flow`' + `)\n- Melakukan uji kelayakan Preflight QC Adobe Stock\n- Menghasilkan judul SEO dan 49 keyword\n- Menanam metadata EXIF ke file dan mengunggah ke FTP agensi.`;
    }

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
