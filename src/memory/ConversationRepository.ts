// ============================================================
// TurionZ — Conversation Repository
// Created by BollaNetwork
// ============================================================

import { Database } from '../infra/database';

export interface Conversation {
  id: string;
  user_id: string;
  platform: string;
  provider: string | null;
  context_window_size: number;
  current_token_count: number;
  created_at: Date;
  updated_at: Date;
}

export class ConversationRepository {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  async create(userId: string, platform: string, provider?: string): Promise<Conversation> {
    const rows = await this.db.query<Conversation>(
      `INSERT INTO conversations (user_id, platform, provider)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, platform, provider || null]
    );
    return rows[0];
  }

  async findById(id: string): Promise<Conversation | null> {
    return this.db.queryOne<Conversation>(
      'SELECT * FROM conversations WHERE id = $1',
      [id]
    );
  }

  async findByUserId(userId: string, platform: string): Promise<Conversation | null> {
    return this.db.queryOne<Conversation>(
      `SELECT * FROM conversations
       WHERE user_id = $1 AND platform = $2
       ORDER BY updated_at DESC
       LIMIT 1`,
      [userId, platform]
    );
  }

  async findOrCreate(userId: string, platform: string, provider?: string): Promise<Conversation> {
    const existing = await this.findByUserId(userId, platform);
    if (existing) {
      return existing;
    }
    return this.create(userId, platform, provider);
  }

  async updateTokenCount(id: string, tokenCount: number): Promise<void> {
    await this.db.execute(
      `UPDATE conversations
       SET current_token_count = $1, updated_at = NOW()
       WHERE id = $2`,
      [tokenCount, id]
    );
  }

  async updateProvider(id: string, provider: string): Promise<void> {
    await this.db.execute(
      `UPDATE conversations
       SET provider = $1, updated_at = NOW()
       WHERE id = $2`,
      [provider, id]
    );
  }

  async updateContextWindowSize(id: string, size: number): Promise<void> {
    await this.db.execute(
      `UPDATE conversations
       SET context_window_size = $1, updated_at = NOW()
       WHERE id = $2`,
      [size, id]
    );
  }
}
