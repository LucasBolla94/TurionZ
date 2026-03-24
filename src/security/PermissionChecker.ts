// ============================================================
// TurionZ — Permission Checker
// Created by BollaNetwork
// ============================================================

import { Database } from '../infra/database';
import { Permission } from '../types';

export type PermissionResult = 'granted' | 'denied' | 'ask_user';

// Actions that are always free (no permission needed)
const FREE_ACTIONS = new Set([
  'create_file',
  'read_file',
  'write_file',
  'web_search',
  'generate_document',
  'memory_search',
  'list_files',
  'execute_sandbox',
]);

// Action categories that require permission
const PERMISSION_CATEGORIES = new Set([
  'install',
  'delete',
  'modify_system',
  'send_external',
  'execute_os',
  'access_sensitive',
]);

export class PermissionChecker {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  async check(action: string): Promise<PermissionResult> {
    // Free actions never need permission
    if (FREE_ACTIONS.has(action)) {
      return 'granted';
    }

    // Extract category from action (e.g., "install_nodejs" → "install")
    const category = this.extractCategory(action);

    // Check if this category requires permission
    if (!PERMISSION_CATEGORIES.has(category)) {
      return 'granted'; // Unknown category = free
    }

    if (!this.db.isConnected()) {
      // No DB = can't check permissions = ask user
      return 'ask_user';
    }

    // 1. Check specific permission (e.g., "install_nodejs")
    const specific = await this.findPermission(action);
    if (specific) {
      return specific.granted ? 'granted' : 'denied';
    }

    // 2. Check wildcard permission (e.g., "install_*")
    const wildcard = await this.findPermission(`${category}_*`);
    if (wildcard) {
      return wildcard.granted ? 'granted' : 'denied';
    }

    // 3. Not found — need to ask user
    return 'ask_user';
  }

  isFreeAction(action: string): boolean {
    return FREE_ACTIONS.has(action);
  }

  private extractCategory(action: string): string {
    const underscoreIndex = action.indexOf('_');
    if (underscoreIndex > 0) {
      return action.substring(0, underscoreIndex);
    }
    return action;
  }

  private async findPermission(action: string): Promise<Permission | null> {
    if (!this.db.isConnected()) return null;

    const row = await this.db.queryOne<any>(
      `SELECT * FROM permissions
       WHERE action = $1 AND revoked_at IS NULL`,
      [action]
    );

    if (!row) return null;

    return {
      id: row.id,
      action: row.action,
      category: row.category,
      isWildcard: row.is_wildcard,
      granted: row.granted,
      grantedBy: row.granted_by,
      grantedAt: row.granted_at,
    };
  }
}
