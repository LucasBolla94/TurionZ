// ============================================================
// TurionZ (Thor) — AI Personal Agent by Bolla Network
// Entry Point
// ============================================================

import { Database } from './infra/database';
import { Migrations } from './infra/migrations';
import { VaultManager } from './security/VaultManager';
import { PersonalityEngine } from './core/PersonalityEngine';
import { MemoryManager } from './memory/MemoryManager';
import { ToolRegistry } from './tools/ToolRegistry';
import { MemorySearchTool } from './tools/builtin/MemorySearchTool';
import { AgentController } from './core/AgentController';
import { AuthenticationGateway } from './security/AuthenticationGateway';
import { PermissionManager } from './security/PermissionManager';
import { TelegramInputAdapter } from './gateway/adapters/telegram/TelegramInputAdapter';

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('  TurionZ (Thor) — AI Personal Agent');
  console.log('  Created by BollaNetwork');
  console.log('  Version: 0.1.0');
  console.log('='.repeat(60));
  console.log('');

  // --- Fase 1: Database ---
  const db = Database.getInstance();
  await db.connect();

  if (db.isConnected()) {
    const migrations = new Migrations();
    await migrations.run();
  }

  // --- Fase 2: Vault ---
  const vault = VaultManager.getInstance();
  await vault.initialize();

  // --- Fase 5: Memory ---
  const memory = MemoryManager.getInstance();
  await memory.initialize();

  // --- Fase 6: Tool Registry ---
  const toolRegistry = ToolRegistry.getInstance();
  toolRegistry.register(new MemorySearchTool());
  console.log(`[Tools] ${toolRegistry.count()} tools registered.`);

  // --- Fase 8: Authentication ---
  const auth = AuthenticationGateway.getInstance();
  if (db.isConnected()) {
    await auth.ensureOwnerRegistered('telegram');
  }

  // --- Fase 10: Agent Controller ---
  const controller = AgentController.getInstance();
  await controller.initialize();

  // --- Fase 11: Permissions ---
  const permissions = PermissionManager.getInstance();
  console.log('[Permissions] Permission system ready.');

  // --- Fase 9: Telegram Gateway ---
  const telegramToken = vault.readOrEnv('telegram_bot_token', 'TELEGRAM_BOT_TOKEN');
  if (telegramToken) {
    const telegram = new TelegramInputAdapter(telegramToken);
    await telegram.start();
  } else {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN not set. Telegram adapter not started.');
  }

  console.log('');
  console.log('[TurionZ] Thor is ready and listening.');
}

main().catch((error) => {
  console.error('[TurionZ] Fatal error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
