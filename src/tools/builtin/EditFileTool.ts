// ============================================================
// TurionZ — Edit File Tool (Built-in)
// Created by BollaNetwork
// ============================================================

import * as fs from 'fs';
import { BaseTool } from '../BaseTool';
import { ToolResult } from '../../types';

export class EditFileTool extends BaseTool {
  readonly name = 'edit_file';
  readonly description =
    'Edit a file by replacing an exact string match. The old_string must exist and be unique in the file.';
  readonly parameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to edit',
      },
      old_string: {
        type: 'string',
        description: 'The exact string to find and replace',
      },
      new_string: {
        type: 'string',
        description: 'The replacement string',
      },
    },
    required: ['path', 'old_string', 'new_string'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = args.path as string;
    const oldString = args.old_string as string;
    const newString = args.new_string as string;

    if (!filePath || filePath.trim().length === 0) {
      return this.error('Path cannot be empty.');
    }

    if (!oldString) {
      return this.error('old_string cannot be empty.');
    }

    if (!fs.existsSync(filePath)) {
      return this.error(`File not found: ${filePath}`);
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');

      // Check that old_string exists
      const firstIdx = content.indexOf(oldString);
      if (firstIdx === -1) {
        return this.error(
          `old_string not found in file. Make sure it matches exactly (including whitespace).`
        );
      }

      // Check uniqueness
      const secondIdx = content.indexOf(oldString, firstIdx + 1);
      if (secondIdx !== -1) {
        return this.error(
          `old_string appears multiple times in the file. Provide more surrounding context to make it unique.`
        );
      }

      // Perform replacement
      const newContent = content.replace(oldString, newString);
      fs.writeFileSync(filePath, newContent, 'utf-8');

      // Show context around the change
      const lines = newContent.split('\n');
      const changeLineIdx = newContent.substring(0, newContent.indexOf(newString)).split('\n').length - 1;
      const start = Math.max(0, changeLineIdx - 2);
      const end = Math.min(lines.length, changeLineIdx + newString.split('\n').length + 2);
      const context = lines
        .slice(start, end)
        .map((line, i) => `${start + i + 1}\t${line}`)
        .join('\n');

      return this.success(`File edited: ${filePath}\nContext:\n${context}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return this.error(`Failed to edit file: ${errMsg}`);
    }
  }
}
