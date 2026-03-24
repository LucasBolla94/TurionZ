// ============================================================
// TurionZ — Anthropic Provider (Direct API for Claude Opus 4.6)
// Created by BollaNetwork
// ============================================================

import { ILlmProvider } from './ILlmProvider';
import { LlmMessage, LlmResponse, LlmConfig, ToolDefinition, ToolCall } from '../types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

const DEFAULT_CONFIG: LlmConfig = {
  model: 'claude-opus-4-6',
  temperature: 0.7,
  maxTokens: 8096,
  timeout: 120000,
};

const PERMANENT_ERROR_CODES = [400, 401, 403, 404];

export class AnthropicProvider implements ILlmProvider {
  private apiKey: string;
  private model: string;
  private maxRetries: number;
  private retryDelays: number[];

  constructor(apiKey: string, model?: string, maxRetries: number = 3) {
    this.apiKey = apiKey;
    this.model = model || DEFAULT_CONFIG.model;
    this.maxRetries = maxRetries;
    this.retryDelays = [1000, 3000, 6000];
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

    // Anthropic API separates system from messages
    const systemMessage = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: mergedConfig.maxTokens,
      temperature: mergedConfig.temperature,
      messages: chatMessages.map(m => this.formatMessage(m)),
    };

    if (systemMessage?.content) {
      body.system = systemMessage.content;
    }

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => this.formatTool(t));
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

        if (this.isPermanentError(lastError)) {
          throw lastError;
        }

        if (attempt < this.maxRetries) {
          const delay = this.retryDelays[attempt] || 6000;
          console.log(
            `[Anthropic] Retry ${attempt + 1}/${this.maxRetries} after ${delay}ms — ${lastError.message}`
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Anthropic request failed after all retries.');
  }

  private async executeRequest(
    body: Record<string, unknown>,
    timeout: number
  ): Promise<LlmResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const error = new Error(`Anthropic API error ${response.status}: ${errorBody}`);
        (error as any).statusCode = response.status;
        throw error;
      }

      const data = await response.json() as any;
      return this.parseResponse(data);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError = new Error(`Anthropic request timed out after ${timeout}ms`);
        (timeoutError as any).statusCode = 408;
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parseResponse(data: any): LlmResponse {
    // Anthropic returns content as array of blocks
    const contentBlocks: any[] = data.content || [];
    let textContent = '';
    const toolCalls: ToolCall[] = [];

    for (const block of contentBlocks) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input),
          },
        });
      }
    }

    return {
      content: textContent || null,
      toolCalls,
      tokensIn: data.usage?.input_tokens || 0,
      tokensOut: data.usage?.output_tokens || 0,
    };
  }

  private formatMessage(msg: LlmMessage): Record<string, unknown> {
    // Anthropic format for tool results is different from OpenAI/OpenRouter
    if (msg.role === 'tool') {
      return {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: msg.tool_call_id,
          content: msg.content || '',
        }],
      };
    }

    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      const content: any[] = [];

      if (msg.content) {
        content.push({ type: 'text', text: msg.content });
      }

      for (const tc of msg.tool_calls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments),
        });
      }

      return { role: 'assistant', content };
    }

    return {
      role: msg.role,
      content: msg.content || '',
    };
  }

  private formatTool(tool: ToolDefinition): Record<string, unknown> {
    // Anthropic tool format
    return {
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters,
    };
  }

  private isPermanentError(error: Error): boolean {
    const statusCode = (error as any).statusCode;
    return PERMANENT_ERROR_CODES.includes(statusCode);
  }
}
