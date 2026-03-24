// ============================================================
// TurionZ — Base Tool (Abstract Class)
// Created by BollaNetwork
// ============================================================

import { ToolResult, ToolDefinition } from '../types';

export abstract class BaseTool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: Record<string, unknown>;

  abstract execute(args: Record<string, unknown>): Promise<ToolResult>;

  toDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }

  protected success(output: string): ToolResult {
    return { success: true, output };
  }

  protected error(message: string): ToolResult {
    return { success: false, output: `ERROR: ${message}` };
  }
}
