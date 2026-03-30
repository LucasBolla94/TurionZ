// ============================================================
// TurionZ — Agent Loop (ReAct Reasoning Engine)
// Created by BollaNetwork
// ============================================================

import { ILlmProvider } from '../providers/ILlmProvider';
import { ToolFactory } from '../tools/ToolFactory';
import { ActivityLogger } from '../infra/ActivityLogger';
import { RecoveryManager } from '../infra/RecoveryManager';
import {
  AgentLoopInput,
  AgentLoopOutput,
  AgentLoopMetrics,
  AgentLoopStatus,
  LlmMessage,
  ToolCall,
  ToolResult,
  MessageFlags,
} from '../types';

const DEFAULT_MAX_ITERATIONS = 15;
const DEFAULT_MAX_TOOLS_PER_ROUND = 5;

interface IterationLog {
  iteration: number;
  action: 'thought' | 'tool_call' | 'observation' | 'final_answer' | 'json_error';
  toolName?: string;
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
}

export class AgentLoop {
  private provider: ILlmProvider;
  private toolFactory: ToolFactory;
  private abortFlag: boolean = false;
  private onProgress?: (message: string) => void;
  private activityLogger: ActivityLogger;
  private recoveryManager: RecoveryManager;
  private agentId?: string;

  constructor(provider: ILlmProvider, onProgress?: (message: string) => void, agentId?: string) {
    this.provider = provider;
    this.toolFactory = new ToolFactory();
    this.onProgress = onProgress;
    this.activityLogger = ActivityLogger.getInstance();
    this.recoveryManager = RecoveryManager.getInstance();
    this.agentId = agentId;
  }

  requestAbort(): void {
    this.abortFlag = true;
  }

  isAbortRequested(): boolean {
    return this.abortFlag;
  }

  async run(input: AgentLoopInput): Promise<AgentLoopOutput> {
    const maxIterations = input.config.maxIterations || DEFAULT_MAX_ITERATIONS;
    const maxToolsPerRound = input.config.maxToolsPerRound || DEFAULT_MAX_TOOLS_PER_ROUND;

    this.abortFlag = false;

    const messages: LlmMessage[] = [
      { role: 'system', content: input.systemPrompt },
      ...input.messages,
    ];

    const metrics: AgentLoopMetrics = {
      totalDuration: 0,
      totalTokensIn: 0,
      totalTokensOut: 0,
      iterationsUsed: 0,
      toolsCalled: [],
    };

    const loopStart = Date.now();
    let status: AgentLoopStatus = 'completed';
    let finalResponse = '';

    console.log(`[AgentLoop] Starting ReAct loop (max ${maxIterations} iterations)`);

    // Log loop start
    await this.activityLogger.logAgentLifecycle(this.agentId, 'run', {
      maxIterations,
      maxToolsPerRound,
    });

    const checkpointKey = this.agentId ? `agent_loop:${this.agentId}` : 'agent_loop:main';

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      // --- Save checkpoint before each iteration ---
      await this.recoveryManager.saveCheckpoint(checkpointKey, {
        iteration,
        messageCount: messages.length,
        toolsCalled: metrics.toolsCalled,
        tokensUsed: metrics.totalTokensIn + metrics.totalTokensOut,
      }, iteration);

      // --- Health check before each iteration ---
      if (this.abortFlag) {
        status = 'aborted';
        finalResponse = 'Ok, parei o processamento!';
        console.log(`[AgentLoop] Aborted at iteration ${iteration}`);
        break;
      }

      const iterStart = Date.now();
      console.log(`[AgentLoop] --- Iteration ${iteration}/${maxIterations} ---`);

      // --- Call LLM (with retry on transient errors) ---
      let response;
      let llmRetries = 0;
      const maxLlmRetries = 2;
      while (true) {
        try {
          response = await this.provider.chat(messages, input.tools);
          break; // Success
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          llmRetries++;

          // Permanent errors — don't retry
          if (errMsg.includes('401') || errMsg.includes('403') || errMsg.includes('not a valid model')) {
            console.error(`[AgentLoop] LLM permanent error: ${errMsg}`);
            status = 'error';
            finalResponse = `Erro de configuração: ${errMsg}. Verifique o modelo e a API key.`;
            break;
          }

          // Transient errors — retry up to 2 times
          if (llmRetries <= maxLlmRetries) {
            console.warn(`[AgentLoop] LLM error (retry ${llmRetries}/${maxLlmRetries}): ${errMsg}`);
            await new Promise(r => setTimeout(r, llmRetries * 2000));
            continue;
          }

          console.error(`[AgentLoop] LLM error after ${maxLlmRetries} retries: ${errMsg}`);
          status = 'error';
          finalResponse = 'Falha na comunicação com o provedor de IA. Tente novamente.';
          break;
        }
      }
      if (status === 'error' || !response) break;

      const llmDuration = Date.now() - iterStart;
      metrics.totalTokensIn += response.tokensIn;
      metrics.totalTokensOut += response.tokensOut;
      metrics.iterationsUsed = iteration;

      // Log LLM call
      await this.activityLogger.logLlmCall(
        this.agentId,
        input.config.maxIterations ? 'main' : 'unknown',
        response.tokensIn,
        response.tokensOut,
        llmDuration
      );

      // --- Check if it's a final answer (no tool calls) ---
      if (response.toolCalls.length === 0) {
        finalResponse = response.content || '';
        const iterDuration = Date.now() - iterStart;
        this.logIteration({
          iteration,
          action: 'final_answer',
          durationMs: iterDuration,
          tokensIn: response.tokensIn,
          tokensOut: response.tokensOut,
        });
        console.log(`[AgentLoop] Final answer received at iteration ${iteration}`);
        break;
      }

      // --- Process tool calls ---
      // Add assistant message with tool calls to the conversation
      messages.push({
        role: 'assistant',
        content: response.content,
        tool_calls: response.toolCalls,
      });

      // Limit tools per round
      const toolCalls = response.toolCalls.slice(0, maxToolsPerRound);
      if (response.toolCalls.length > maxToolsPerRound) {
        console.log(
          `[AgentLoop] LLM requested ${response.toolCalls.length} tools. Executing first ${maxToolsPerRound}.`
        );
      }

      // Execute each tool sequentially
      for (const toolCall of toolCalls) {
        // Health check before each tool
        if (this.abortFlag) {
          console.log(`[AgentLoop] Abort detected during tool execution`);
          messages.push({
            role: 'tool',
            content: 'Processing was aborted by the user.',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
          });
          break;
        }

        const toolResult = await this.executeSingleTool(toolCall, iteration, metrics);
        messages.push({
          role: 'tool',
          content: toolResult.output,
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
        });
      }

      // Notify about tools that were not executed (over limit)
      if (response.toolCalls.length > maxToolsPerRound) {
        const skipped = response.toolCalls.length - maxToolsPerRound;
        const skippedNames = response.toolCalls
          .slice(maxToolsPerRound)
          .map(tc => tc.function.name)
          .join(', ');
        messages.push({
          role: 'tool',
          content: `${skipped} tools were not executed this round (limit: ${maxToolsPerRound}). Skipped: ${skippedNames}. Request them again if needed.`,
          tool_call_id: response.toolCalls[maxToolsPerRound].id,
          name: response.toolCalls[maxToolsPerRound].function.name,
        });
      }

      // Check if abort was set during tool execution
      if (this.abortFlag) {
        status = 'aborted';
        finalResponse = 'Ok, parei o processamento!';
        break;
      }

      const iterDuration = Date.now() - iterStart;
      this.logIteration({
        iteration,
        action: 'tool_call',
        toolName: toolCalls.map(tc => tc.function.name).join(', '),
        durationMs: iterDuration,
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
      });

      // Progress notification
      if (this.onProgress) {
        this.onProgress(
          `Iteration ${iteration}/${maxIterations} — Used tools: ${toolCalls.map(tc => tc.function.name).join(', ')}`
        );
      }

      // Check if this was the last iteration
      if (iteration === maxIterations) {
        // Last chance: force LLM to summarize what it has so far
        console.log(`[AgentLoop] Max iterations reached. Forcing final summary...`);
        messages.push({
          role: 'user',
          content: 'You MUST answer NOW with whatever information you have. Do NOT call any more tools. Give the user a direct answer based on the tool results you already received. Be concise.',
        });

        try {
          const finalAttempt = await this.provider.chat(messages, []); // No tools = forced text response
          if (finalAttempt.content && finalAttempt.content.trim().length > 0) {
            finalResponse = finalAttempt.content;
            status = 'completed';
            metrics.totalTokensIn += finalAttempt.tokensIn;
            metrics.totalTokensOut += finalAttempt.tokensOut;
          } else {
            status = 'max_iterations';
            finalResponse = 'Não consegui completar. Tente de novo com um pedido mais simples.';
          }
        } catch {
          status = 'max_iterations';
          finalResponse = 'Não consegui completar. Tente de novo.';
        }
      }
    }

    // --- Task Completion Guard ---
    // If final response is empty or looks incomplete, force one more LLM call
    if (status === 'completed' && finalResponse && this.looksIncomplete(finalResponse)) {
      console.log('[AgentLoop] Response looks incomplete. Running completion guard...');
      messages.push({
        role: 'user',
        content: 'Your response seems incomplete. Please provide a COMPLETE, DIRECT answer to the original question. Use the tool results you already have. Do NOT describe what you would do — just answer.',
      });

      try {
        const guardResponse = await this.provider.chat(messages, []);
        if (guardResponse.content && guardResponse.content.trim().length > 10) {
          finalResponse = guardResponse.content;
          metrics.totalTokensIn += guardResponse.tokensIn;
          metrics.totalTokensOut += guardResponse.tokensOut;
        }
      } catch {
        // Keep original response
      }
    }

    metrics.totalDuration = Date.now() - loopStart;

    console.log(
      `[AgentLoop] Loop finished — status: ${status} | ${metrics.iterationsUsed} iterations | ${metrics.totalDuration}ms | ${metrics.totalTokensIn}in/${metrics.totalTokensOut}out tokens`
    );

    // Log loop completion
    await this.activityLogger.logAgentLifecycle(
      this.agentId,
      status === 'completed' ? 'complete' : 'fail',
      {
        status,
        iterations: metrics.iterationsUsed,
        totalDuration: metrics.totalDuration,
        totalTokensIn: metrics.totalTokensIn,
        totalTokensOut: metrics.totalTokensOut,
        toolsCalled: metrics.toolsCalled,
      }
    );

    // Clear checkpoint on successful completion
    if (status === 'completed') {
      await this.recoveryManager.clearCheckpoint(checkpointKey);
    }

    return {
      response: finalResponse,
      flags: input.flags,
      metrics,
      status,
    };
  }

  private async executeSingleTool(
    toolCall: ToolCall,
    iteration: number,
    metrics: AgentLoopMetrics
  ): Promise<ToolResult> {
    const toolName = toolCall.function.name;
    let args: Record<string, unknown>;

    // Validate JSON before executing
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch {
      console.warn(`[AgentLoop] Invalid JSON from LLM for tool ${toolName}. Asking for correction.`);
      // JSON error does NOT count as iteration
      return {
        success: false,
        output: `JSON inválido nos argumentos de '${toolName}'. Corrija a estrutura e reenvie.`,
      };
    }

    console.log(`[AgentLoop] Executing tool: ${toolName}(${JSON.stringify(args)})`);

    const toolStart = Date.now();
    const result = await this.toolFactory.executeTool(toolName, args);
    const toolDuration = Date.now() - toolStart;
    metrics.toolsCalled.push(toolName);

    // Log tool call
    await this.activityLogger.logToolCall(
      this.agentId,
      toolName,
      args,
      result.output,
      toolDuration
    );

    const formatted = this.toolFactory.formatResult(toolName, args, result);
    console.log(`[AgentLoop]   ${formatted}`);

    return result;
  }

  private looksIncomplete(response: string): boolean {
    if (!response || response.trim().length === 0) return true;

    const lower = response.toLowerCase();
    const incompletePatterns = [
      'vou tentar',
      'vou buscar',
      'vou criar',
      'vou fazer',
      'vou verificar',
      'vou procurar',
      'vou pesquisar',
      'um segundo',
      'um momento',
      'aguarde',
      'tentando',
      'buscando',
      'processando',
      'let me',
      'i will',
      'working on',
      'fica tranquilo',
      'já resolvo',
      'resultado veio como null',
      'deu um pequeno erro',
      'parece que deu erro',
      'console.log',
      'depurar',
    ];

    return incompletePatterns.some(p => lower.includes(p));
  }

  private logIteration(log: IterationLog): void {
    const parts = [
      `Iteration ${log.iteration}`,
      `${log.durationMs}ms`,
      log.action,
    ];
    if (log.toolName) {
      parts.push(`tools: ${log.toolName}`);
    }
    parts.push(`tokens: ${log.tokensIn}in/${log.tokensOut}out`);

    console.log(`[AgentLoop] [${parts.join(' | ')}]`);
  }
}
