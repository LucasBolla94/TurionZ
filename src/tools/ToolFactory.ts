// ============================================================
// TurionZ — Tool Factory
// Created by BollaNetwork
// ============================================================

import { BaseTool } from './BaseTool';
import { ToolRegistry } from './ToolRegistry';
import { ToolResult } from '../types';

export class ToolFactory {
  private registry: ToolRegistry;

  constructor() {
    this.registry = ToolRegistry.getInstance();
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.registry.get(name);

    if (!tool) {
      return {
        success: false,
        output: `ERROR: Tool '${name}' not found in registry.`,
      };
    }

    try {
      const startTime = Date.now();
      const result = await Promise.race([
        tool.execute(args),
        this.createTimeout(30000, name),
      ]);
      const duration = Date.now() - startTime;

      console.log(
        `[ToolFactory] ${name} executed in ${duration}ms — ${result.success ? 'SUCCESS' : 'FAILED'}`
      );

      return result;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[ToolFactory] ${name} threw error: ${errMsg}`);
      return {
        success: false,
        output: `ERROR: Tool '${name}' failed — ${errMsg}`,
      };
    }
  }

  formatResult(toolName: string, args: Record<string, unknown>, result: ToolResult): string {
    const argsStr = JSON.stringify(args);
    const statusIcon = result.success ? '✅' : '❌';
    return `${statusIcon} ${toolName}(${argsStr}) → ${result.output}`;
  }

  private createTimeout(ms: number, toolName: string): Promise<ToolResult> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Tool '${toolName}' timed out after ${ms}ms`));
      }, ms);
    });
  }
}
