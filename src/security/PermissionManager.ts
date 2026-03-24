// ============================================================
// TurionZ — Permission Manager (CRUD + "Ask Once, Remember Forever")
// Created by BollaNetwork
// ============================================================

import { Database } from '../infra/database';
import { SchemaManager } from '../infra/SchemaManager';
import { PermissionChecker, PermissionResult } from './PermissionChecker';
import { Permission } from '../types';

export class PermissionManager {
  private static instance: PermissionManager;
  private db: Database;
  private checker: PermissionChecker;

  private constructor() {
    this.db = Database.getInstance();
    this.checker = new PermissionChecker();
  }

  static getInstance(): PermissionManager {
    if (!PermissionManager.instance) {
      PermissionManager.instance = new PermissionManager();
    }
    return PermissionManager.instance;
  }

  getChecker(): PermissionChecker {
    return this.checker;
  }

  async checkPermission(action: string): Promise<PermissionResult> {
    return this.checker.check(action);
  }

  async grant(action: string, grantedBy: string): Promise<void> {
    if (!this.db.isConnected()) return;
    await SchemaManager.getInstance().ensureTable('permissions');

    const category = this.extractCategory(action);
    const isWildcard = action.endsWith('_*');

    await this.db.execute(
      `INSERT INTO permissions (action, category, is_wildcard, granted, granted_by)
       VALUES ($1, $2, $3, TRUE, $4)
       ON CONFLICT (action) DO UPDATE
       SET granted = TRUE, granted_by = $4, granted_at = NOW(), revoked_at = NULL`,
      [action, category, isWildcard, grantedBy]
    );

    console.log(`[Permissions] Granted: '${action}' by ${grantedBy}.`);
  }

  async deny(action: string, deniedBy: string): Promise<void> {
    if (!this.db.isConnected()) return;

    const category = this.extractCategory(action);
    const isWildcard = action.endsWith('_*');

    await this.db.execute(
      `INSERT INTO permissions (action, category, is_wildcard, granted, granted_by)
       VALUES ($1, $2, $3, FALSE, $4)
       ON CONFLICT (action) DO UPDATE
       SET granted = FALSE, granted_by = $4, granted_at = NOW(), revoked_at = NULL`,
      [action, category, isWildcard, deniedBy]
    );

    console.log(`[Permissions] Denied: '${action}' by ${deniedBy}.`);
  }

  async revoke(action: string): Promise<void> {
    if (!this.db.isConnected()) return;

    await this.db.execute(
      `UPDATE permissions SET revoked_at = NOW() WHERE action = $1`,
      [action]
    );

    console.log(`[Permissions] Revoked: '${action}'.`);
  }

  async listAll(): Promise<Permission[]> {
    if (!this.db.isConnected()) return [];

    const rows = await this.db.query<any>(
      'SELECT * FROM permissions WHERE revoked_at IS NULL ORDER BY category, action'
    );

    return rows.map(row => ({
      id: row.id,
      action: row.action,
      category: row.category,
      isWildcard: row.is_wildcard,
      granted: row.granted,
      grantedBy: row.granted_by,
      grantedAt: row.granted_at,
    }));
  }

  async listByCategory(category: string): Promise<Permission[]> {
    if (!this.db.isConnected()) return [];

    const rows = await this.db.query<any>(
      'SELECT * FROM permissions WHERE category = $1 AND revoked_at IS NULL',
      [category]
    );

    return rows.map(row => ({
      id: row.id,
      action: row.action,
      category: row.category,
      isWildcard: row.is_wildcard,
      granted: row.granted,
      grantedBy: row.granted_by,
      grantedAt: row.granted_at,
    }));
  }

  private extractCategory(action: string): string {
    const underscoreIndex = action.indexOf('_');
    if (underscoreIndex > 0) {
      return action.substring(0, underscoreIndex);
    }
    return action;
  }
}
