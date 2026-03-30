// ============================================================
// TurionZ (Thor) — AI Personal Agent by Bolla Network
// Entry Point — Full v0.1
// ============================================================

import * as dotenv from 'dotenv';
dotenv.config(); // Load .env BEFORE anything else

import * as fs from 'fs';
import * as path from 'path';
import { Database } from './infra/database';
import { Migrations } from './infra/migrations';
import { SelfHealer } from './infra/SelfHealer';
import { VaultManager } from './security/VaultManager';
import { PersonalityEngine } from './core/PersonalityEngine';
import { MemoryManager } from './memory/MemoryManager';
import { ToolRegistry } from './tools/ToolRegistry';
import { MemorySearchTool } from './tools/builtin/MemorySearchTool';
import { CreateSubAgentTool } from './tools/builtin/CreateSubAgentTool';
import { CheckSubAgentTool } from './tools/builtin/CheckSubAgentTool';
import { CommunicateSubAgentTool } from './tools/builtin/CommunicateSubAgentTool';
import { CreateSkillTool } from './tools/builtin/CreateSkillTool';
import { SkillLoader } from './skills/SkillLoader';
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

  // --- Self-Healer: Auto-fix issues before anything else ---
  const healer = new SelfHealer();
  const healResults = await healer.healAll();
  const criticalFails = healResults.filter(r => !r.fixed && ['OPENROUTER_API_KEY not set', 'DATABASE_URL not configured'].includes(r.issue));
  if (criticalFails.length > 0) {
    console.error('[TurionZ] Critical issues could not be auto-fixed. Run: npm run setup');
    // Continue in degraded mode instead of crashing
  }

  // --- Recovery: Boot Sequence ---
  const recovery = RecoveryManager.getInstance();
  const integrity = new IntegrityChecker();
  integrity.check();

  // --- Database ---
  const db = Database.getInstance();
  if (!db.isConnected()) {
    await db.connect();
  }

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
  const skillLoader = new SkillLoader();
  toolRegistry.register(new MemorySearchTool());
  toolRegistry.register(new CreateSubAgentTool());
  toolRegistry.register(new CheckSubAgentTool());
  toolRegistry.register(new CommunicateSubAgentTool());
  toolRegistry.register(new CreateSkillTool(skillLoader));
  console.log(`[Tools] ${toolRegistry.count()} tool(s) registered.`);

  // --- Ensure skill-creator default skill exists ---
  const skillCreatorDir = path.join(process.cwd(), '.agents', 'skills', 'skill-creator');
  if (!fs.existsSync(path.join(skillCreatorDir, 'SKILL.md'))) {
    fs.mkdirSync(skillCreatorDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillCreatorDir, 'SKILL.md'),
      [
        '---',
        'name: skill-creator',
        'description: Creates new skills for TurionZ — handles SKILL.md, tools, templates, testing, and installation',
        'version: 1.0',
        'author: BollaNetwork',
        'tools: []',
        'languages:',
        '  - typescript',
        '  - python',
        '---',
        '',
        '# Skill Creator Instructions',
        '',
        'You are the Skill Creator. When the user or TurionZ needs a new skill:',
        '1. Ask what the skill should do (if not clear)',
        '2. Use the `create_skill` tool to create it',
        '3. Confirm the skill was installed and is ready to use',
        '4. Explain to the user what the new skill can do',
      ].join('\n'),
      'utf8'
    );
    console.log('[Skills] Created default skill-creator skill.');
  }

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

main().catch(async (error) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`[TurionZ] Startup error: ${msg}`);
  console.error('[TurionZ] Attempting auto-recovery...');

  // Try self-healer one more time
  try {
    const healer = new SelfHealer();
    await healer.healAll();
    console.log('[TurionZ] Auto-recovery complete. Restarting...');
    // Let systemd/pm2 restart us
    process.exit(1);
  } catch (healError) {
    console.error('[TurionZ] Auto-recovery failed. Run: npm run setup');
    process.exit(1);
  }
});
