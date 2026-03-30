// ============================================================
// TurionZ — Grep Search Tool (Built-in)
// Created by BollaNetwork
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { BaseTool } from '../BaseTool';
import { ToolResult } from '../../types';

export class GrepTool extends BaseTool {
  readonly name = 'grep_search';
  readonly description =
    'Search file contents by regex pattern. Returns matching lines with file:line format. Optionally filter by file glob.';
  readonly parameters = {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Regular expression pattern to search for',
      },
      path: {
        type: 'string',
        description: 'Directory to search in (default: current working directory)',
      },
      glob: {
        type: 'string',
        description: 'File glob filter (e.g., "*.ts", "*.json")',
      },
    },
    required: ['pattern'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const pattern = args.pattern as string;
    const basePath = (args.path as string) || process.cwd();
    const globFilter = (args.glob as string) || '';

    if (!pattern || pattern.trim().length === 0) {
      return this.error('Pattern cannot be empty.');
    }

    if (!fs.existsSync(basePath)) {
      return this.error(`Directory not found: ${basePath}`);
    }

    try {
      const regex = new RegExp(pattern);
      const globRegex = globFilter ? this.globToRegex(globFilter) : null;
      const matches: string[] = [];
      const SKIP = new Set(['node_modules', '.git', 'dist', '.turionz_vault']);

      this.searchDir(basePath, basePath, regex, globRegex, matches, SKIP, 0);

      if (matches.length === 0) {
        return this.success(`No matches found for: ${pattern}`);
      }

      const limited = matches.slice(0, 100);
      const suffix =
        matches.length > 100
          ? `\n... and ${matches.length - 100} more matches`
          : '';

      return this.success(
        `Found ${matches.length} match(es) for "${pattern}":\n${limited.join('\n')}${suffix}`
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('Invalid regular expression')) {
        return this.error(`Invalid regex pattern: ${errMsg}`);
      }
      return this.error(`Grep search failed: ${errMsg}`);
    }
  }

  private globToRegex(glob: string): RegExp {
    const regexStr = glob
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`${regexStr}$`);
  }

  private searchDir(
    rootPath: string,
    currentPath: string,
    regex: RegExp,
    globRegex: RegExp | null,
    matches: string[],
    skip: Set<string>,
    depth: number
  ): void {
    if (depth > 20 || matches.length >= 500) return;

    const entries = fs.readdirSync(currentPath);
    for (const entry of entries) {
      if (skip.has(entry)) continue;

      const fullPath = path.join(currentPath, entry);

      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          this.searchDir(rootPath, fullPath, regex, globRegex, matches, skip, depth + 1);
        } else {
          // Apply glob filter
          if (globRegex && !globRegex.test(entry)) continue;

          // Skip binary files (simple heuristic)
          if (stat.size > 1024 * 1024) continue;

          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, '/');

          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              matches.push(`${relativePath}:${i + 1}: ${lines[i].trim()}`);
              if (matches.length >= 500) return;
            }
          }
        }
      } catch {
        // Skip inaccessible or binary files
      }
    }
  }
}
