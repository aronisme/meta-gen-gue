// lib/agent/types.ts
/**
 * Types and data models for MetaGen Omnigent Live AI Agent.
 * Adopts core concepts from Omnigent: Smart Key Rotation, In-Process Agent Loop,
 * Modular Playbook Skills, and Deterministic Tool Registry.
 */

export type ProviderType = 'gemini' | 'groq' | 'openai' | 'deepseek' | 'custom';

export type KeyStatus =
  | 'active'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'invalid'
  | 'paused';

export interface ProviderKey {
  id: string;
  providerId: ProviderType;
  name: string;
  keyValue: string;
  keyMasked: string;
  baseUrl?: string;
  priority: number; // 1 = Primary, 2 = Secondary, 3 = Fallback
  weight: number;
  status: KeyStatus;
  rateLimitResetAt?: number; // timestamp in ms when cooldown ends
  consecutiveErrors: number;
  lastUsedAt?: number;
  latencyMs?: number;
  callCount: number;
  errorCount: number;
}

export interface KeyLease {
  keyId: string;
  providerId: ProviderType;
  keyValue: string;
  keyMasked: string;
  baseUrl?: string;
  priority: number;
  weight: number;
}

export interface ToolParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  enum?: string[];
  items?: { type: string };
  properties?: Record<string, ToolParameterSchema>;
  required?: string[];
}

export interface AgentToolSpec {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterSchema>;
    required?: string[];
  };
  requiresConfirmation?: boolean; // Zero-Accident Guard: require user click before executing
}

export interface AgentToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'pending_confirmation' | 'executing' | 'success' | 'error';
  result?: unknown;
  error?: string;
}

export interface AgentToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  message?: string;
  actionCard?: {
    type: 'upload_confirm' | 'metadata_review' | 'qc_alert' | 'flow_download';
    title: string;
    description: string;
    payload?: unknown;
  };
}

export interface AgentSkill {
  id: string;
  name: string;
  tagline: string;
  iconName: string;
  systemPrompt: string;
  recommendedTools: string[];
}

export type AgentRole = 'user' | 'assistant' | 'system' | 'tool';

export interface AgentMessage {
  id: string;
  role: AgentRole;
  content: string;
  reasoning?: string; // Chain-of-thought thinking
  toolCalls?: AgentToolCall[];
  toolCallId?: string;
  timestamp: number;
}

export interface AgentActivityLog {
  id: string;
  timestamp: number;
  level: 'info' | 'success' | 'warn' | 'error';
  type: 'tool' | 'key_rotator' | 'brain' | 'bridge' | 'extension';
  title: string;
  details?: string;
}

export interface AgentSessionState {
  sessionId: string;
  title: string;
  activeSkillId: string;
  activeProvider: ProviderType;
  messages: AgentMessage[];
  activityLogs: AgentActivityLog[];
  isThinking: boolean;
  isExecutingTool: boolean;
  currentToolName?: string;
}
