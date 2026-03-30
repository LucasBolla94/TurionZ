// ============================================================
// TurionZ — Self Healer (Auto-Fix System)
// Created by BollaNetwork
//
// Detects and fixes common issues automatically on startup.
// Thor never depends on the user to fix infrastructure.
// ============================================================

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Database } from './database';

interface HealResult {
  issue: string;
  fixed: boolean;
  detail: string;
}

export class SelfHealer {
  private results: HealResult[] = [];
  private isLinux: boolean;

  constructor() {
    this.isLinux = process.platform === 'linux';
  }

  /**
   * Run all diagnostics and auto-fix what's possible.
   * Returns a report of what was found and fixed.
   */
  async healAll(): Promise<HealResult[]> {
    this.results = [];

    console.log('[SelfHealer] Running diagnostics...');

    // 1. Required directories
    this.healDirectories();

    // 2. Required files
    this.healPersonalityFiles();

    // 3. PostgreSQL connection
    await this.healDatabase();

    // 4. pgvector extension
    await this.healPgvector();

    // 5. Environment variables
    this.healEnvVars();

    // Report
    const fixed = this.results.filter(r => r.fixed).length;
    const failed = this.results.filter(r => !r.fixed).length;
    const issues = this.results.length;

    if (issues === 0) {
      console.log('[SelfHealer] All checks passed. System healthy.');
    } else {
      console.log(`[SelfHealer] Found ${issues} issue(s): ${fixed} auto-fixed, ${failed} need attention.`);
      for (const r of this.results) {
        const icon = r.fixed ? '✓' : '✗';
        console.log(`[SelfHealer]   ${icon} ${r.issue}: ${r.detail}`);
      }
    }

    return this.results;
  }

  // ─── 1. Directories ──────────────────────────────────────

  private healDirectories(): void {
    const required = [
      'tmp',
      '.agents',
      '.agents/skills',
      '.agents/skills/skill-creator',
      'data',
      'data/vault',
      'data/embeddings',
    ];

    for (const dir of required) {
      const fullPath = path.join(process.cwd(), dir);
      if (!fs.existsSync(fullPath)) {
        try {
          fs.mkdirSync(fullPath, { recursive: true });
          this.results.push({ issue: `Missing directory: ${dir}`, fixed: true, detail: 'Created' });
        } catch (e) {
          this.results.push({ issue: `Missing directory: ${dir}`, fixed: false, detail: `Cannot create: ${e}` });
        }
      }
    }
  }

  // ─── 2. Personality Files ────────────────────────────────

  private healPersonalityFiles(): void {
    const agentsDir = path.join(process.cwd(), '.agents');
    const files: Record<string, string> = {
      'SOUL.md': this.getDefaultSoul(),
      'IDENTITY.md': this.getDefaultIdentity(),
      'MEMORY.md': '# Thor Memory\n\nNo memories yet.\n',
    };

    for (const [filename, defaultContent] of Object.entries(files)) {
      const filePath = path.join(agentsDir, filename);
      if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
        try {
          fs.writeFileSync(filePath, defaultContent, 'utf-8');
          this.results.push({ issue: `Missing/empty: ${filename}`, fixed: true, detail: 'Created with defaults' });
        } catch (e) {
          this.results.push({ issue: `Missing/empty: ${filename}`, fixed: false, detail: `${e}` });
        }
      }
    }
  }

  // ─── 3. Database ─────────────────────────────────────────

  private async healDatabase(): Promise<void> {
    const db = Database.getInstance();

    if (db.isConnected()) return; // Already connected, nothing to heal

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl || dbUrl === 'postgresql://user:pass@localhost:5432/turionz') {
      this.results.push({
        issue: 'DATABASE_URL not configured',
        fixed: false,
        detail: 'Set DATABASE_URL in .env or run npm run setup',
      });
      return;
    }

    // Try to connect
    try {
      await db.connect();
      if (db.isConnected()) return;
    } catch {
      // Connection failed — try to fix
    }

    if (!this.isLinux) {
      this.results.push({ issue: 'Database connection failed', fixed: false, detail: 'Not Linux — cannot auto-fix' });
      return;
    }

    // Try to start PostgreSQL
    try {
      this.runSudo('systemctl start postgresql');
      // Wait a moment for PG to start
      await new Promise(r => setTimeout(r, 2000));

      // Retry connection
      await db.connect();
      if (db.isConnected()) {
        this.results.push({ issue: 'PostgreSQL was stopped', fixed: true, detail: 'Started PostgreSQL service' });
        return;
      }
    } catch {
      // Still failing
    }

    // Try to create database and user if they don't exist
    try {
      this.runSudo('-u postgres psql -c "CREATE USER turionz WITH PASSWORD \'turionz123\';" 2>/dev/null || true');
      this.runSudo('-u postgres psql -c "CREATE DATABASE turionz OWNER turionz;" 2>/dev/null || true');
      this.runSudo('-u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE turionz TO turionz;" 2>/dev/null || true');

      await db.connect();
      if (db.isConnected()) {
        this.results.push({ issue: 'Database/user missing', fixed: true, detail: 'Created turionz database and user' });
      } else {
        this.results.push({ issue: 'Database connection failed', fixed: false, detail: 'Could not connect after creating DB' });
      }
    } catch (e) {
      this.results.push({ issue: 'Database connection failed', fixed: false, detail: `${e}` });
    }
  }

  // ─── 4. pgvector ─────────────────────────────────────────

  private async healPgvector(): Promise<void> {
    const db = Database.getInstance();
    if (!db.isConnected()) return; // Can't check without DB

    // Check if vector extension exists
    try {
      await db.execute('SELECT 1 FROM pg_extension WHERE extname = \'vector\'');
      const result = await db.query<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') as exists"
      );

      if (result[0]?.exists) return; // pgvector already enabled
    } catch {
      // Extension check failed, try to fix
    }

    // Try to create extension
    try {
      await db.execute('CREATE EXTENSION IF NOT EXISTS vector');
      this.results.push({ issue: 'pgvector not enabled', fixed: true, detail: 'Enabled vector extension' });
      return;
    } catch {
      // Extension not installed at OS level
    }

    if (!this.isLinux) {
      this.results.push({ issue: 'pgvector not installed', fixed: false, detail: 'Not Linux — install manually' });
      return;
    }

    // Try to install pgvector package
    try {
      const pgVersion = this.getPostgresVersion();
      this.runSudo(`apt install -y postgresql-${pgVersion}-pgvector 2>/dev/null`);
      this.runSudo('systemctl restart postgresql');

      // Wait for restart
      await new Promise(r => setTimeout(r, 3000));

      // Reconnect and enable extension
      await db.disconnect();
      await db.connect();

      if (db.isConnected()) {
        await db.execute('CREATE EXTENSION IF NOT EXISTS vector');
        this.results.push({ issue: 'pgvector not installed', fixed: true, detail: `Installed postgresql-${pgVersion}-pgvector and enabled` });
      }
    } catch (e) {
      this.results.push({
        issue: 'pgvector not installed',
        fixed: false,
        detail: `Auto-install failed. Run: sudo apt install postgresql-16-pgvector`,
      });
    }
  }

  // ─── 5. Environment Variables ────────────────────────────

  private healEnvVars(): void {
    const critical: Record<string, string> = {
      'OPENROUTER_API_KEY': 'OpenRouter API key (for AI models)',
      'TELEGRAM_BOT_TOKEN': 'Telegram bot token (for messaging)',
      'DATABASE_URL': 'PostgreSQL connection string',
    };

    for (const [key, desc] of Object.entries(critical)) {
      const val = process.env[key];
      if (!val || val === '' || val.includes('...') || val === 'sk-or-...' || val === 'postgresql://user:pass@localhost:5432/turionz') {
        this.results.push({
          issue: `${key} not set`,
          fixed: false,
          detail: `${desc} — run npm run setup to configure`,
        });
      }
    }
  }

  // ─── Helpers ─────────────────────────────────────────────

  private runSudo(cmd: string): string {
    try {
      return execSync(`sudo ${cmd}`, { encoding: 'utf-8', stdio: 'pipe', timeout: 30000 }).trim();
    } catch {
      return '';
    }
  }

  private getPostgresVersion(): string {
    try {
      const version = execSync('pg_config --version 2>/dev/null', { encoding: 'utf-8' });
      return version.match(/\d+/)?.[0] || '16';
    } catch {
      return '16';
    }
  }

  private getDefaultSoul(): string {
    return `# Thor — Soul Configuration

## Core Personality
- Professional but friendly
- Dark/acid humor when appropriate
- Knows when to be serious vs casual
- Organized and grounded (pé no chão)
- Reports to Lucas (owner of Bolla Network) like a COO reports to CEO
- Explains things simply unless asked for details

## Communication Style
- Direct and concise
- Portuguese (PT-BR) as primary language
- Uses humor to lighten the mood
- Never acts without communicating first

## Identity
- Name: Thor (model name: TurionZ)
- Created by: Bolla Network
- Role: AI Personal Agent / Director of Operations
- Owner: Lucas (Bolla Network)
`;
  }

  private getDefaultIdentity(): string {
    return `# Thor — Identity

**Name:** Thor
**Model:** TurionZ
**Version:** 0.1.0
**Creator:** Bolla Network
**Owner:** Lucas
**Role:** AI Personal Agent

Thor is a professional, friendly AI assistant with a sharp sense of humor.
He operates as the Director of Operations for Lucas at Bolla Network.
`;
  }
}
