// ============================================================
// TurionZ — Create Sub-Agent Tool (Built-in)
// Created by BollaNetwork
// ============================================================

import { BaseTool } from '../BaseTool';
import { ToolResult } from '../../types';
import { SubAgentManager } from '../../agents/SubAgentManager';

const SUPPORTED_MODELS = [
  'anthropic/claude-sonnet-4',
  'anthropic/claude-haiku-4',
  'google/gemini-2.5-pro',
  'google/gemini-2.5-flash',
  'openai/gpt-4.1',
  'openai/gpt-4.1-mini',
  'deepseek/deepseek-r1',
  'meta-llama/llama-4-maverick',
];

export class CreateSubAgentTool extends BaseTool {
  readonly name = 'create_sub_agent';
  readonly description =
    'Create and run a sub-agent to delegate a task. The sub-agent runs with its own model and returns the result when complete. A verifier is auto-created to validate the work.';
  readonly parameters = {
    type: 'object',
    properties: {
      briefing: {
        type: 'string',
        description: 'Detailed task description for the sub-agent',
      },
      model: {
        type: 'string',
        description: `LLM model to use. Supported: ${SUPPORTED_MODELS.join(', ')}`,
      },
      skills: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional skill names the sub-agent should use',
      },
      criteria: {
        type: 'string',
        description: 'Success criteria the verifier will check against',
      },
      dependencies: {
        type: 'array',
        items: { type: 'string' },
        description: 'Agent IDs this sub-agent depends on (waits for them to finish first)',
      },
    },
    required: ['briefing', 'model'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const briefing = args.briefing as string;
    const model = args.model as string;
    const skills = (args.skills as string[]) || [];
    const criteria = (args.criteria as string) || '';
    const dependencies = (args.dependencies as string[]) || [];

    if (!briefing || briefing.trim().length === 0) {
      return this.error('Briefing cannot be empty.');
    }

    if (!model || model.trim().length === 0) {
      return this.error('Model must be specified.');
    }

    // Validate model is in supported list
    if (!SUPPORTED_MODELS.includes(model)) {
      return this.error(
        `Model '${model}' is not supported. Choose from: ${SUPPORTED_MODELS.join(', ')}`
      );
    }

    try {
      const manager = SubAgentManager.getInstance();

      // Create the sub-agent
      const agentId = await manager.createSubAgent({
        briefing,
        model,
        skills,
        criteria,
        dependencies,
      });

      // Run the sub-agent (blocks until complete)
      const result = await manager.runSubAgent(agentId);

      return this.success(
        JSON.stringify({
          agentId,
          status: result.status,
          result: result.response,
          metrics: {
            duration: result.metrics.totalDuration,
            tokensIn: result.metrics.totalTokensIn,
            tokensOut: result.metrics.totalTokensOut,
            iterations: result.metrics.iterationsUsed,
          },
        })
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return this.error(`Failed to create/run sub-agent: ${errMsg}`);
    }
  }
}
