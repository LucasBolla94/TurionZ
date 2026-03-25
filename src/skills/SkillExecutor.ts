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
  /**
   * Load skill contexts for a sub-agent. Only returns skills that are
   * explicitly designated by TurionZ (from AgentConfig.skills).
   * Skills not in the allowedSkillNames list are blocked.
   */
  loadForSubAgent(allowedSkillNames: string[], allSkills: SkillMetadata[]): SkillContext[] {
    const contexts: SkillContext[] = [];

    for (const skillName of allowedSkillNames) {
      const context = this.loadSkillContext(skillName, allSkills);
      if (context) {
        contexts.push(context);
      } else {
        console.warn(`[SkillExecutor] Sub-agent requested skill '${skillName}' but it was not found or not loadable.`);
      }
    }

    console.log(`[SkillExecutor] Loaded ${contexts.length}/${allowedSkillNames.length} skills for sub-agent.`);
    return contexts;
  }

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
