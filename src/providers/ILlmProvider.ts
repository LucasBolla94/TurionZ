// ============================================================
// TurionZ — LLM Provider Interface
// Created by BollaNetwork
// ============================================================

import { LlmMessage, LlmResponse, LlmConfig, ToolDefinition } from '../types';

export interface ILlmProvider {
  chat(
    messages: LlmMessage[],
    tools?: ToolDefinition[],
    config?: Partial<LlmConfig>
  ): Promise<LlmResponse>;

  getModelName(): string;
}
