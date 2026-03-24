// ============================================================
// TurionZ — Skill Router (LLM-based skill selection)
// Created by BollaNetwork
// ============================================================

import { ILlmProvider } from '../providers/ILlmProvider';
import { SkillMetadata } from '../types';

export interface SkillRouterResult {
  skillName: string | null;
}

export class SkillRouter {
  private provider: ILlmProvider;

  constructor(provider: ILlmProvider) {
    this.provider = provider;
  }

  /**
   * Determine which skill (if any) should handle the user's message.
   * Makes a lightweight LLM call with only skill summaries.
   * Returns null if no skill matches (free conversation).
   */
  async route(userMessage: string, skills: SkillMetadata[]): Promise<string | null> {
    if (skills.length === 0) {
      return null;
    }

    const skillList = skills
      .map(s => `- "${s.name}": ${s.description}`)
      .join('\n');

    const systemPrompt = `You are a skill router. Given a user message and a list of available skills, determine which skill (if any) should handle the request.

Available skills:
${skillList}

Respond ONLY with valid JSON in this exact format:
{"skillName": "skill-name-here"} or {"skillName": null}

Rules:
- Return the skill name if the user's request clearly matches a skill's purpose.
- Return null if no skill matches or if it's just casual conversation.
- Never explain your choice. Only return JSON.`;

    try {
      const response = await this.provider.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ]);

      if (!response.content) {
        return null;
      }

      // Parse JSON response
      const cleaned = response.content.trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]) as SkillRouterResult;
      const skillName = parsed.skillName;

      if (skillName && skills.some(s => s.name === skillName)) {
        console.log(`[SkillRouter] Selected skill: ${skillName}`);
        return skillName;
      }

      return null;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[SkillRouter] Routing failed: ${errMsg}. Falling back to no skill.`);
      return null;
    }
  }
}
