// ============================================================
// TurionZ — External Tool (Cross-Language Script Execution)
// Created by BollaNetwork
// ============================================================

import { spawn } from 'child_process';
import { BaseTool } from '../tools/BaseTool';
import { ToolResult } from '../types';

export class ExternalTool extends BaseTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  private command: string;
  private scriptPath: string;
  private timeoutMs: number;

  constructor(
    name: string,
    description: string,
    parameters: Record<string, unknown>,
    command: string,
    scriptPath: string,
    timeoutMs: number = 30000
  ) {
    super();
    this.name = name;
    this.description = description;
    this.parameters = parameters;
    this.command = command;
    this.scriptPath = scriptPath;
    this.timeoutMs = timeoutMs;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    return new Promise<ToolResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // Resolve command — handle tsx/ts-node/npx not in PATH for background processes
      let cmd = this.command;
      let cmdArgs = [this.scriptPath];

      if (cmd === 'tsx' || cmd === 'ts-node') {
        // Use npx as wrapper to find tsx/ts-node
        cmd = 'npx';
        cmdArgs = [this.command, this.scriptPath];
      }

      const child = spawn(cmd, cmdArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.timeoutMs,
        env: { ...process.env, PATH: `${process.env.PATH}:/usr/local/bin:/usr/bin` },
        shell: true,
      });

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('error', (err: Error) => {
        if (err.message.includes('ETIMEDOUT') || err.message.includes('killed')) {
          timedOut = true;
          resolve(this.error(`Tool execution timed out after ${this.timeoutMs}ms`));
        } else {
          resolve(this.error(err.message));
        }
      });

      child.on('close', (code: number | null) => {
        if (timedOut) return;

        if (code === 0) {
          try {
            const parsed = JSON.parse(stdout);
            if (
              typeof parsed === 'object' &&
              parsed !== null &&
              'success' in parsed &&
              'output' in parsed
            ) {
              resolve({
                success: Boolean(parsed.success),
                output: String(parsed.output),
              });
              return;
            }
          } catch {
            // Not JSON — use raw stdout
          }
          resolve(this.success(stdout.trim()));
        } else {
          resolve(
            this.error(stderr || stdout || `Process exited with code ${code}`)
          );
        }
      });

      // Write input to stdin and close
      try {
        child.stdin.write(JSON.stringify(args));
        child.stdin.end();
      } catch {
        // stdin may already be closed
      }
    });
  }
}
