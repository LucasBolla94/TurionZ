// ============================================================
// TurionZ — Recovery Manager (Auto-start + Resume)
// Created by BollaNetwork
//
// Full recovery system: saves checkpoints to PostgreSQL,
// verifies integrity on startup, resumes interrupted work,
// detects repeated crashes and enters safe mode.
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { Database } from './database';
import { SchemaManager } from './SchemaManager';

const TMP_DIR = path.join(process.cwd(), 'tmp');
const AGENTS_DIR = path.join(process.cwd(), '.agents');
const CRASH_LOG_FILE = path.join(process.cwd(), 'data', 'crash_count.json');
const SAFE_MODE_THRESHOLD = 3;
const SAFE_MODE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export interface StartupReport {
  safeModeActive: boolean;
  crashCount: number;
  pendingAgents: { id: string; role: string; status: string }[];
  recoveredCheckpoints: string[];
  integrityIssues: string[];
  cleanedTempFiles: number;
  timestamp: Date;
}

export class RecoveryManager {
  private static instance: RecoveryManager;
  private db: Database;
  private safeMode: boolean = false;
  private lastReport: StartupReport | null = null;

  private constructor() {
    this.db = Database.getInstance();
  }

  static getInstance(): RecoveryManager {
    if (!RecoveryManager.instance) {
      RecoveryManager.instance = new RecoveryManager();
    }
    return RecoveryManager.instance;
  }

  isSafeMode(): boolean {
    return this.safeMode;
  }

  // --- Full startup sequence (spec-compliant boot) ---

  async runStartupSequence(): Promise<StartupReport> {
    console.log('[Recovery] Running startup sequence...');

    const report: StartupReport = {
      safeModeActive: false,
      crashCount: 0,
      pendingAgents: [],
      recoveredCheckpoints: [],
      integrityIssues: [],
      cleanedTempFiles: 0,
      timestamp: new Date(),
    };

    // 1. Check for repeated crashes -> safe mode
    report.crashCount = this.checkSafeMode();
    report.safeModeActive = this.safeMode;

    // 2. Record this startup
    this.recordStartup();

    // 3. Verify file integrity (SOUL.md, IDENTITY.md, MEMORY.md)
    report.integrityIssues = this.verifyCriticalFiles();

    // 4. Clean orphaned temp files
    report.cleanedTempFiles = this.cleanTmp();

    // 5. Check recovery_state table for interrupted work
    if (this.db.isConnected()) {
      report.recoveredCheckpoints = await this.checkRecoveryState();
    }

    // 6. Check agents table: any with status 'running' or 'waiting'?
    if (this.db.isConnected()) {
      report.pendingAgents = await this.recoverInterruptedAgents();
    }

    if (this.safeMode) {
      console.warn('[Recovery] SAFE MODE ACTIVE -- Sub-agents and self-improvement disabled.');
    }

    this.lastReport = report;
    console.log('[Recovery] Startup sequence complete.');
    return report;
  }

  // Backward compatibility alias
  async runBootSequence(): Promise<void> {
    await this.runStartupSequence();
  }

  // --- Checkpoint CRUD ---

  async saveCheckpoint(component: string, state: Record<string, unknown>, iteration?: number): Promise<void> {
    if (!this.db.isConnected()) return;

    try {
      await SchemaManager.getInstance().ensureTable('recovery_state');
      await this.db.execute(
        `INSERT INTO recovery_state (component, state, iteration)
         VALUES ($1, $2, $3)
         ON CONFLICT (component) DO UPDATE
         SET state = $2, iteration = $3, updated_at = NOW()`,
        [component, JSON.stringify(state), iteration || null]
      );
    } catch {
      // Non-fatal — checkpoint saving should never crash the app
    }
  }

  async getCheckpoint(component: string): Promise<{ state: Record<string, unknown>; iteration: number | null } | null> {
    if (!this.db.isConnected()) return null;

    try {
      await SchemaManager.getInstance().ensureTable('recovery_state');
      const row = await this.db.queryOne<{ state: Record<string, unknown>; iteration: number | null }>(
        'SELECT state, iteration FROM recovery_state WHERE component = $1',
        [component]
      );
      return row;
    } catch {
      return null;
    }
  }

  // Backward compatibility alias
  async loadCheckpoint(component: string): Promise<{ state: Record<string, unknown>; iteration: number | null } | null> {
    return this.getCheckpoint(component);
  }

  async clearCheckpoint(component: string): Promise<void> {
    if (!this.db.isConnected()) return;

    try {
      await SchemaManager.getInstance().ensureTable('recovery_state');
      await this.db.execute(
        'DELETE FROM recovery_state WHERE component = $1',
        [component]
      );
    } catch {
      // Non-fatal
    }
  }

  // --- Critical file verification ---

  verifyCriticalFiles(): string[] {
    const issues: string[] = [];
    const criticalFiles = [
      { path: path.join(AGENTS_DIR, 'SOUL.md'), name: 'SOUL.md' },
      { path: path.join(AGENTS_DIR, 'IDENTITY.md'), name: 'IDENTITY.md' },
      { path: path.join(AGENTS_DIR, 'MEMORY.md'), name: 'MEMORY.md' },
    ];

    for (const file of criticalFiles) {
      if (!fs.existsSync(file.path)) {
        const msg = `Critical file missing: ${file.name}`;
        console.warn(`[Recovery] ${msg}`);
        issues.push(msg);
      } else {
        const stat = fs.statSync(file.path);
        if (stat.size === 0) {
          const msg = `Critical file empty (corrupted?): ${file.name}`;
          console.warn(`[Recovery] ${msg}`);
          issues.push(msg);
        }
      }
    }

    if (issues.length === 0) {
      console.log('[Recovery] All critical files verified OK.');
    }

    return issues;
  }

  // --- Agent recovery ---

  async recoverInterruptedAgents(): Promise<{ id: string; role: string; status: string }[]> {
    if (!this.db.isConnected()) return [];

    try {
      // Check agents table exists first
      await SchemaManager.getInstance().ensureTable('agents');

      const pending = await this.db.query<{ id: string; role: string; status: string }>(
        `SELECT id, role, status FROM agents WHERE status IN ('running', 'waiting')`
      );

      if (pending.length === 0) return [];

      console.log(`[Recovery] Found ${pending.length} interrupted agent(s) from previous session.`);

      if (this.safeMode) {
        // In safe mode: mark all interrupted agents as failed (don't resume)
        console.log('[Recovery] Safe mode: marking interrupted agents as failed.');
        await this.db.execute(
          `UPDATE agents SET status = 'failed', completed_at = NOW()
           WHERE status IN ('running', 'waiting')`
        );
      } else {
        // Normal mode: reset running agents to 'created' so they can be re-run
        await this.db.execute(
          `UPDATE agents SET status = 'created' WHERE status = 'running'`
        );
        console.log('[Recovery] Reset interrupted agents to "created" for re-execution.');
      }

      return pending;
    } catch {
      return [];
    }
  }

  // --- Startup report for user notification ---

  getStartupReport(): string | null {
    if (!this.lastReport) return null;
    return this.formatStartupReport(this.lastReport);
  }

  async getRecoveryNotification(): Promise<string | null> {
    if (!this.lastReport && this.db.isConnected()) {
      // Fallback: build notification from current DB state
      try {
        await SchemaManager.getInstance().ensureTable('agents');
        const pendingAgents = await this.db.query<{ id: string; role: string; status: string }>(
          `SELECT id, role, status FROM agents WHERE status IN ('running', 'waiting')`
        );

        if (pendingAgents.length === 0 && !this.safeMode) {
          return null;
        }

        return this.formatStartupReport({
          safeModeActive: this.safeMode,
          crashCount: 0,
          pendingAgents,
          recoveredCheckpoints: [],
          integrityIssues: [],
          cleanedTempFiles: 0,
          timestamp: new Date(),
        });
      } catch {
        return null;
      }
    }

    if (!this.lastReport) return null;

    const report = this.lastReport;
    if (report.pendingAgents.length === 0 && !report.safeModeActive && report.integrityIssues.length === 0) {
      return null; // Clean startup, nothing to report
    }

    return this.formatStartupReport(report);
  }

  // --- Graceful shutdown support ---

  async saveShutdownState(): Promise<void> {
    await this.saveCheckpoint('system_shutdown', {
      graceful: true,
      timestamp: new Date().toISOString(),
    });
  }

  // --- Internal ---

  private formatStartupReport(report: StartupReport): string {
    const parts: string[] = ['TurionZ online!'];

    if (report.pendingAgents.length > 0) {
      parts.push(`Encontrei ${report.pendingAgents.length} tarefa(s) pendente(s) da sessao anterior.`);
      for (const agent of report.pendingAgents) {
        parts.push(`  - ${agent.role} (${agent.status}): ${report.safeModeActive ? 'marcado como falha (safe mode)' : 'sera retomado'}`);
      }
    }

    if (report.integrityIssues.length > 0) {
      parts.push(`Problemas de integridade: ${report.integrityIssues.join('; ')}`);
    }

    if (report.recoveredCheckpoints.length > 0) {
      parts.push(`Checkpoints recuperados: ${report.recoveredCheckpoints.join(', ')}`);
    }

    if (report.cleanedTempFiles > 0) {
      parts.push(`Limpei ${report.cleanedTempFiles} arquivo(s) temporario(s) orfao(s).`);
    }

    if (report.safeModeActive) {
      parts.push('AVISO: Modo seguro ativo -- detectei crashes recentes. Sub-agents desativados temporariamente.');
    }

    return parts.join('\n');
  }

  private checkSafeMode(): number {
    try {
      if (!fs.existsSync(CRASH_LOG_FILE)) {
        this.safeMode = false;
        return 0;
      }

      const data = JSON.parse(fs.readFileSync(CRASH_LOG_FILE, 'utf8'));
      const recentCrashes = (data.timestamps as number[]).filter(
        (t: number) => Date.now() - t < SAFE_MODE_WINDOW_MS
      );

      if (recentCrashes.length >= SAFE_MODE_THRESHOLD) {
        this.safeMode = true;
      }

      return recentCrashes.length;
    } catch {
      this.safeMode = false;
      return 0;
    }
  }

  private recordStartup(): void {
    try {
      const dir = path.dirname(CRASH_LOG_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let data: { timestamps: number[] } = { timestamps: [] };

      if (fs.existsSync(CRASH_LOG_FILE)) {
        data = JSON.parse(fs.readFileSync(CRASH_LOG_FILE, 'utf8'));
      }

      data.timestamps.push(Date.now());

      // Keep only last 10 entries
      data.timestamps = data.timestamps.slice(-10);

      fs.writeFileSync(CRASH_LOG_FILE, JSON.stringify(data, null, 2));
    } catch {
      // Non-fatal
    }
  }

  private cleanTmp(): number {
    try {
      if (!fs.existsSync(TMP_DIR)) {
        fs.mkdirSync(TMP_DIR, { recursive: true });
        return 0;
      }

      const files = fs.readdirSync(TMP_DIR);
      let cleaned = 0;

      for (const file of files) {
        const filePath = path.join(TMP_DIR, file);
        try {
          fs.unlinkSync(filePath);
          cleaned++;
        } catch {
          // File might be in use
        }
      }

      if (cleaned > 0) {
        console.log(`[Recovery] Cleaned ${cleaned} orphaned temp files.`);
      }

      return cleaned;
    } catch {
      return 0;
    }
  }

  private async checkRecoveryState(): Promise<string[]> {
    const recovered: string[] = [];

    try {
      await SchemaManager.getInstance().ensureTable('recovery_state');
      const rows = await this.db.query<{ component: string; state: Record<string, unknown>; iteration: number | null }>(
        'SELECT component, state, iteration FROM recovery_state'
      );

      for (const row of rows) {
        console.log(`[Recovery] Found checkpoint: ${row.component} (iteration: ${row.iteration || 'N/A'})`);
        recovered.push(row.component);
      }
    } catch {
      // Non-fatal
    }

    return recovered;
  }
}
