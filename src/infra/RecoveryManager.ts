// ============================================================
// TurionZ — Recovery Manager (Auto-start + Resume)
// Created by BollaNetwork
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

export class RecoveryManager {
  private static instance: RecoveryManager;
  private db: Database;
  private safeMode: boolean = false;

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

  async runBootSequence(): Promise<void> {
    console.log('[Recovery] Running boot sequence...');

    // 1. Check for repeated crashes → safe mode
    this.checkSafeMode();

    // 2. Record this startup
    this.recordStartup();

    // 3. Clean orphaned temp files
    this.cleanTmp();

    // 4. Verify integrity of critical files
    this.verifyIntegrity();

    // 5. Check for pending agents in database
    if (this.db.isConnected()) {
      await this.checkPendingAgents();
    }

    if (this.safeMode) {
      console.warn('[Recovery] SAFE MODE ACTIVE — Sub-agents and self-improvement disabled.');
    }

    console.log('[Recovery] Boot sequence complete.');
  }

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
      // Non-fatal
    }
  }

  async loadCheckpoint(component: string): Promise<{ state: Record<string, unknown>; iteration: number | null } | null> {
    if (!this.db.isConnected()) return null;

    try {
      const row = await this.db.queryOne<{ state: Record<string, unknown>; iteration: number | null }>(
        'SELECT state, iteration FROM recovery_state WHERE component = $1',
        [component]
      );
      return row;
    } catch {
      return null;
    }
  }

  // --- Recovery notification message ---

  async getRecoveryNotification(): Promise<string | null> {
    if (!this.db.isConnected()) return null;

    const pendingAgents = await this.db.query<{ id: string; role: string; status: string }>(
      `SELECT id, role, status FROM agents WHERE status IN ('running', 'waiting')`
    );

    if (pendingAgents.length === 0 && !this.safeMode) {
      return null; // Nothing to report
    }

    const parts: string[] = ['TurionZ online!'];

    if (pendingAgents.length > 0) {
      parts.push(`Encontrei ${pendingAgents.length} tarefa(s) pendente(s) da sessão anterior.`);
      for (const agent of pendingAgents) {
        parts.push(`  - ${agent.role} (${agent.status}): será retomado`);
      }
    }

    if (this.safeMode) {
      parts.push('⚠️ Modo seguro ativo — detectei crashes recentes. Sub-agents desativados temporariamente.');
    }

    return parts.join('\n');
  }

  // --- Internal ---

  private checkSafeMode(): void {
    try {
      if (!fs.existsSync(CRASH_LOG_FILE)) {
        this.safeMode = false;
        return;
      }

      const data = JSON.parse(fs.readFileSync(CRASH_LOG_FILE, 'utf8'));
      const recentCrashes = (data.timestamps as number[]).filter(
        (t: number) => Date.now() - t < SAFE_MODE_WINDOW_MS
      );

      if (recentCrashes.length >= SAFE_MODE_THRESHOLD) {
        this.safeMode = true;
      }
    } catch {
      this.safeMode = false;
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

  private cleanTmp(): void {
    try {
      if (!fs.existsSync(TMP_DIR)) {
        fs.mkdirSync(TMP_DIR, { recursive: true });
        return;
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
    } catch {
      // Non-fatal
    }
  }

  private verifyIntegrity(): void {
    const criticalFiles = [
      { path: path.join(AGENTS_DIR, 'SOUL.md'), name: 'SOUL.md' },
      { path: path.join(AGENTS_DIR, 'IDENTITY.md'), name: 'IDENTITY.md' },
    ];

    for (const file of criticalFiles) {
      if (!fs.existsSync(file.path)) {
        console.warn(`[Recovery] Critical file missing: ${file.name}`);
      } else {
        const stat = fs.statSync(file.path);
        if (stat.size === 0) {
          console.warn(`[Recovery] Critical file empty (corrupted?): ${file.name}`);
        }
      }
    }
  }

  private async checkPendingAgents(): Promise<void> {
    try {
      const pending = await this.db.query<{ id: string; status: string }>(
        `SELECT id, status FROM agents WHERE status IN ('running', 'waiting')`
      );

      if (pending.length > 0) {
        console.log(`[Recovery] Found ${pending.length} pending agents from previous session.`);
        // Mark running agents as needing recovery
        await this.db.execute(
          `UPDATE agents SET status = 'created' WHERE status = 'running'`
        );
      }
    } catch {
      // Non-fatal
    }
  }
}
