// ============================================================
// TurionZ — Logger (Bolla Network Structured Logging)
// Created by BollaNetwork
// ============================================================

import { Database } from './database';
import { SchemaManager } from './SchemaManager';
import { AgentType, ActivityLog } from '../types';

// Patterns to redact from logs
const REDACT_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/g,       // OpenRouter/OpenAI keys
  /ghp_[a-zA-Z0-9]{36}/g,       // GitHub tokens
  /bot[0-9]+:[a-zA-Z0-9_-]+/gi, // Telegram bot tokens
  /password['":\s]*[^\s,}'"]+/gi, // Passwords in various formats
];

export class Logger {
  private static instance: Logger;
  private db: Database;

  private tableReady: boolean = false;

  private constructor() {
    this.db = Database.getInstance();
  }

  private async ensureTable(): Promise<void> {
    if (this.tableReady) return;
    await SchemaManager.getInstance().ensureTable('activity_logs');
    this.tableReady = true;
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  async log(entry: ActivityLog): Promise<void> {
    // Console output (always)
    this.consoleLog(entry);

    // Database output (if connected)
    await this.dbLog(entry);
  }

  async info(agentName: string, action: string, details?: Record<string, unknown>): Promise<void> {
    await this.log({
      agentType: 'turionz',
      agentName,
      action,
      details: details || {},
    });
  }

  async agentLog(
    agentType: AgentType,
    agentName: string,
    action: string,
    details: Record<string, unknown> = {},
    durationMs?: number,
    tokensUsed?: number
  ): Promise<void> {
    await this.log({
      agentType,
      agentName,
      action,
      details,
      durationMs,
      tokensUsed,
    });
  }

  private consoleLog(entry: ActivityLog): void {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const agent = entry.agentType === 'turionz' ? 'Thor' : entry.agentName;
    const duration = entry.durationMs ? ` (${entry.durationMs}ms)` : '';
    const tokens = entry.tokensUsed ? ` [${entry.tokensUsed} tokens]` : '';

    const message = `[${timestamp}] [${agent}] ${entry.action}${duration}${tokens}`;
    console.log(this.redact(message));
  }

  private async dbLog(entry: ActivityLog): Promise<void> {
    if (!this.db.isConnected()) return;

    try {
      await this.ensureTable();
      const sanitizedDetails = this.redactObject(entry.details);

      await this.db.execute(
        `INSERT INTO activity_logs (agent_type, agent_name, action, details, duration_ms, tokens_used)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          entry.agentType,
          entry.agentName,
          entry.action,
          JSON.stringify(sanitizedDetails),
          entry.durationMs || null,
          entry.tokensUsed || null,
        ]
      );
    } catch {
      // Logging should never crash the application
    }
  }

  private redact(text: string): string {
    let result = text;
    for (const pattern of REDACT_PATTERNS) {
      result = result.replace(pattern, '[REDACTED]');
    }
    return result;
  }

  private redactObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = this.redact(value);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = this.redactObject(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}
