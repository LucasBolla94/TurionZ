// ============================================================
// TurionZ (Thor) — AI Personal Agent by Bolla Network
// Entry Point — Full v0.1
// ============================================================

import { Database } from './infra/database';
import { Migrations } from './infra/migrations';
import { VaultManager } from './security/VaultManager';
import { PersonalityEngine } from './core/PersonalityEngine';
import { MemoryManager } from './memory/MemoryManager';
import { ToolRegistry } from './tools/ToolRegistry';
import { MemorySearchTool } from './tools/builtin/MemorySearchTool';
import { CreateSubAgentTool } from './tools/builtin/CreateSubAgentTool';
import { CheckSubAgentTool } from './tools/builtin/CheckSubAgentTool';
import { CommunicateSubAgentTool } from './tools/builtin/CommunicateSubAgentTool';
import { AgentController } from './core/AgentController';
import { AuthenticationGateway } from './security/AuthenticationGateway';
import { PermissionManager } from './security/PermissionManager';
import { RecoveryManager } from './infra/RecoveryManager';
import { IntegrityChecker } from './infra/IntegrityChecker';
import { SelfImprover } from './core/SelfImprover';
import { Logger } from './infra/Logger';
import { ActivityLogger } from './infra/ActivityLogger';
import { TelegramInputAdapter } from './gateway/adapters/telegram/TelegramInputAdapter';
import { DiscordAdapter } from './gateway/adapters/discord/DiscordAdapter';
import { WhatsAppAdapter } from './gateway/adapters/whatsapp/WhatsAppAdapter';
import { APIRestAdapter } from './gateway/adapters/api/APIRestAdapter';

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('  TurionZ (Thor) — AI Personal Agent');
  console.log('  Created by BollaNetwork');
  console.log('  Version: 0.1.0');
  console.log('='.repeat(60));
  console.log('');

  const logger = Logger.getInstance();
  const activityLogger = ActivityLogger.getInstance();

  // --- Recovery: Boot Sequence ---
  const recovery = RecoveryManager.getInstance();
  const integrity = new IntegrityChecker();
  integrity.check();

  // --- Database ---
  const db = Database.getInstance();
  await db.connect();

  if (db.isConnected()) {
    const migrations = new Migrations();
    await migrations.run();
  }

  // --- Recovery: Full startup sequence ---
  const startupReport = await recovery.runStartupSequence();

  // --- Vault ---
  const vault = VaultManager.getInstance();
  await vault.initialize();

  // --- Memory ---
  const memory = MemoryManager.getInstance();
  await memory.initialize();

  // --- Tools ---
  const toolRegistry = ToolRegistry.getInstance();
  toolRegistry.register(new MemorySearchTool());
  toolRegistry.register(new CreateSubAgentTool());
  toolRegistry.register(new CheckSubAgentTool());
  toolRegistry.register(new CommunicateSubAgentTool());
  console.log(`[Tools] ${toolRegistry.count()} tool(s) registered.`);

  // --- Authentication ---
  const auth = AuthenticationGateway.getInstance();
  if (db.isConnected()) {
    await auth.ensureOwnerRegistered('telegram');
    await auth.ensureOwnerRegistered('discord');
  }

  // --- Controller ---
  const controller = AgentController.getInstance();
  await controller.initialize();

  // --- Permissions ---
  PermissionManager.getInstance();
  console.log('[Permissions] Permission system ready.');

  // --- Self-Improvement ---
  const selfImprover = SelfImprover.getInstance();
  if (!recovery.isSafeMode()) {
    selfImprover.scheduleWeeklyAnalysis();
  }

  // --- Gateways ---

  // Telegram
  const telegramToken = vault.readOrEnv('telegram_bot_token', 'TELEGRAM_BOT_TOKEN');
  if (telegramToken) {
    const telegram = new TelegramInputAdapter(telegramToken);
    await telegram.start();
  } else {
    console.warn('[Telegram] Bot token not configured. Skipping.');
  }

  // Discord
  const discordToken = vault.readOrEnv('discord_bot_token', 'DISCORD_BOT_TOKEN');
  if (discordToken) {
    const discord = new DiscordAdapter(discordToken);
    await discord.start(discordToken);
  } else {
    console.warn('[Discord] Bot token not configured. Skipping.');
  }

  // WhatsApp
  const whatsapp = new WhatsAppAdapter();
  await whatsapp.start();

  // API REST
  const api = new APIRestAdapter();
  await api.start();

  // --- Recovery Notification ---
  const recoveryMsg = await recovery.getRecoveryNotification();
  if (recoveryMsg) {
    console.log(`[Recovery] ${recoveryMsg}`);
  }

  // --- Ready ---
  console.log('');
  await logger.info('TurionZ', 'System startup complete', { version: '0.1.0' });
  await activityLogger.logSystemEvent('system', 'startup', { version: '0.1.0' });
  console.log('[TurionZ] Thor is ready and listening on all platforms.');

  // --- Graceful Shutdown ---
  const shutdown = async (signal: string) => {
    console.log(`[TurionZ] Received ${signal}. Shutting down gracefully...`);
    await activityLogger.logSystemEvent('system', 'shutdown', { signal });
    selfImprover.stopScheduler();
    await recovery.saveShutdownState();
    await activityLogger.shutdown();
    await db.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[TurionZ] Fatal error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
