// ============================================================
// TurionZ — Memory Search Tool (Built-in)
// Created by BollaNetwork
// ============================================================

import { BaseTool } from '../BaseTool';
import { ToolResult } from '../../types';
import { MemoryManager } from '../../memory/MemoryManager';

export class MemorySearchTool extends BaseTool {
  readonly name = 'memory_search';
  readonly description = 'Search past conversations by meaning/topic. Use this when the user asks about something discussed previously.';
  readonly parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'What to search for in past conversations',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 5)',
      },
    },
    required: ['query'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const query = args.query as string;
    const limit = (args.limit as number) || 5;

    if (!query || query.trim().length === 0) {
      return this.error('Query cannot be empty.');
    }

    try {
      const memory = MemoryManager.getInstance();
      const results = await memory.memorySearch(query, limit);

      if (results.length === 0) {
        return this.success('No relevant past conversations found for this query.');
      }

      const formatted = results.map((r, i) => `${i + 1}. ${r}`).join('\n');
      return this.success(`Found ${results.length} relevant results:\n${formatted}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return this.error(`Memory search failed: ${errMsg}`);
    }
  }
}
