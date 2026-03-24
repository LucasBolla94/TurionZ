// ============================================================
// TurionZ — Message Repository
// Created by BollaNetwork
// ============================================================

import { Database } from '../infra/database';

export interface Message {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  token_count: number | null;
  is_summary: boolean;
  created_at: Date;
}

export class MessageRepository {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  async create(
    conversationId: string,
    role: string,
    content: string,
    tokenCount?: number
  ): Promise<Message> {
    const rows = await this.db.query<Message>(
      `INSERT INTO messages (conversation_id, role, content, token_count)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [conversationId, role, content, tokenCount || null]
    );
    return rows[0];
  }

  async createSummary(
    conversationId: string,
    content: string,
    tokenCount?: number
  ): Promise<Message> {
    const rows = await this.db.query<Message>(
      `INSERT INTO messages (conversation_id, role, content, token_count, is_summary)
       VALUES ($1, 'system', $2, $3, TRUE)
       RETURNING *`,
      [conversationId, content, tokenCount || null]
    );
    return rows[0];
  }

  async findByConversation(conversationId: string): Promise<Message[]> {
    return this.db.query<Message>(
      `SELECT * FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId]
    );
  }

  async findByConversationWithTokenLimit(
    conversationId: string,
    maxTokens: number
  ): Promise<Message[]> {
    // Get messages from newest to oldest, accumulating tokens until limit
    const allMessages = await this.db.query<Message>(
      `SELECT * FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC`,
      [conversationId]
    );

    const selected: Message[] = [];
    let totalTokens = 0;

    for (const msg of allMessages) {
      const msgTokens = msg.token_count || this.estimateTokens(msg.content);
      if (totalTokens + msgTokens > maxTokens) {
        break;
      }
      totalTokens += msgTokens;
      selected.push(msg);
    }

    // Reverse to get chronological order
    return selected.reverse();
  }

  async countTokensInConversation(conversationId: string): Promise<number> {
    const result = await this.db.queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(token_count), 0) as total
       FROM messages
       WHERE conversation_id = $1`,
      [conversationId]
    );
    return result ? parseInt(result.total, 10) : 0;
  }

  async updateEmbedding(messageId: string, embedding: number[]): Promise<void> {
    const vectorStr = `[${embedding.join(',')}]`;
    await this.db.execute(
      `UPDATE messages SET embedding = $1::vector WHERE id = $2`,
      [vectorStr, messageId]
    );
  }

  async searchByEmbedding(
    embedding: number[],
    limit: number = 5
  ): Promise<Message[]> {
    const vectorStr = `[${embedding.join(',')}]`;
    return this.db.query<Message>(
      `SELECT *, embedding <=> $1::vector AS distance
       FROM messages
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [vectorStr, limit]
    );
  }

  async deleteByConversation(conversationId: string): Promise<number> {
    return this.db.execute(
      'DELETE FROM messages WHERE conversation_id = $1',
      [conversationId]
    );
  }

  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
}
