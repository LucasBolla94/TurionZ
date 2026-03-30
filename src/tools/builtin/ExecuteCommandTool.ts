// ============================================================
// TurionZ — Execute Command Tool (Built-in)
// Created by BollaNetwork
// ============================================================

import { execSync } from 'child_process';
import { BaseTool } from '../BaseTool';
import { ToolResult } from '../../types';

const DANGEROUS_PATTERNS = [
  /rm\s+(-rf?|--recursive)\s+\//,
  /mkfs\./,
  /format\s+[a-zA-Z]:/,
  /dd\s+if=.*of=\/dev/,
  />\s*\/dev\/sd/,
  /chmod\s+-R\s+777\s+\//,
  /:(){ :\|:& };:/,
  /shutdown/,
  /reboot/,
  /init\s+[06]/,
];

export class ExecuteCommandTool extends BaseTool {
  readonly name = 'execute_command';
  readonly description =
    'Execute a shell command and return its output. Use for running scripts, installing packages, or any CLI operation.';
  readonly parameters = {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute',
      },
      workingDir: {
        type: 'string',
        description: 'Working directory for the command (default: project root)',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in seconds (default: 30, max: 120)',
      },
    },
    required: ['command'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const command = args.command as string;
    const workingDir = (args.workingDir as string) || process.cwd();
    const timeout = Math.min((args.timeout as number) || 30, 120);

    if (!command || command.trim().length === 0) {
      return this.error('Command cannot be empty.');
    }

    // Security: block dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        return this.error(`Command blocked for safety: matches dangerous pattern.`);
      }
    }

    try {
      const output = execSync(command, {
        cwd: workingDir,
        timeout: timeout * 1000,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024, // 1MB
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      return this.success(output || '(no output)');
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'stdout' in error) {
        const execError = error as { stdout?: string; stderr?: string; status?: number };
        const stdout = execError.stdout || '';
        const stderr = execError.stderr || '';
        const code = execError.status ?? 1;
        return this.error(
          `Command exited with code ${code}\n` +
            (stdout ? `STDOUT:\n${stdout}\n` : '') +
            (stderr ? `STDERR:\n${stderr}` : '')
        );
      }
      const errMsg = error instanceof Error ? error.message : String(error);
      return this.error(`Command failed: ${errMsg}`);
    }
  }
}
