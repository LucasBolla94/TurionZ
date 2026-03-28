// ============================================================
// TurionZ — Tipos e Interfaces Compartilhadas
// Created by BollaNetwork
// ============================================================

// --- Internal Message (formato padronizado do Gateway) ---

export interface Attachment {
  type: 'pdf' | 'md' | 'audio' | 'image';
  data: Buffer;
  filename: string;
  mimeType: string;
}

export interface MessageFlags {
  requires_audio_reply: boolean;
  source_type: 'text' | 'voice' | 'document';
  voice_id?: string;
}

export interface InternalMessage {
  id: string;
  userId: string;
  platform: 'telegram' | 'whatsapp' | 'discord' | 'api';
  conversationId: string;
  type: 'text' | 'document' | 'voice' | 'audio';
  content: string;
  attachments: Attachment[];
  flags: MessageFlags;
  timestamp: Date;
}

// --- Agent Loop ---

export interface AgentLoopConfig {
  maxIterations: number;
  llmTimeout: number;
  retryAttempts: number;
  maxToolsPerRound: number;
}

export interface AgentLoopInput {
  messages: LlmMessage[];
  systemPrompt: string;
  tools: ToolDefinition[];
  flags: MessageFlags;
  config: AgentLoopConfig;
}

export interface AgentLoopMetrics {
  totalDuration: number;
  totalTokensIn: number;
  totalTokensOut: number;
  iterationsUsed: number;
  toolsCalled: string[];
}

export type AgentLoopStatus = 'completed' | 'max_iterations' | 'aborted' | 'error';

export interface AgentLoopOutput {
  response: string;
  flags: MessageFlags;
  metrics: AgentLoopMetrics;
  status: AgentLoopStatus;
}

// --- LLM Provider ---

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LlmConfig {
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

export interface LlmResponse {
  content: string | null;
  toolCalls: ToolCall[];
  tokensIn: number;
  tokensOut: number;
}

// --- Tools ---

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolResult {
  success: boolean;
  output: string;
}

// --- Skills ---

export interface SkillMetadata {
  name: string;
  description: string;
  version: string;
  author: string;
  tools: string[];
  languages: string[];
  path: string;
}

export interface SkillToolManifest {
  name: string;
  description: string;
  language: string;
  parameters: Record<string, unknown>;
}

// --- Sub-Agents ---

export type AgentLevel = 0 | 1 | 2;
export type AgentRole = 'director' | 'worker' | 'verifier';
export type AgentStatus = 'created' | 'running' | 'waiting' | 'completed' | 'completed_with_issues' | 'failed' | 'cancelled';

export interface AgentConfig {
  model: string;
  skills: string[];
  criteria: string;
  maxIterations: number;
}

// --- Permissions ---

export interface Permission {
  id: string;
  action: string;
  category: string;
  isWildcard: boolean;
  granted: boolean;
  grantedBy: string | null;
  grantedAt: Date;
}

// --- Activity Logs ---

export type AgentType = 'turionz' | 'sub-agent' | 'sub-sub-agent';

export interface ActivityLog {
  agentType: AgentType;
  agentName: string;
  action: string;
  details: Record<string, unknown>;
  durationMs?: number;
  tokensUsed?: number;
}

// --- Activity Logger (Structured Logging) ---

export interface ActivityLogEntry {
  agentId?: string;
  component: string; // 'agent_loop' | 'sub_agent_manager' | 'controller' | 'gateway' | 'system'
  action: string;
  details: Record<string, unknown>;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  durationMs?: number;
  createdAt?: Date;
}

export interface LogQueryFilters {
  component?: string;
  agentId?: string;
  action?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}
