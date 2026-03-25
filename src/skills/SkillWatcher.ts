// ============================================================
// TurionZ — Skill Watcher (Hot-Reload via Filesystem Watching)
// Created by BollaNetwork
// ============================================================

import { watch, FSWatcher } from 'chokidar';

export class SkillWatcher {
  private watcher: FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private debounceMs: number;

  constructor(debounceMs: number = 250) {
    this.debounceMs = debounceMs;
  }

  /**
   * Start watching a skills directory for changes.
   * Calls onReload (debounced) when any file changes within depth 2.
   */
  start(skillsDir: string, onReload: () => void): void {
    if (this.watcher) {
      this.stop();
    }

    this.watcher = watch(skillsDir, {
      depth: 2,
      ignoreInitial: true,
      persistent: true,
    });

    this.watcher.on('all', () => {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = setTimeout(() => {
        onReload();
      }, this.debounceMs);
    });

    console.log(`[SkillWatcher] Watching ${skillsDir} for changes.`);
  }

  /**
   * Stop watching and clean up timers.
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    console.log('[SkillWatcher] Stopped watching.');
  }
}
