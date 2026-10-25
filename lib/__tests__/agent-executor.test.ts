// lib/__tests__/agent-executor.test.ts
import { describe, expect, it } from 'vitest';
import { AgentExecutor } from '../agent/executor';
import { AGENT_TOOLS, dispatchAgentTool } from '../agent/tools';

describe('Agent Tools & Skills', () => {
  it('has 8 registered tools matching Master Plan specification', () => {
    expect(AGENT_TOOLS.length).toBe(8);
    const names = AGENT_TOOLS.map((t) => t.name);
    expect(names).toContain('agent_generate_prompts');
    expect(names).toContain('agent_scan_renders');
    expect(names).toContain('agent_run_qc');
    expect(names).toContain('agent_generate_metadata');
    expect(names).toContain('agent_embed_metadata');
    expect(names).toContain('agent_upload_ftp');
    expect(names).toContain('agent_interact_browser_tab');
    expect(names).toContain('agent_get_system_status');
  });

  it('enforces requiresConfirmation on agent_upload_ftp for Zero-Accident safety', () => {
    const uploadTool = AGENT_TOOLS.find((t) => t.name === 'agent_upload_ftp');
    expect(uploadTool?.requiresConfirmation).toBe(true);
  });

  it('dispatches agent_generate_prompts correctly', async () => {
    const res = await dispatchAgentTool('agent_generate_prompts', {
      topic: 'Cyberpunk ramen shop',
      count: 2,
    });

    expect(res.success).toBe(true);
    const data = res.data as { prompts: string[]; topic: string };
    expect(data.prompts.length).toBe(2);
    expect(data.prompts[0]).toContain('Cyberpunk ramen shop');
  });

  it('dispatches agent_run_qc with deterministic preflight', async () => {
    // 1920x1080 = ~2.07 MP, which is < 4 MP (should fail preflight)
    const resFail = await dispatchAgentTool('agent_run_qc', {
      filename: 'tiny.jpg',
      width: 1920,
      height: 1080,
      sizeBytes: 1_000_000,
    });

    expect(resFail.success).toBe(true);
    expect(resFail.actionCard?.type).toBe('qc_alert');

    // 4096x2160 = ~8.8 MP, should pass preflight
    const resPass = await dispatchAgentTool('agent_run_qc', {
      filename: '4k_clean.jpg',
      width: 4096,
      height: 2160,
      sizeBytes: 5_000_000,
    });

    expect(resPass.success).toBe(true);
    expect(resPass.actionCard).toBeUndefined();
  });

  it('dispatches agent_generate_metadata with 49 converging keywords', async () => {
    const res = await dispatchAgentTool('agent_generate_metadata', {
      subject: 'Minimalist coffee desk',
      category: 'Business',
    });

    expect(res.success).toBe(true);
    const data = res.data as { title: string; keywords: string; keywordsCount: number };
    expect(data.title).toContain('Minimalist coffee desk');
    expect(data.keywordsCount).toBe(49);
    expect(data.keywords.toLowerCase()).toContain('coffee');
    expect(data.keywords.toLowerCase()).toContain('desk');
  });

  it('runs AgentExecutor turn with reasoning and tool execution', async () => {
    const executor = new AgentExecutor('general-coworker', 'gemini');
    let thoughtLogged = '';
    const activities: string[] = [];

    const msg = await executor.runTurn('Tolong buatkan prompt Midjourney untuk kedai kopi modern', [], {
      onThinking: (t) => {
        thoughtLogged = t;
      },
      onActivity: (act) => {
        activities.push(act.title);
      },
    });

    expect(thoughtLogged).toContain('Menganalisis permintaan pengguna');
    expect(activities.length).toBeGreaterThan(0);
    expect(msg.role).toBe('assistant');
    expect(msg.toolCalls?.length).toBeGreaterThan(0);
    expect(msg.content).toContain('Variasi #1');
    expect(msg.content).toContain('--ar 16:9 --v 6.1');
  });
});
