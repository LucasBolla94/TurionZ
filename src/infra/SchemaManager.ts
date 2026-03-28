// ============================================================
// TurionZ — Schema Manager (On-Demand Table Creation)
// Created by BollaNetwork
//
// Each module calls ensureTable() when it first needs a table.
// Tables are created lazily — only when actually used.
// A registry tracks which tables already exist to avoid repeated checks.
// ============================================================

import { Database } from './database';

// All table schemas organized by module
const TABLE_SCHEMAS: Record<string, string[]> = {

  // --- Sub-Agents Module ---
  agents: [
    `CREATE TABLE IF NOT EXISTS agents (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      parent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
      level INTEGER NOT NULL,
      role VARCHAR NOT NULL,
      model VARCHAR NOT NULL,
      briefing TEXT,
      skills JSONB,
      criteria TEXT,
      config JSONB,
      status VARCHAR DEFAULT 'created',
      result TEXT,
      metrics JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      completed_at TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_agents_parent ON agents(parent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)`,
  ],

  agent_communications: [
    `CREATE TABLE IF NOT EXISTS agent_communications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      from_agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
      to_agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
      data JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
  ],

  agent_dependencies: [
    `CREATE TABLE IF NOT EXISTS agent_dependencies (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
      depends_on_agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
      resolved BOOLEAN DEFAULT FALSE,
      resolved_at TIMESTAMP
    )`,
  ],

  // --- Permissions Module ---
  permissions: [
    `CREATE TABLE IF NOT EXISTS permissions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      action VARCHAR NOT NULL UNIQUE,
      category VARCHAR NOT NULL,
      is_wildcard BOOLEAN DEFAULT FALSE,
      granted BOOLEAN NOT NULL,
      granted_by VARCHAR,
      granted_at TIMESTAMP DEFAULT NOW(),
      revoked_at TIMESTAMP
    )`,
  ],

  // --- Logging Module ---
  activity_logs: [
    `CREATE TABLE IF NOT EXISTS activity_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      agent_id UUID,
      agent_type VARCHAR NOT NULL DEFAULT 'turionz',
      agent_name VARCHAR NOT NULL DEFAULT 'system',
      component VARCHAR NOT NULL,
      action VARCHAR NOT NULL,
      details JSONB NOT NULL DEFAULT '{}',
      model VARCHAR,
      tokens_in INTEGER,
      tokens_out INTEGER,
      duration_ms INTEGER,
      tokens_used INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_activity_logs_agent ON activity_logs(agent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_activity_logs_component ON activity_logs(component)`,
    `CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at)`,
  ],

  // --- Self-Improvement Module ---
  lessons_learned: [
    `CREATE TABLE IF NOT EXISTS lessons_learned (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      category VARCHAR NOT NULL,
      lesson TEXT NOT NULL,
      source_conversations UUID[],
      applied_changes JSONB,
      applied_at TIMESTAMP,
      was_beneficial BOOLEAN,
      verified_at TIMESTAMP,
      reverted BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
  ],

  weekly_reports: [
    `CREATE TABLE IF NOT EXISTS weekly_reports (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      week_start DATE NOT NULL,
      week_end DATE NOT NULL,
      conversations_analyzed INTEGER,
      errors_found INTEGER,
      lessons_generated INTEGER,
      changes_applied JSONB,
      previous_changes_verified JSONB,
      model_used VARCHAR,
      tokens_used INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
  ],

  // --- Pairing Module ---
  pairing_requests: [
    `CREATE TABLE IF NOT EXISTS pairing_requests (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      platform VARCHAR NOT NULL,
      platform_user_id VARCHAR NOT NULL,
      username VARCHAR,
      pairing_code VARCHAR NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      status VARCHAR DEFAULT 'pending',
      resolved_by VARCHAR,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
  ],

  // --- OpenRouter Model Catalog ---
  openrouter_models: [
    `CREATE TABLE IF NOT EXISTS openrouter_models (
      id VARCHAR PRIMARY KEY,
      name VARCHAR NOT NULL,
      provider VARCHAR NOT NULL,
      context_length INTEGER,
      pricing_input DECIMAL,
      pricing_output DECIMAL,
      capabilities JSONB,
      recommendations TEXT,
      synced_at TIMESTAMP DEFAULT NOW()
    )`,
  ],

  // --- Context Summaries ---
  conversation_summaries: [
    `CREATE TABLE IF NOT EXISTS conversation_summaries (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      token_count INTEGER,
      messages_summarized INTEGER,
      embedding vector(768),
      created_at TIMESTAMP DEFAULT NOW()
    )`,
  ],

  // --- Recovery ---
  recovery_state: [
    `CREATE TABLE IF NOT EXISTS recovery_state (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      component VARCHAR NOT NULL UNIQUE,
      state JSONB NOT NULL,
      iteration INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
  ],
};

// Dependencies: some tables need other tables created first
const TABLE_DEPENDENCIES: Record<string, string[]> = {
  agent_communications: ['agents'],
  agent_dependencies: ['agents'],
  conversation_summaries: ['conversations'], // conversations is essential, always exists
};

export class SchemaManager {
  private static instance: SchemaManager;
  private db: Database;
  private createdTables: Set<string> = new Set();

  private constructor() {
    this.db = Database.getInstance();
  }

  static getInstance(): SchemaManager {
    if (!SchemaManager.instance) {
      SchemaManager.instance = new SchemaManager();
    }
    return SchemaManager.instance;
  }

  /**
   * Ensure a table exists. Creates it on first call, skips on subsequent calls.
   * Handles dependencies automatically.
   */
  async ensureTable(tableName: string): Promise<void> {
    if (this.createdTables.has(tableName)) return;
    if (!this.db.isConnected()) return;

    const schema = TABLE_SCHEMAS[tableName];
    if (!schema) {
      console.warn(`[Schema] Unknown table: ${tableName}. Skipping.`);
      return;
    }

    // Create dependencies first
    const deps = TABLE_DEPENDENCIES[tableName] || [];
    for (const dep of deps) {
      await this.ensureTable(dep);
    }

    try {
      for (const sql of schema) {
        await this.db.execute(sql);
      }
      this.createdTables.add(tableName);
      console.log(`[Schema] Table ready: ${tableName}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Schema] Failed to create table '${tableName}': ${errMsg}`);
    }
  }

  /**
   * Ensure multiple tables exist at once.
   */
  async ensureTables(...tableNames: string[]): Promise<void> {
    for (const name of tableNames) {
      await this.ensureTable(name);
    }
  }

  /**
   * Check if a table has been created in this session.
   */
  isReady(tableName: string): boolean {
    return this.createdTables.has(tableName);
  }

  /**
   * List all available table schemas (for Thor to know what he can create).
   */
  listAvailableSchemas(): string[] {
    return Object.keys(TABLE_SCHEMAS);
  }

  /**
   * Mark essential tables as created (called after startup migration).
   */
  markAsCreated(...tableNames: string[]): void {
    for (const name of tableNames) {
      this.createdTables.add(name);
    }
  }
}
