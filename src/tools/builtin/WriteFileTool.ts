// ============================================================
// TurionZ — Write File Tool (Built-in)
// Created by BollaNetwork
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { BaseTool } from '../BaseTool';
import { ToolResult } from '../../types';

export class WriteFileTool extends BaseTool {
  readonly name = 'write_file';
  readonly description =
    'Write content to a file. Creates directories recursively if they do not exist. Overwrites existing files.';
  readonly parameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute or relative path to the file',
      },
      content: {
        type: 'string',
        description: 'Content to write to the file',
      },
    },
    required: ['path', 'content'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = args.path as string;
    const content = args.content as string;

    if (!filePath || filePath.trim().length === 0) {
      return this.error('Path cannot be empty.');
    }

    if (content === undefined || content === null) {
      return this.error('Content cannot be null or undefined.');
    }

    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, content, 'utf-8');

      const lines = content.split('\n').length;
      const bytes = Buffer.byteLength(content, 'utf-8');
      return this.success(
        `File written: ${filePath} (${lines} lines, ${bytes} bytes)`
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return this.error(`Failed to write file: ${errMsg}`);
    }
  }
}
