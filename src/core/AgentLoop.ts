// ============================================================
// TurionZ — Agent Loop (ReAct Reasoning Engine)
// Created by BollaNetwork
// ============================================================

import { ILlmProvider } from '../providers/ILlmProvider';
import { ToolFactory } from '../tools/ToolFactory';
import { ActivityLogger } from '../infra/ActivityLogger';
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

const DEFAULT_MAX_ITERATIONS = 5;
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
  private agentId?: string;

  constructor(provider: ILlmProvider, onProgress?: (message: string) => void, agentId?: string) {
    this.provider = provider;
    this.toolFactory = new ToolFactory();
    this.onProgress = onProgress;
    this.activityLogger = ActivityLogger.getInstance();
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

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      // --- Health check before each iteration ---
      if (this.abortFlag) {
        status = 'aborted';
        finalResponse = 'Ok, parei o processamento!';
        console.log(`[AgentLoop] Aborted at iteration ${iteration}`);
        break;
      }

      const iterStart = Date.now();
      console.log(`[AgentLoop] --- Iteration ${iteration}/${maxIterations} ---`);

      // --- Call LLM ---
      let response;
      try {
        response = await this.provider.chat(messages, input.tools);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[AgentLoop] LLM error: ${errMsg}`);
        status = 'error';
        finalResponse = 'Falha na comunicação com o provedor de IA. Tente novamente.';
        break;
      }

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
        status = 'max_iterations';
        finalResponse =
          'Desculpe, não consegui concluir a tarefa dentro do limite de processamento. Tente reformular o pedido.';
        console.log(`[AgentLoop] Max iterations (${maxIterations}) reached.`);
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
