// ============================================================
// TurionZ — Database Connection (Singleton)
// Created by BollaNetwork
// ============================================================

import { Pool, PoolClient } from 'pg';

export class Database {
  private static instance: Database;
  private pool: Pool | null = null;
  private connected: boolean = false;

  private constructor() {}

  static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  async connect(retries: number = 3): Promise<void> {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      console.warn('[Database] DATABASE_URL not set. Running in degraded mode (no persistence).');
      return;
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        this.pool = new Pool({
          connectionString: databaseUrl,
          max: 10,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        });

        // Test connection
        const client = await this.pool.connect();
        client.release();
        this.connected = true;
        console.log('[Database] Connected to PostgreSQL successfully.');
        return;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[Database] Connection attempt ${attempt}/${retries} failed: ${errMsg}`);

        if (attempt < retries) {
          const delay = attempt * 2000;
          console.log(`[Database] Retrying in ${delay / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    console.warn('[Database] All connection attempts failed. Running in degraded mode.');
  }

  isConnected(): boolean {
    return this.connected;
  }

  getPool(): Pool | null {
    return this.pool;
  }

  async query<T>(text: string, params?: unknown[]): Promise<T[]> {
    if (!this.pool || !this.connected) {
      throw new Error('Database not connected. Cannot execute query.');
    }

    const result = await this.pool.query(text, params);
    return result.rows as T[];
  }

  async queryOne<T>(text: string, params?: unknown[]): Promise<T | null> {
    const rows = await this.query<T>(text, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async execute(text: string, params?: unknown[]): Promise<number> {
    if (!this.pool || !this.connected) {
      throw new Error('Database not connected. Cannot execute statement.');
    }

    const result = await this.pool.query(text, params);
    return result.rowCount ?? 0;
  }

  async getClient(): Promise<PoolClient> {
    if (!this.pool || !this.connected) {
      throw new Error('Database not connected. Cannot get client.');
    }

    return this.pool.connect();
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.connected = false;
      console.log('[Database] Disconnected from PostgreSQL.');
    }
  }
}
