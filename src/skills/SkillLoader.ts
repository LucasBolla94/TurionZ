// ============================================================
// TurionZ — Skill Loader (Hot-Reload from Filesystem)
// Created by BollaNetwork
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { SkillMetadata } from '../types';

const SKILL_FILE = 'SKILL.md';

export class SkillLoader {
  private skillsDir: string;
  private cache: SkillMetadata[] | null = null;

  constructor(skillsDir?: string) {
    this.skillsDir = skillsDir || path.join(process.cwd(), '.agents', 'skills');
  }

  /**
   * Load all skills from .agents/skills/ directory.
   * Returns cached result if available; call invalidateCache() to force reload.
   */
  loadAll(): SkillMetadata[] {
    if (this.cache !== null) {
      return this.cache;
    }
    this.cache = this.scanSkills();
    return this.cache;
  }

  /**
   * Invalidate the cached skill list. Next loadAll() call will re-scan the filesystem.
   */
  invalidateCache(): void {
    this.cache = null;
    console.log('[SkillLoader] Cache invalidated — will reload on next access.');
  }

  /**
   * Get the skills directory path (used by SkillWatcher).
   */
  getSkillsDir(): string {
    return this.skillsDir;
  }

  /**
   * Scan the filesystem for all skills. Internal method — use loadAll() instead.
   */
  private scanSkills(): SkillMetadata[] {
    if (!fs.existsSync(this.skillsDir)) {
      console.warn(`[SkillLoader] Skills directory not found: ${this.skillsDir}`);
      return [];
    }

    const skills: SkillMetadata[] = [];
    const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillPath = path.join(this.skillsDir, entry.name);
      const skillFile = path.join(skillPath, SKILL_FILE);

      if (!fs.existsSync(skillFile)) {
        // Ghost folder — no SKILL.md, skip silently
        continue;
      }

      try {
        const metadata = this.parseSkillFile(skillFile, skillPath);
        if (metadata) {
          skills.push(metadata);
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.warn(`[SkillLoader] Failed to load skill '${entry.name}': ${errMsg}`);
        // Continue loading other skills
      }
    }

    console.log(`[SkillLoader] Loaded ${skills.length} skills.`);
    return skills;
  }

  /**
   * Load full content of a specific skill's SKILL.md
   */
  loadSkillContent(skillName: string): string | null {
    const skillFile = path.join(this.skillsDir, skillName, SKILL_FILE);

    if (!fs.existsSync(skillFile)) {
      return null;
    }

    return fs.readFileSync(skillFile, 'utf8');
  }

  /**
   * Check if a skill has its own tools directory
   */
  getSkillToolsDir(skillName: string): string | null {
    const toolsDir = path.join(this.skillsDir, skillName, 'tools');

    if (fs.existsSync(toolsDir) && fs.statSync(toolsDir).isDirectory()) {
      return toolsDir;
    }

    return null;
  }

  private parseSkillFile(filePath: string, skillPath: string): SkillMetadata | null {
    const content = fs.readFileSync(filePath, 'utf8');

    // Extract YAML frontmatter between --- markers
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      console.warn(`[SkillLoader] No frontmatter found in ${filePath}`);
      return null;
    }

    const frontmatter = yaml.load(frontmatterMatch[1]) as Record<string, unknown>;

    if (!frontmatter || !frontmatter.name || !frontmatter.description) {
      console.warn(`[SkillLoader] Missing name/description in ${filePath}`);
      return null;
    }

    return {
      name: String(frontmatter.name),
      description: String(frontmatter.description),
      version: String(frontmatter.version || '1.0'),
      author: String(frontmatter.author || 'unknown'),
      tools: Array.isArray(frontmatter.tools) ? frontmatter.tools.map(String) : [],
      languages: Array.isArray(frontmatter.languages) ? frontmatter.languages.map(String) : [],
      path: skillPath,
    };
  }
}
