// ============================================================
// TurionZ — Pairing Flow Manager
// Created by BollaNetwork
// ============================================================

import * as crypto from 'crypto';
import { Database } from '../infra/database';
import { AllowlistManager } from './AllowlistManager';

const PAIRING_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const DENY_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

interface PairingRequest {
  id: string;
  platform: string;
  platform_user_id: string;
  username: string | null;
  pairing_code: string;
  expires_at: Date;
  status: string;
}

export class PairingFlowManager {
  private db: Database;
  private allowlist: AllowlistManager;

  constructor() {
    this.db = Database.getInstance();
    this.allowlist = new AllowlistManager();
  }

  async createRequest(
    platform: string,
    userId: string,
    username?: string
  ): Promise<string | null> {
    if (!this.db.isConnected()) return null;

    // Check cooldown (denied in last 24h)
    const recentDeny = await this.db.queryOne<PairingRequest>(
      `SELECT * FROM pairing_requests
       WHERE platform = $1 AND platform_user_id = $2 AND status = 'denied'
       AND created_at > NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC LIMIT 1`,
      [platform, userId]
    );

    if (recentDeny) {
      return null; // Still in cooldown
    }

    // Check existing pending request
    const existingPending = await this.db.queryOne<PairingRequest>(
      `SELECT * FROM pairing_requests
       WHERE platform = $1 AND platform_user_id = $2 AND status = 'pending'
       AND expires_at > NOW()
       LIMIT 1`,
      [platform, userId]
    );

    if (existingPending) {
      return existingPending.pairing_code; // Return existing code
    }

    // Generate new pairing code: TZ-XXXX-XXXX
    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + PAIRING_EXPIRY_MS);

    await this.db.execute(
      `INSERT INTO pairing_requests (platform, platform_user_id, username, pairing_code, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [platform, userId, username || null, code, expiresAt.toISOString()]
    );

    console.log(`[Pairing] New request from ${userId} on ${platform}. Code: ${code}`);
    return code;
  }

  async approve(code: string, approvedBy: string): Promise<boolean> {
    if (!this.db.isConnected()) return false;

    const request = await this.db.queryOne<PairingRequest>(
      `SELECT * FROM pairing_requests
       WHERE pairing_code = $1 AND status = 'pending' AND expires_at > NOW()`,
      [code]
    );

    if (!request) {
      return false; // Code not found, expired, or already resolved
    }

    // Update request status
    await this.db.execute(
      `UPDATE pairing_requests SET status = 'approved', resolved_by = $1 WHERE id = $2`,
      [approvedBy, request.id]
    );

    // Add user to allowlist
    await this.allowlist.addUser(
      request.platform,
      request.platform_user_id,
      approvedBy,
      false,
      request.username || undefined
    );

    console.log(`[Pairing] Approved ${request.platform_user_id} on ${request.platform} by ${approvedBy}.`);
    return true;
  }

  async deny(code: string, deniedBy: string): Promise<boolean> {
    if (!this.db.isConnected()) return false;

    const result = await this.db.execute(
      `UPDATE pairing_requests SET status = 'denied', resolved_by = $1
       WHERE pairing_code = $2 AND status = 'pending'`,
      [deniedBy, code]
    );

    if (result > 0) {
      console.log(`[Pairing] Denied code ${code} by ${deniedBy}.`);
      return true;
    }
    return false;
  }

  async getPendingRequests(): Promise<PairingRequest[]> {
    if (!this.db.isConnected()) return [];

    return this.db.query<PairingRequest>(
      `SELECT * FROM pairing_requests
       WHERE status = 'pending' AND expires_at > NOW()
       ORDER BY created_at DESC`
    );
  }

  private generateCode(): string {
    const hex = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `TZ-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
  }
}
