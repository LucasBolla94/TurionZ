// ============================================================
// TurionZ — Database Migrations (Auto-create tables on startup)
// Created by BollaNetwork
// ============================================================

import { Database } from './database';

export class Migrations {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  async run(): Promise<void> {
    if (!this.db.isConnected()) {
      console.warn('[Migrations] Database not connected. Skipping migrations.');
      return;
    }

    console.log('[Migrations] Running database migrations...');

    try {
      await this.createExtensions();
      await this.createConversationsTables();
      await this.createOpenRouterModelTable();
      await this.createPermissionsTable();
      await this.createActivityLogsTables();
      await this.createAgentsTables();
      await this.createAuthTables();
      await this.createRecoveryTable();
      await this.createIndices();

      console.log('[Migrations] All migrations completed successfully.');
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Migrations] Migration failed: ${errMsg}`);
      throw error;
    }
  }

  private async createExtensions(): Promise<void> {
    await this.db.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await this.db.execute('CREATE EXTENSION IF NOT EXISTS vector');
    console.log('[Migrations] Extensions created (uuid-ossp, vector).');
  }

  private async createConversationsTables(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id VARCHAR NOT NULL,
        platform VARCHAR NOT NULL,
        provider VARCHAR,
        context_window_size INTEGER DEFAULT 150000,
        current_token_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
        role VARCHAR NOT NULL,
        content TEXT NOT NULL,
        token_count INTEGER,
        embedding vector(768),
        is_summary BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS conversation_summaries (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
        summary TEXT NOT NULL,
        token_count INTEGER,
        messages_summarized INTEGER,
        embedding vector(768),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('[Migrations] Tables created: conversations, messages, conversation_summaries.');
  }

  private async createOpenRouterModelTable(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS openrouter_models (
        id VARCHAR PRIMARY KEY,
        name VARCHAR NOT NULL,
        provider VARCHAR NOT NULL,
        context_length INTEGER,
        pricing_input DECIMAL,
        pricing_output DECIMAL,
        capabilities JSONB,
        recommendations TEXT,
        synced_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('[Migrations] Table created: openrouter_models.');
  }

  private async createPermissionsTable(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS permissions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        action VARCHAR NOT NULL UNIQUE,
        category VARCHAR NOT NULL,
        is_wildcard BOOLEAN DEFAULT FALSE,
        granted BOOLEAN NOT NULL,
        granted_by VARCHAR,
        granted_at TIMESTAMP DEFAULT NOW(),
        revoked_at TIMESTAMP
      )
    `);

    console.log('[Migrations] Table created: permissions.');
  }

  private async createActivityLogsTables(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        agent_type VARCHAR NOT NULL,
        agent_name VARCHAR NOT NULL,
        action VARCHAR NOT NULL,
        details JSONB,
        duration_ms INTEGER,
        tokens_used INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS lessons_learned (
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
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS weekly_reports (
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
      )
    `);

    console.log('[Migrations] Tables created: activity_logs, lessons_learned, weekly_reports.');
  }

  private async createAgentsTables(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS agents (
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
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS agent_communications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        from_agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
        to_agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
        data JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS agent_dependencies (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
        depends_on_agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
        resolved BOOLEAN DEFAULT FALSE,
        resolved_at TIMESTAMP
      )
    `);

    console.log('[Migrations] Tables created: agents, agent_communications, agent_dependencies.');
  }

  private async createAuthTables(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS authorized_users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        platform VARCHAR NOT NULL,
        platform_user_id VARCHAR NOT NULL,
        username VARCHAR,
        is_owner BOOLEAN DEFAULT FALSE,
        approved_by VARCHAR,
        approved_at TIMESTAMP DEFAULT NOW(),
        revoked_at TIMESTAMP,
        UNIQUE(platform, platform_user_id)
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS pairing_requests (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        platform VARCHAR NOT NULL,
        platform_user_id VARCHAR NOT NULL,
        username VARCHAR,
        pairing_code VARCHAR NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        status VARCHAR DEFAULT 'pending',
        resolved_by VARCHAR,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('[Migrations] Tables created: authorized_users, pairing_requests.');
  }

  private async createRecoveryTable(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS recovery_state (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        component VARCHAR NOT NULL,
        state JSONB NOT NULL,
        iteration INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('[Migrations] Table created: recovery_state.');
  }

  private async createIndices(): Promise<void> {
    // Messages indices
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages(conversation_id, created_at)
    `);

    // Embedding index (only works if there are rows with embeddings)
    // Using ivfflat — requires at least some data to build. Will be created
    // dynamically when embeddings start flowing. For now, skip if fails.
    try {
      await this.db.execute(`
        CREATE INDEX IF NOT EXISTS idx_messages_embedding
        ON messages USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
      `);
    } catch {
      console.log('[Migrations] Embedding index skipped (will be created when data exists).');
    }

    // Agents indices
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_agents_parent ON agents(parent_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)
    `);

    // Auth indices
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_authorized_users_platform
      ON authorized_users(platform, platform_user_id)
    `);

    console.log('[Migrations] Indices created.');
  }
}
