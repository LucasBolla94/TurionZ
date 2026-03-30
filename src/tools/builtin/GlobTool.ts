// ============================================================
// TurionZ — Glob Search Tool (Built-in)
// Created by BollaNetwork
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { BaseTool } from '../BaseTool';
import { ToolResult } from '../../types';

export class GlobTool extends BaseTool {
  readonly name = 'glob_search';
  readonly description =
    'Find files matching a glob pattern (e.g., "**/*.ts", "src/**/*.json"). Returns matching file paths.';
  readonly parameters = {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern to match (e.g., "**/*.ts")',
      },
      path: {
        type: 'string',
        description: 'Base directory to search in (default: current working directory)',
      },
    },
    required: ['pattern'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const pattern = args.pattern as string;
    const basePath = (args.path as string) || process.cwd();

    if (!pattern || pattern.trim().length === 0) {
      return this.error('Pattern cannot be empty.');
    }

    if (!fs.existsSync(basePath)) {
      return this.error(`Directory not found: ${basePath}`);
    }

    try {
      const matches: string[] = [];
      const SKIP = new Set(['node_modules', '.git', 'dist', '.turionz_vault']);

      // Convert simple glob to regex
      const regexStr = pattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '{{GLOBSTAR}}')
        .replace(/\*/g, '[^/]*')
        .replace(/\{\{GLOBSTAR\}\}/g, '.*')
        .replace(/\?/g, '.');
      const regex = new RegExp(`^${regexStr}$`);

      this.walkDir(basePath, basePath, regex, matches, SKIP, 0);

      if (matches.length === 0) {
        return this.success(`No files found matching: ${pattern}`);
      }

      const limited = matches.slice(0, 200);
      const suffix =
        matches.length > 200
          ? `\n... and ${matches.length - 200} more`
          : '';

      return this.success(
        `Found ${matches.length} file(s) matching "${pattern}":\n${limited.join('\n')}${suffix}`
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return this.error(`Glob search failed: ${errMsg}`);
    }
  }

  private walkDir(
    rootPath: string,
    currentPath: string,
    regex: RegExp,
    matches: string[],
    skip: Set<string>,
    depth: number
  ): void {
    if (depth > 20) return;

    const entries = fs.readdirSync(currentPath);
    for (const entry of entries) {
      if (skip.has(entry)) continue;

      const fullPath = path.join(currentPath, entry);
      const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, '/');

      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          this.walkDir(rootPath, fullPath, regex, matches, skip, depth + 1);
        } else if (regex.test(relativePath)) {
          matches.push(relativePath);
        }
      } catch {
        // Skip inaccessible entries
      }
    }
  }
}
