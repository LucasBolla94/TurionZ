// ============================================================
// TurionZ — Communicate Sub-Agent Tool (Built-in)
// Created by BollaNetwork
// ============================================================

import { BaseTool } from '../BaseTool';
import { ToolResult } from '../../types';
import { SubAgentManager } from '../../agents/SubAgentManager';

export class CommunicateSubAgentTool extends BaseTool {
  readonly name = 'communicate_sub_agent';
  readonly description =
    'Pass data between sub-agents through TurionZ (centralized communication). All inter-agent communication goes through TurionZ — sub-agents never talk directly.';
  readonly parameters = {
    type: 'object',
    properties: {
      fromId: {
        type: 'string',
        description: 'Agent ID sending the data',
      },
      toId: {
        type: 'string',
        description: 'Agent ID receiving the data',
      },
      data: {
        type: 'object',
        description: 'Data to pass between agents',
      },
    },
    required: ['fromId', 'toId', 'data'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const fromId = args.fromId as string;
    const toId = args.toId as string;
    const data = args.data as Record<string, unknown>;

    if (!fromId || fromId.trim().length === 0) {
      return this.error('fromId is required.');
    }

    if (!toId || toId.trim().length === 0) {
      return this.error('toId is required.');
    }

    if (!data || typeof data !== 'object') {
      return this.error('data must be a valid object.');
    }

    try {
      const manager = SubAgentManager.getInstance();

      // Send data through centralized communication (REQ-033)
      await manager.communicateResult(fromId, toId, data);

      // Also retrieve any pending messages for the receiving agent
      const pendingMessages = await manager.getMessagesFor(toId);

      return this.success(
        JSON.stringify({
          sent: true,
          from: fromId,
          to: toId,
          pendingMessagesForRecipient: pendingMessages.length,
        })
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return this.error(`Failed to communicate between agents: ${errMsg}`);
    }
  }
}
