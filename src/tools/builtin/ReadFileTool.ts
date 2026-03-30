// ============================================================
// TurionZ — Read File Tool (Built-in)
// Created by BollaNetwork
// ============================================================

import * as fs from 'fs';
import { BaseTool } from '../BaseTool';
import { ToolResult } from '../../types';

export class ReadFileTool extends BaseTool {
  readonly name = 'read_file';
  readonly description =
    'Read the contents of a file. Supports optional line offset and limit for large files.';
  readonly parameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute or relative path to the file',
      },
      offset: {
        type: 'number',
        description: 'Line number to start reading from (1-based, default: 1)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of lines to read (default: all)',
      },
    },
    required: ['path'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = args.path as string;
    const offset = Math.max((args.offset as number) || 1, 1);
    const limit = (args.limit as number) || 0;

    if (!filePath || filePath.trim().length === 0) {
      return this.error('Path cannot be empty.');
    }

    if (!fs.existsSync(filePath)) {
      return this.error(`File not found: ${filePath}`);
    }

    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        return this.error(`Path is a directory, not a file: ${filePath}`);
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const allLines = content.split('\n');

      const startIdx = offset - 1;
      const endIdx = limit > 0 ? startIdx + limit : allLines.length;
      const lines = allLines.slice(startIdx, endIdx);

      const numbered = lines
        .map((line, i) => `${startIdx + i + 1}\t${line}`)
        .join('\n');

      const header = `File: ${filePath} (${allLines.length} lines total)`;
      return this.success(`${header}\n${numbered}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return this.error(`Failed to read file: ${errMsg}`);
    }
  }
}
