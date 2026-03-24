// ============================================================
// TurionZ — Allowlist Manager (PostgreSQL-backed)
// Created by BollaNetwork
// ============================================================

import { Database } from '../infra/database';

export interface AuthorizedUser {
  id: string;
  platform: string;
  platform_user_id: string;
  username: string | null;
  is_owner: boolean;
  approved_by: string | null;
  approved_at: Date;
  revoked_at: Date | null;
}

export class AllowlistManager {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  async isAuthorized(platform: string, userId: string): Promise<boolean> {
    if (!this.db.isConnected()) {
      // In degraded mode, check env-based owner only
      const ownerEnvKey = `OWNER_${platform.toUpperCase()}_ID`;
      return process.env[ownerEnvKey] === userId ||
             process.env.OWNER_TELEGRAM_ID === userId;
    }

    const result = await this.db.queryOne<AuthorizedUser>(
      `SELECT * FROM authorized_users
       WHERE platform = $1 AND platform_user_id = $2 AND revoked_at IS NULL`,
      [platform, userId]
    );

    return result !== null;
  }

  async addUser(
    platform: string,
    userId: string,
    approvedBy: string,
    isOwner: boolean = false,
    username?: string
  ): Promise<void> {
    if (!this.db.isConnected()) return;

    await this.db.execute(
      `INSERT INTO authorized_users (platform, platform_user_id, username, is_owner, approved_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (platform, platform_user_id) DO UPDATE
       SET revoked_at = NULL, approved_by = $5, approved_at = NOW()`,
      [platform, userId, username || null, isOwner, approvedBy]
    );

    console.log(`[Allowlist] User ${userId} authorized on ${platform} by ${approvedBy}.`);
  }

  async removeUser(platform: string, userId: string): Promise<void> {
    if (!this.db.isConnected()) return;

    await this.db.execute(
      `UPDATE authorized_users
       SET revoked_at = NOW()
       WHERE platform = $1 AND platform_user_id = $2`,
      [platform, userId]
    );

    console.log(`[Allowlist] User ${userId} revoked on ${platform}.`);
  }

  async listUsers(platform?: string): Promise<AuthorizedUser[]> {
    if (!this.db.isConnected()) return [];

    if (platform) {
      return this.db.query<AuthorizedUser>(
        'SELECT * FROM authorized_users WHERE platform = $1 AND revoked_at IS NULL',
        [platform]
      );
    }

    return this.db.query<AuthorizedUser>(
      'SELECT * FROM authorized_users WHERE revoked_at IS NULL'
    );
  }

  async ensureOwnerExists(platform: string, ownerId: string, ownerName: string): Promise<void> {
    if (!this.db.isConnected()) return;

    const exists = await this.isAuthorized(platform, ownerId);
    if (!exists) {
      await this.addUser(platform, ownerId, 'system', true);
      console.log(`[Allowlist] Owner ${ownerName} auto-registered on ${platform}.`);
    }
  }
}
