// ============================================================
// TurionZ — Manage Skills Tool (Built-in)
// Created by BollaNetwork
//
// Thor uses this to diagnose, fix, and clean up skills.
// ============================================================

import { BaseTool } from '../BaseTool';
import { ToolResult } from '../../types';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const SKILLS_DIR = path.join(process.cwd(), '.agents', 'skills');

export class ManageSkillsTool extends BaseTool {
  readonly name = 'manage_skills';
  readonly description =
    'Manage installed skills: list, diagnose (health check), delete broken ones, or test a skill. Use this when a skill fails or you need to clean up.';
  readonly parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Action: "list" | "diagnose" | "delete" | "test"',
        enum: ['list', 'diagnose', 'delete', 'test'],
      },
      skillName: {
        type: 'string',
        description: 'Skill name (required for delete/test)',
      },
    },
    required: ['action'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const action = args.action as string;
    const skillName = args.skillName as string | undefined;

    switch (action) {
      case 'list':
        return this.listSkills();
      case 'diagnose':
        return this.diagnoseAll();
      case 'delete':
        if (!skillName) return this.error('skillName required for delete');
        return this.deleteSkill(skillName);
      case 'test':
        if (!skillName) return this.error('skillName required for test');
        return this.testSkill(skillName);
      default:
        return this.error(`Unknown action: ${action}. Use: list, diagnose, delete, test`);
    }
  }

  private listSkills(): ToolResult {
    if (!fs.existsSync(SKILLS_DIR)) {
      return this.success('No skills directory found. 0 skills installed.');
    }

    const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
    const skills: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillMd = path.join(SKILLS_DIR, entry.name, 'SKILL.md');
      const hasSkillMd = fs.existsSync(skillMd);
      const toolsDir = path.join(SKILLS_DIR, entry.name, 'tools');
      const hasTools = fs.existsSync(toolsDir);
      const toolCount = hasTools ? fs.readdirSync(toolsDir).length : 0;

      skills.push(`- ${entry.name}: SKILL.md=${hasSkillMd ? '✓' : '✗'} | Tools=${toolCount}`);
    }

    if (skills.length === 0) {
      return this.success('0 skills installed.');
    }

    return this.success(`${skills.length} skill(s) installed:\n${skills.join('\n')}`);
  }

  private diagnoseAll(): ToolResult {
    if (!fs.existsSync(SKILLS_DIR)) {
      return this.success('Skills directory does not exist. Nothing to diagnose.');
    }

    const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
    const results: string[] = [];
    let broken = 0;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const name = entry.name;
      const skillPath = path.join(SKILLS_DIR, name);
      const issues: string[] = [];

      // Check SKILL.md
      const skillMd = path.join(skillPath, 'SKILL.md');
      if (!fs.existsSync(skillMd)) {
        issues.push('Missing SKILL.md');
      } else {
        const content = fs.readFileSync(skillMd, 'utf-8');
        if (!content.includes('---')) issues.push('No YAML frontmatter in SKILL.md');
        if (content.length < 20) issues.push('SKILL.md too short (probably empty)');
      }

      // Check tools
      const toolsDir = path.join(skillPath, 'tools');
      if (fs.existsSync(toolsDir)) {
        const tools = fs.readdirSync(toolsDir);
        for (const tool of tools) {
          const toolPath = path.join(toolsDir, tool);
          const stat = fs.statSync(toolPath);

          if (stat.size === 0) {
            issues.push(`Empty tool file: ${tool}`);
          }

          // Check if TypeScript tools can at least be parsed
          if (tool.endsWith('.ts') || tool.endsWith('.js')) {
            try {
              const toolContent = fs.readFileSync(toolPath, 'utf-8');
              if (!toolContent.includes('function') && !toolContent.includes('export') && !toolContent.includes('const')) {
                issues.push(`Tool ${tool} has no functions/exports`);
              }
            } catch {
              issues.push(`Cannot read tool: ${tool}`);
            }
          }

          // Test Python tools
          if (tool.endsWith('.py')) {
            try {
              execSync(`python3 -c "import ast; ast.parse(open('${toolPath}').read())"`, {
                timeout: 5000,
                stdio: 'pipe',
              });
            } catch {
              issues.push(`Python syntax error in: ${tool}`);
            }
          }
        }
      }

      if (issues.length > 0) {
        broken++;
        results.push(`❌ ${name}: ${issues.join('; ')}`);
      } else {
        results.push(`✓ ${name}: healthy`);
      }
    }

    const summary = broken > 0
      ? `${broken} broken skill(s) found. Use manage_skills(action:"delete", skillName:"name") to remove them.`
      : 'All skills healthy.';

    return this.success(`Diagnosis:\n${results.join('\n')}\n\n${summary}`);
  }

  private deleteSkill(skillName: string): ToolResult {
    // Protect default skill
    if (skillName === 'skill-creator') {
      return this.error('Cannot delete skill-creator — it is a system skill.');
    }

    const skillPath = path.join(SKILLS_DIR, skillName);
    if (!fs.existsSync(skillPath)) {
      return this.error(`Skill "${skillName}" not found.`);
    }

    try {
      fs.rmSync(skillPath, { recursive: true, force: true });
      return this.success(`Skill "${skillName}" deleted. Hot-reload will remove it on next message.`);
    } catch (e) {
      return this.error(`Failed to delete skill: ${e}`);
    }
  }

  private testSkill(skillName: string): ToolResult {
    const skillPath = path.join(SKILLS_DIR, skillName);
    if (!fs.existsSync(skillPath)) {
      return this.error(`Skill "${skillName}" not found.`);
    }

    const results: string[] = [];

    // Test SKILL.md
    const skillMd = path.join(skillPath, 'SKILL.md');
    if (fs.existsSync(skillMd)) {
      const content = fs.readFileSync(skillMd, 'utf-8');
      const hasFrontmatter = content.match(/^---\s*\n[\s\S]*?\n---/);
      results.push(`SKILL.md: ${hasFrontmatter ? '✓ valid frontmatter' : '✗ no frontmatter'}`);
    } else {
      results.push('SKILL.md: ✗ missing');
    }

    // Test tools
    const toolsDir = path.join(skillPath, 'tools');
    if (fs.existsSync(toolsDir)) {
      const tools = fs.readdirSync(toolsDir);
      for (const tool of tools) {
        const toolPath = path.join(toolsDir, tool);

        if (tool.endsWith('.ts') || tool.endsWith('.js')) {
          try {
            execSync(`node -e "require('${toolPath.replace(/\\/g, '/')}')"`, {
              timeout: 5000,
              stdio: 'pipe',
            });
            results.push(`Tool ${tool}: ✓ loads OK`);
          } catch {
            results.push(`Tool ${tool}: ✗ fails to load`);
          }
        } else if (tool.endsWith('.py')) {
          try {
            execSync(`python3 -c "import ast; ast.parse(open('${toolPath}').read())"`, {
              timeout: 5000,
              stdio: 'pipe',
            });
            results.push(`Tool ${tool}: ✓ syntax OK`);
          } catch {
            results.push(`Tool ${tool}: ✗ syntax error`);
          }
        } else {
          results.push(`Tool ${tool}: ? (unknown type)`);
        }
      }
    }

    return this.success(`Test results for "${skillName}":\n${results.join('\n')}`);
  }
}
