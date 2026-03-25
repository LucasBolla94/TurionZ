// ============================================================
// TurionZ — Skill Tool Bridge (Load Tools from Skill Directory)
// Created by BollaNetwork
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { BaseTool } from '../tools/BaseTool';
import { ToolRegistry } from '../tools/ToolRegistry';
import { SkillContext } from './SkillExecutor';
import { ExternalTool } from './ExternalTool';

const EXTENSION_COMMAND_MAP: Record<string, string> = {
  '.ts': 'tsx',
  '.js': 'node',
  '.py': process.platform === 'win32' ? 'python' : 'python3',
  '.sh': 'bash',
};

export class SkillToolBridge {
  private pythonCmd: string;

  constructor() {
    this.pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  }

  /**
   * Load all tool files from a skill's tools/ directory.
   * Returns an array of ExternalTool instances (BaseTool subclass).
   */
  loadSkillTools(context: SkillContext): BaseTool[] {
    if (!context.toolsDir) {
      return [];
    }

    let entries: string[];
    try {
      entries = fs.readdirSync(context.toolsDir);
    } catch {
      console.warn(
        `[SkillToolBridge] Could not read tools directory: ${context.toolsDir}`
      );
      return [];
    }

    const tools: BaseTool[] = [];

    for (const file of entries) {
      const ext = path.extname(file).toLowerCase();
      let command = EXTENSION_COMMAND_MAP[ext];

      // Use instance pythonCmd for .py files (in case of runtime override)
      if (ext === '.py') {
        command = this.pythonCmd;
      }

      if (!command) {
        // Unsupported extension — skip
        continue;
      }

      const toolName = path.basename(file, ext);
      const fullPath = path.join(context.toolsDir, file);

      // Check if tool name exists in skill metadata tools array
      const isKnownTool = context.metadata.tools.includes(toolName);

      // Prefixed name prevents collisions between skills
      const prefixedName = `${context.metadata.name}.${toolName}`;

      const description = isKnownTool
        ? `Tool ${toolName} from skill ${context.metadata.name}`
        : `Tool ${toolName} from skill ${context.metadata.name}`;

      // Generic fallback parameters when no manifest is available
      const parameters: Record<string, unknown> = {
        type: 'object',
        properties: {
          input: {
            type: 'string',
            description: 'Input for the tool',
          },
        },
      };

      const tool = new ExternalTool(
        prefixedName,
        description,
        parameters,
        command,
        fullPath
      );

      tools.push(tool);
      console.log(`[SkillToolBridge] Loaded tool: ${prefixedName} (${ext})`);
    }

    return tools;
  }

  /**
   * Unload all tools belonging to a specific skill from the registry.
   * Matches tools by skill name prefix (e.g., "prd-manager.*").
   */
  unloadSkillTools(skillName: string, registry: ToolRegistry): void {
    const prefix = `${skillName}.`;
    const allNames = registry.listNames();
    const toRemove = allNames.filter((name) => name.startsWith(prefix));

    for (const name of toRemove) {
      registry.unregister(name);
    }

    if (toRemove.length > 0) {
      console.log(
        `[SkillToolBridge] Unloaded ${toRemove.length} tools for skill '${skillName}'.`
      );
    }
  }
}
