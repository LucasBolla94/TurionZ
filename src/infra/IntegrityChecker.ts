// ============================================================
// TurionZ — Integrity Checker
// Created by BollaNetwork
// ============================================================

import * as fs from 'fs';
import * as path from 'path';

interface IntegrityReport {
  healthy: boolean;
  issues: string[];
}

export class IntegrityChecker {
  private projectRoot: string;

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot || process.cwd();
  }

  check(): IntegrityReport {
    const issues: string[] = [];

    // Check critical directories
    const requiredDirs = [
      '.agents',
      'data',
      'tmp',
    ];

    for (const dir of requiredDirs) {
      const dirPath = path.join(this.projectRoot, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        issues.push(`Created missing directory: ${dir}`);
      }
    }

    // Check personality files
    const personalityFiles = [
      { file: '.agents/SOUL.md', critical: true },
      { file: '.agents/IDENTITY.md', critical: false },
      { file: '.agents/MEMORY.md', critical: false },
    ];

    for (const pf of personalityFiles) {
      const filePath = path.join(this.projectRoot, pf.file);
      if (!fs.existsSync(filePath)) {
        const severity = pf.critical ? 'CRITICAL' : 'WARNING';
        issues.push(`${severity}: ${pf.file} not found`);
      } else {
        const stat = fs.statSync(filePath);
        if (stat.size === 0) {
          issues.push(`WARNING: ${pf.file} is empty (possibly corrupted)`);
        }
      }
    }

    // Check skills directory
    const skillsDir = path.join(this.projectRoot, '.agents', 'skills');
    if (fs.existsSync(skillsDir)) {
      const skillFolders = fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter(d => d.isDirectory());

      for (const folder of skillFolders) {
        const skillMd = path.join(skillsDir, folder.name, 'SKILL.md');
        if (!fs.existsSync(skillMd)) {
          issues.push(`WARNING: Skill '${folder.name}' has no SKILL.md (ghost folder)`);
        }
      }
    }

    // Check vault
    const vaultKey = path.join(this.projectRoot, 'data', 'vault', 'vault.key');
    const vaultEnc = path.join(this.projectRoot, 'data', 'vault', 'vault.enc');
    if (fs.existsSync(vaultKey) && !fs.existsSync(vaultEnc)) {
      issues.push('WARNING: vault.key exists but vault.enc is missing');
    }

    const healthy = !issues.some(i => i.startsWith('CRITICAL'));

    if (issues.length > 0) {
      console.log(`[IntegrityChecker] Found ${issues.length} issue(s):`);
      for (const issue of issues) {
        console.log(`  ${issue}`);
      }
    } else {
      console.log('[IntegrityChecker] All checks passed.');
    }

    return { healthy, issues };
  }
}
