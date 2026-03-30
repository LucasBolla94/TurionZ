// ============================================================
// TurionZ — Git Tool (Built-in)
// Created by BollaNetwork
// ============================================================

import { execSync } from 'child_process';
import { BaseTool } from '../BaseTool';
import { ToolResult } from '../../types';

const ALLOWED_ACTIONS = [
  'status',
  'log',
  'diff',
  'add',
  'commit',
  'push',
  'pull',
  'branch',
  'checkout',
];

export class GitTool extends BaseTool {
  readonly name = 'git';
  readonly description =
    'Run git commands. Supported actions: status, log, diff, add, commit, push, pull, branch, checkout.';
  readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: `Git action to run: ${ALLOWED_ACTIONS.join(', ')}`,
      },
      args: {
        type: 'string',
        description: 'Additional arguments for the git command',
      },
    },
    required: ['action'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const action = args.action as string;
    const gitArgs = (args.args as string) || '';

    if (!action || action.trim().length === 0) {
      return this.error('Action cannot be empty.');
    }

    if (!ALLOWED_ACTIONS.includes(action)) {
      return this.error(
        `Unknown action: ${action}. Allowed: ${ALLOWED_ACTIONS.join(', ')}`
      );
    }

    // Security: block dangerous patterns in args
    if (/--force|--hard|-D\s|--delete/.test(gitArgs)) {
      return this.error('Destructive git flags are blocked for safety.');
    }

    const command = gitArgs ? `git ${action} ${gitArgs}` : `git ${action}`;

    try {
      const output = execSync(command, {
        cwd: process.cwd(),
        timeout: 30000,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      return this.success(output || `(git ${action}: no output)`);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'stdout' in error) {
        const execError = error as { stdout?: string; stderr?: string; status?: number };
        const stdout = execError.stdout || '';
        const stderr = execError.stderr || '';
        return this.error(
          `git ${action} failed\n` +
            (stdout ? `STDOUT:\n${stdout}\n` : '') +
            (stderr ? `STDERR:\n${stderr}` : '')
        );
      }
      const errMsg = error instanceof Error ? error.message : String(error);
      return this.error(`git ${action} failed: ${errMsg}`);
    }
  }
}
