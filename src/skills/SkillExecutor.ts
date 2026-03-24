// ============================================================
// TurionZ — Skill Executor (Load & Inject into AgentLoop)
// Created by BollaNetwork
// ============================================================

import { SkillLoader } from './SkillLoader';
import { SkillMetadata } from '../types';

export interface SkillContext {
  metadata: SkillMetadata;
  content: string;
  toolsDir: string | null;
}

export class SkillExecutor {
  private loader: SkillLoader;

  constructor(loader: SkillLoader) {
    this.loader = loader;
  }

  /**
   * Load full skill context for injection into AgentLoop.
   * Returns null if skill not found.
   */
  loadSkillContext(skillName: string, skills: SkillMetadata[]): SkillContext | null {
    const metadata = skills.find(s => s.name === skillName);
    if (!metadata) {
      console.warn(`[SkillExecutor] Skill '${skillName}' not found in loaded skills.`);
      return null;
    }

    const content = this.loader.loadSkillContent(skillName);
    if (!content) {
      console.warn(`[SkillExecutor] Could not load content for skill '${skillName}'.`);
      return null;
    }

    const toolsDir = this.loader.getSkillToolsDir(skillName);

    console.log(
      `[SkillExecutor] Loaded skill '${skillName}' (${content.length} chars` +
      `${toolsDir ? ', has tools' : ''}).`
    );

    return {
      metadata,
      content,
      toolsDir,
    };
  }

  /**
   * Build the skill injection string for the system prompt.
   * Strips YAML frontmatter and returns clean instruction content.
   */
  buildSkillPrompt(context: SkillContext): string {
    // Remove YAML frontmatter
    let content = context.content;
    const frontmatterEnd = content.indexOf('---', content.indexOf('---') + 3);
    if (frontmatterEnd !== -1) {
      content = content.substring(frontmatterEnd + 3).trim();
    }

    return `\n\n# Active Skill: ${context.metadata.name}\n\n${content}`;
  }
}
