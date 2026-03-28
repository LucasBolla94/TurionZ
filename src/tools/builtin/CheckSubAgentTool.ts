// ============================================================
// TurionZ — Check Sub-Agent Tool (Built-in)
// Created by BollaNetwork
// ============================================================

import { BaseTool } from '../BaseTool';
import { ToolResult } from '../../types';
import { SubAgentManager } from '../../agents/SubAgentManager';

export class CheckSubAgentTool extends BaseTool {
  readonly name = 'check_sub_agent';
  readonly description =
    'Check status of sub-agents. If agentId is provided, returns detailed status for that agent. If omitted, returns a list of all active sub-agents.';
  readonly parameters = {
    type: 'object',
    properties: {
      agentId: {
        type: 'string',
        description: 'Optional: specific agent ID to check. Omit to list all active agents.',
      },
    },
    required: [],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const agentId = args.agentId as string | undefined;

    try {
      const manager = SubAgentManager.getInstance();

      if (agentId) {
        // Specific agent status
        const progress = await manager.getProgress(agentId);
        const metrics = await manager.getAgentMetrics(agentId);

        return this.success(
          JSON.stringify({
            agentId,
            status: progress.status,
            childCount: progress.childCount,
            metrics: metrics.own
              ? {
                  duration: metrics.own.duration,
                  tokensIn: metrics.own.tokensIn,
                  tokensOut: metrics.own.tokensOut,
                  iterations: metrics.own.iterations,
                  toolsCalled: metrics.own.toolsCalled,
                }
              : null,
            aggregatedMetrics: {
              duration: metrics.aggregated.duration,
              tokensIn: metrics.aggregated.tokensIn,
              tokensOut: metrics.aggregated.tokensOut,
              iterations: metrics.aggregated.iterations,
            },
          })
        );
      } else {
        // List all active sub-agents
        const activeAgents = await manager.listActive();

        if (activeAgents.length === 0) {
          return this.success('No active sub-agents.');
        }

        const summary = activeAgents.map((a) => ({
          id: a.id,
          role: a.role,
          model: a.model,
          level: a.level,
          status: a.status,
          briefing: a.briefing.substring(0, 100) + (a.briefing.length > 100 ? '...' : ''),
        }));

        return this.success(JSON.stringify({ activeAgents: summary }));
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return this.error(`Failed to check sub-agent status: ${errMsg}`);
    }
  }
}
