// ============================================================
// TurionZ — ActivityLogger (Structured Logging Service)
// Created by BollaNetwork
//
// Centralized logging for all components. Every tool call, LLM
// request, sub-agent operation, and system event is captured
// with structured data and persisted to PostgreSQL.
//
// Features:
// - Batch inserts (buffer up to 10 entries, flush every 2s)
// - Convenience methods for tool calls, LLM calls, lifecycle, system events
// - Query support with filters (time range, component, agent)
// - Graceful flush on shutdown
// - Credential redaction
// ============================================================

import { Database } from './database';
import { SchemaManager } from './SchemaManager';
import { ActivityLogEntry, LogQueryFilters } from '../types';

const BATCH_SIZE = 10;
const FLUSH_INTERVAL_MS = 2000;

// Patterns to redact from log details
const REDACT_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/g,
  /ghp_[a-zA-Z0-9]{36}/g,
  /bot[0-9]+:[a-zA-Z0-9_-]+/gi,
  /password['":\s]*[^\s,}'"]+/gi,
];

export class ActivityLogger {
  private static instance: ActivityLogger;
  private db: Database;
  private buffer: ActivityLogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private tableReady: boolean = false;

  private constructor() {
    this.db = Database.getInstance();
    this.startFlushTimer();
  }

  static getInstance(): ActivityLogger {
    if (!ActivityLogger.instance) {
      ActivityLogger.instance = new ActivityLogger();
    }
    return ActivityLogger.instance;
  }

  // --- Core log method ---

  async log(entry: ActivityLogEntry): Promise<void> {
    // Console output (always)
    this.consoleLog(entry);

    // Buffer for batch DB insert
    this.buffer.push({
      ...entry,
      createdAt: entry.createdAt || new Date(),
    });

    if (this.buffer.length >= BATCH_SIZE) {
      await this.flush();
    }
  }

  // --- Convenience methods ---

  async logToolCall(
    agentId: string | undefined,
    toolName: string,
    args: Record<string, unknown>,
    result: string,
    durationMs: number
  ): Promise<void> {
    await this.log({
      agentId,
      component: 'agent_loop',
      action: 'tool_call',
      details: {
        tool: toolName,
        args: this.summarize(args),
        result: this.truncate(result, 500),
      },
      durationMs,
    });
  }

  async logLlmCall(
    agentId: string | undefined,
    model: string,
    tokensIn: number,
    tokensOut: number,
    durationMs: number
  ): Promise<void> {
    await this.log({
      agentId,
      component: 'agent_loop',
      action: 'llm_call',
      details: {},
      model,
      tokensIn,
      tokensOut,
      durationMs,
    });
  }

  async logAgentLifecycle(
    agentId: string | undefined,
    event: 'create' | 'run' | 'complete' | 'fail' | 'cancel',
    details: Record<string, unknown> = {}
  ): Promise<void> {
    await this.log({
      agentId,
      component: 'sub_agent_manager',
      action: `agent_${event}`,
      details,
    });
  }

  async logSystemEvent(
    component: string,
    event: string,
    details: Record<string, unknown> = {}
  ): Promise<void> {
    await this.log({
      component,
      action: event,
      details,
    });
  }

  // --- Query ---

  async query(filters: LogQueryFilters): Promise<ActivityLogEntry[]> {
    if (!this.db.isConnected()) return [];

    await this.ensureTable();

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters.component) {
      conditions.push(`component = $${paramIdx++}`);
      params.push(filters.component);
    }
    if (filters.agentId) {
      conditions.push(`agent_id = $${paramIdx++}`);
      params.push(filters.agentId);
    }
    if (filters.action) {
      conditions.push(`action = $${paramIdx++}`);
      params.push(filters.action);
    }
    if (filters.fromDate) {
      conditions.push(`created_at >= $${paramIdx++}`);
      params.push(filters.fromDate);
    }
    if (filters.toDate) {
      conditions.push(`created_at <= $${paramIdx++}`);
      params.push(filters.toDate);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    const sql = `SELECT agent_id as "agentId", component, action, details, model,
                        tokens_in as "tokensIn", tokens_out as "tokensOut",
                        duration_ms as "durationMs", created_at as "createdAt"
                 FROM activity_logs ${where}
                 ORDER BY created_at DESC
                 LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limit, offset);

    return this.db.query<ActivityLogEntry>(sql, params);
  }

  // --- Flush & Shutdown ---

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    if (!this.db.isConnected()) {
      this.buffer = [];
      return;
    }

    try {
      await this.ensureTable();

      const entries = [...this.buffer];
      this.buffer = [];

      // Batch insert using a single query with multiple value rows
      const valueParts: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      for (const entry of entries) {
        const sanitizedDetails = this.redactObject(entry.details);
        valueParts.push(
          `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`
        );
        params.push(
          entry.agentId || null,
          entry.component,
          entry.action,
          JSON.stringify(sanitizedDetails),
          entry.model || null,
          entry.tokensIn || null,
          entry.tokensOut || null,
          entry.durationMs || null
        );
      }

      const sql = `INSERT INTO activity_logs (agent_id, component, action, details, model, tokens_in, tokens_out, duration_ms)
                   VALUES ${valueParts.join(', ')}`;

      await this.db.execute(sql, params);
    } catch {
      // Logging should never crash the application
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  // --- Internal ---

  private async ensureTable(): Promise<void> {
    if (this.tableReady) return;
    await SchemaManager.getInstance().ensureTable('activity_logs');
    this.tableReady = true;
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(async () => {
      if (this.buffer.length > 0) {
        await this.flush();
      }
    }, FLUSH_INTERVAL_MS);

    // Ensure the timer doesn't prevent process exit
    if (this.flushTimer && typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
      (this.flushTimer as NodeJS.Timeout).unref();
    }
  }

  private consoleLog(entry: ActivityLogEntry): void {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const component = entry.component;
    const duration = entry.durationMs ? ` (${entry.durationMs}ms)` : '';
    const tokens = entry.tokensIn || entry.tokensOut
      ? ` [${entry.tokensIn || 0}in/${entry.tokensOut || 0}out]`
      : '';

    const message = `[${timestamp}] [${component}] ${entry.action}${duration}${tokens}`;
    console.log(this.redact(message));
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

  private summarize(args: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      if (typeof value === 'string' && value.length > 200) {
        result[key] = value.substring(0, 200) + '...';
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  private truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen) + '...';
  }
}
