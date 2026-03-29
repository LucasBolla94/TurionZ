// ============================================================
// TurionZ — Create Skill Tool (Built-in)
// Created by BollaNetwork
// ============================================================

import { BaseTool } from '../BaseTool';
import { ToolResult, SkillCreateRequest } from '../../types';
import { SkillCreator } from '../../skills/SkillCreator';
import { SkillLoader } from '../../skills/SkillLoader';

export class CreateSkillTool extends BaseTool {
  readonly name = 'create_skill';
  readonly description =
    'Create a new skill for TurionZ. Generates SKILL.md, optional tools, and installs it via hot-reload. The skill becomes available immediately after creation.';
  readonly parameters = {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Skill name (lowercase with hyphens, e.g. "code-analyzer")',
      },
      description: {
        type: 'string',
        description: 'Short description of what the skill does',
      },
      purpose: {
        type: 'string',
        description: 'Detailed explanation of the skill purpose and behavior',
      },
      tools: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional tool names to generate for this skill',
      },
      languages: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional languages for tools (typescript, python, javascript, bash). Default: typescript',
      },
    },
    required: ['name', 'description', 'purpose'],
  };

  private creator: SkillCreator;

  constructor(loader: SkillLoader) {
    super();
    this.creator = new SkillCreator(loader);
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const name = args.name as string;
    const description = args.description as string;
    const purpose = args.purpose as string;
    const tools = (args.tools as string[]) || [];
    const languages = (args.languages as string[]) || [];

    if (!name || !name.trim()) {
      return this.error('Skill name is required.');
    }

    if (!description || !description.trim()) {
      return this.error('Skill description is required.');
    }

    if (!purpose || !purpose.trim()) {
      return this.error('Skill purpose is required.');
    }

    const request: SkillCreateRequest = {
      name: name.trim(),
      description: description.trim(),
      purpose: purpose.trim(),
      tools: tools.length > 0 ? tools : undefined,
      languages: languages.length > 0 ? languages : undefined,
    };

    try {
      const result = await this.creator.createSkill(request);

      if (result.success) {
        return this.success(
          JSON.stringify({
            status: 'created',
            skillName: result.skillName,
            path: result.path,
            metadata: result.metadata
              ? {
                  name: result.metadata.name,
                  description: result.metadata.description,
                  version: result.metadata.version,
                  tools: result.metadata.tools,
                  languages: result.metadata.languages,
                }
              : null,
            durationMs: result.durationMs,
          })
        );
      } else {
        return this.error(
          `Skill creation failed: ${(result.errors || []).join('; ')}`
        );
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return this.error(`Unexpected error creating skill: ${errMsg}`);
    }
  }
}
