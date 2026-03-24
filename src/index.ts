// ============================================================
// TurionZ (Thor) — AI Personal Agent by Bolla Network
// Entry Point
// ============================================================

import { Database } from './infra/database';
import { Migrations } from './infra/migrations';
import { VaultManager } from './security/VaultManager';
import { PersonalityEngine } from './core/PersonalityEngine';
import { MemoryManager } from './memory/MemoryManager';

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('  TurionZ (Thor) — AI Personal Agent');
  console.log('  Created by BollaNetwork');
  console.log('  Version: 0.1.0');
  console.log('='.repeat(60));
  console.log('');

  // Phase 1: Database
  const db = Database.getInstance();
  await db.connect();

  if (db.isConnected()) {
    const migrations = new Migrations();
    await migrations.run();
  }

  // Phase 2: Vault
  const vault = VaultManager.getInstance();
  await vault.initialize();

  // Phase 4: Personality
  const personality = new PersonalityEngine();
  personality.load();

  // Phase 5: Memory
  const memory = MemoryManager.getInstance();
  await memory.initialize();

  console.log('');
  console.log('[TurionZ] Thor is ready.');
}

main().catch((error) => {
  console.error('[TurionZ] Fatal error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
