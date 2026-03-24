// ============================================================
// TurionZ — OpenRouter LLM Provider
// Created by BollaNetwork
// ============================================================

import { ILlmProvider } from './ILlmProvider';
import { LlmMessage, LlmResponse, LlmConfig, ToolDefinition, ToolCall } from '../types';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const DEFAULT_CONFIG: LlmConfig = {
  model: 'anthropic/claude-sonnet-4',
  temperature: 0.7,
  maxTokens: 4096,
  timeout: 120000,
};

// Errors that should NOT be retried
const PERMANENT_ERROR_CODES = [400, 401, 403, 404];

export class OpenRouterProvider implements ILlmProvider {
  private apiKey: string;
  private model: string;
  private maxRetries: number;
  private retryDelays: number[];

  constructor(apiKey: string, model?: string, maxRetries: number = 3) {
    this.apiKey = apiKey;
    this.model = model || DEFAULT_CONFIG.model;
    this.maxRetries = maxRetries;
    this.retryDelays = [1000, 3000, 6000]; // 1s, 3s, 6s
  }

  getModelName(): string {
    return this.model;
  }

  async chat(
    messages: LlmMessage[],
    tools?: ToolDefinition[],
    config?: Partial<LlmConfig>
  ): Promise<LlmResponse> {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    if (config?.model) {
      this.model = config.model;
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map(m => this.formatMessage(m)),
      temperature: mergedConfig.temperature,
      max_tokens: mergedConfig.maxTokens,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const timeout = mergedConfig.timeout || DEFAULT_CONFIG.timeout!;

    return this.executeWithRetry(body, timeout);
  }

  private async executeWithRetry(
    body: Record<string, unknown>,
    timeout: number
  ): Promise<LlmResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.executeRequest(body, timeout);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if this is a permanent error (no retry)
        if (this.isPermanentError(lastError)) {
          throw lastError;
        }

        // If we have retries left, wait and try again
        if (attempt < this.maxRetries) {
          const delay = this.retryDelays[attempt] || 6000;
          console.log(
            `[OpenRouter] Retry ${attempt + 1}/${this.maxRetries} after ${delay}ms — ${lastError.message}`
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('OpenRouter request failed after all retries.');
  }

  private async executeRequest(
    body: Record<string, unknown>,
    timeout: number
  ): Promise<LlmResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://bollanetwork.com',
          'X-Title': 'TurionZ by BollaNetwork',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const error = new Error(`OpenRouter API error ${response.status}: ${errorBody}`);
        (error as any).statusCode = response.status;
        throw error;
      }

      const data = await response.json() as any;
      return this.parseResponse(data);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError = new Error(`OpenRouter request timed out after ${timeout}ms`);
        (timeoutError as any).statusCode = 408;
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parseResponse(data: any): LlmResponse {
    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error('OpenRouter returned empty response (no choices).');
    }

    const message = choice.message;
    const toolCalls: ToolCall[] = (message.tool_calls || []).map((tc: any) => ({
      id: tc.id,
      type: 'function' as const,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    }));

    return {
      content: message.content || null,
      toolCalls,
      tokensIn: data.usage?.prompt_tokens || 0,
      tokensOut: data.usage?.completion_tokens || 0,
    };
  }

  private formatMessage(msg: LlmMessage): Record<string, unknown> {
    const formatted: Record<string, unknown> = {
      role: msg.role,
      content: msg.content,
    };

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      formatted.tool_calls = msg.tool_calls;
    }

    if (msg.tool_call_id) {
      formatted.tool_call_id = msg.tool_call_id;
    }

    if (msg.name) {
      formatted.name = msg.name;
    }

    return formatted;
  }

  private isPermanentError(error: Error): boolean {
    const statusCode = (error as any).statusCode;
    return PERMANENT_ERROR_CODES.includes(statusCode);
  }
}
