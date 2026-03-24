// ============================================================
// TurionZ (Thor) — AI Personal Agent by Bolla Network
// Entry Point
// ============================================================

import { Database } from './infra/database';
import { Migrations } from './infra/migrations';

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

  console.log('[TurionZ] Thor is ready.');
}

main().catch((error) => {
  console.error('[TurionZ] Fatal error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
