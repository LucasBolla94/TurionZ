// ============================================================
// TurionZ — Database Migrations (Essential Tables Only)
// Created by BollaNetwork
//
// STRATEGY (Caminho C — Hybrid):
// - ESSENTIAL: Created here at startup (Thor can't work without them)
// - ON-DEMAND: Created by SchemaManager when each module first needs them
// - EVOLUTIVE: Thor can create new tables via SchemaManager in the future
//
// Essential tables (3):
//   conversations  → Thor needs to know who he's talking to
//   messages       → Thor needs memory to function
//   authorized_users → Thor needs to know who's allowed in
//
// Everything else is created on-demand by each module.
// ============================================================

import { Database } from './database';
import { SchemaManager } from './SchemaManager';

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

    console.log('[Migrations] Creating essential tables...');

    try {
      await this.createExtensions();
      await this.createConversationsTable();
      await this.createMessagesTable();
      await this.createAuthorizedUsersTable();
      await this.createEssentialIndices();

      // Mark essential tables as created in SchemaManager
      const schema = SchemaManager.getInstance();
      schema.markAsCreated('conversations', 'messages', 'authorized_users');

      console.log('[Migrations] Essential tables ready (3/3). Other tables will be created on-demand.');
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Migrations] Migration failed: ${errMsg}`);
      throw error;
    }
  }

  private async createExtensions(): Promise<void> {
    await this.db.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    // pgvector will be needed later for embeddings — create it now since
    // it requires superuser and is better done at setup time
    try {
      await this.db.execute('CREATE EXTENSION IF NOT EXISTS vector');
    } catch {
      console.warn('[Migrations] pgvector extension not available. Embedding search will be disabled.');
    }
  }

  private async createConversationsTable(): Promise<void> {
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
  }

  private async createMessagesTable(): Promise<void> {
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
  }

  private async createAuthorizedUsersTable(): Promise<void> {
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
  }

  private async createEssentialIndices(): Promise<void> {
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages(conversation_id, created_at)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_authorized_users_platform
      ON authorized_users(platform, platform_user_id)
    `);
  }
}
