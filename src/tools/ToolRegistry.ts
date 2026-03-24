// ============================================================
// TurionZ — Tool Registry (Dynamic Registration)
// Created by BollaNetwork
// ============================================================

import { BaseTool } from './BaseTool';
import { ToolDefinition } from '../types';

export class ToolRegistry {
  private static instance: ToolRegistry;
  private tools: Map<string, BaseTool> = new Map();

  private constructor() {}

  static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  register(tool: BaseTool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] Overwriting existing tool: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    console.log(`[ToolRegistry] Registered tool: ${tool.name}`);
  }

  unregister(name: string): boolean {
    const removed = this.tools.delete(name);
    if (removed) {
      console.log(`[ToolRegistry] Unregistered tool: ${name}`);
    }
    return removed;
  }

  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  listAll(): BaseTool[] {
    return Array.from(this.tools.values());
  }

  listNames(): string[] {
    return Array.from(this.tools.keys());
  }

  count(): number {
    return this.tools.size;
  }

  toDefinitions(): ToolDefinition[] {
    return this.listAll().map(tool => tool.toDefinition());
  }

  clear(): void {
    this.tools.clear();
  }
}
