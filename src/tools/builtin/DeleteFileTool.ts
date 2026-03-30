// ============================================================
// TurionZ — Delete File Tool (Built-in)
// Created by BollaNetwork
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { BaseTool } from '../BaseTool';
import { ToolResult } from '../../types';

const PROTECTED_FILES = [
  'package.json',
  'tsconfig.json',
  '.env',
  '.gitignore',
  'src/index.ts',
];

export class DeleteFileTool extends BaseTool {
  readonly name = 'delete_file';
  readonly description =
    'Delete a file or empty directory. Blocks deletion of critical project files and paths outside the project.';
  readonly parameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file or empty directory to delete',
      },
    },
    required: ['path'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = args.path as string;

    if (!filePath || filePath.trim().length === 0) {
      return this.error('Path cannot be empty.');
    }

    // Security: block paths outside project directory
    const resolved = path.resolve(filePath);
    const projectRoot = process.cwd();
    if (!resolved.startsWith(projectRoot)) {
      return this.error('Cannot delete files outside the project directory.');
    }

    // Security: block critical files
    const relative = path.relative(projectRoot, resolved).replace(/\\/g, '/');
    if (PROTECTED_FILES.includes(relative)) {
      return this.error(`Cannot delete protected file: ${relative}`);
    }

    if (!fs.existsSync(resolved)) {
      return this.error(`Path not found: ${filePath}`);
    }

    try {
      const stat = fs.statSync(resolved);

      if (stat.isDirectory()) {
        const entries = fs.readdirSync(resolved);
        if (entries.length > 0) {
          return this.error('Directory is not empty. Remove contents first.');
        }
        fs.rmdirSync(resolved);
        return this.success(`Directory deleted: ${filePath}`);
      }

      fs.unlinkSync(resolved);
      return this.success(`File deleted: ${filePath}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return this.error(`Failed to delete: ${errMsg}`);
    }
  }
}
