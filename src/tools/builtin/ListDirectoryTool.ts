// ============================================================
// TurionZ — List Directory Tool (Built-in)
// Created by BollaNetwork
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { BaseTool } from '../BaseTool';
import { ToolResult } from '../../types';

export class ListDirectoryTool extends BaseTool {
  readonly name = 'list_directory';
  readonly description =
    'List files and directories at a given path. Shows type indicators (dir/, file). Supports recursive listing.';
  readonly parameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path to list (default: current working directory)',
      },
      recursive: {
        type: 'boolean',
        description: 'List recursively with tree structure (default: false)',
      },
    },
    required: [],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const dirPath = (args.path as string) || process.cwd();
    const recursive = (args.recursive as boolean) || false;

    if (!fs.existsSync(dirPath)) {
      return this.error(`Directory not found: ${dirPath}`);
    }

    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      return this.error(`Path is not a directory: ${dirPath}`);
    }

    try {
      const lines: string[] = [];
      this.listDir(dirPath, '', recursive, lines, 0);

      if (lines.length === 0) {
        return this.success(`(empty directory: ${dirPath})`);
      }

      return this.success(`Directory: ${dirPath}\n${lines.join('\n')}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return this.error(`Failed to list directory: ${errMsg}`);
    }
  }

  private listDir(
    dirPath: string,
    prefix: string,
    recursive: boolean,
    lines: string[],
    depth: number
  ): void {
    if (depth > 10) return; // Safety limit

    const entries = fs.readdirSync(dirPath).sort();
    const SKIP = ['node_modules', '.git', 'dist', '.turionz_vault'];

    for (const entry of entries) {
      if (SKIP.includes(entry)) continue;

      const fullPath = path.join(dirPath, entry);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          lines.push(`${prefix}${entry}/`);
          if (recursive) {
            this.listDir(fullPath, prefix + '  ', recursive, lines, depth + 1);
          }
        } else {
          lines.push(`${prefix}${entry}`);
        }
      } catch {
        // Skip inaccessible entries
      }
    }
  }
}
