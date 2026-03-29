// ============================================================
// TurionZ — Skill Creator (Automated Skill Generation)
// Created by BollaNetwork
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { SkillCreateRequest, SkillCreateResult, SkillMetadata } from '../types';
import { SkillLoader } from './SkillLoader';
import { SkillRouter } from './SkillRouter';

const MAX_FIX_ATTEMPTS = 3;

export class SkillCreator {
  private skillsDir: string;
  private loader: SkillLoader;

  constructor(loader: SkillLoader) {
    this.loader = loader;
    this.skillsDir = loader.getSkillsDir();
  }

  /**
   * Full lifecycle: understand -> plan -> generate -> write -> verify -> fix -> report.
   */
  async createSkill(request: SkillCreateRequest): Promise<SkillCreateResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    // 1. Validate request
    const nameValidation = this.validateSkillName(request.name);
    if (!nameValidation.valid) {
      return {
        success: false,
        skillName: request.name,
        path: '',
        errors: [nameValidation.reason!],
        durationMs: Date.now() - startTime,
      };
    }

    const skillDir = path.join(this.skillsDir, request.name);

    // Check if skill already exists
    if (fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
      return {
        success: false,
        skillName: request.name,
        path: skillDir,
        errors: [`Skill '${request.name}' already exists at ${skillDir}`],
        durationMs: Date.now() - startTime,
      };
    }

    // 2. Plan structure
    const tools = request.tools || [];
    const languages = request.languages || [];

    // 3. Generate SKILL.md content
    const skillMd = this.generateSkillMd(request);

    // 4. Write to filesystem
    try {
      // Create skill directory
      fs.mkdirSync(skillDir, { recursive: true });

      // Write SKILL.md
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd, 'utf8');

      // Create tools/ directory if tools are specified
      if (tools.length > 0) {
        const toolsDir = path.join(skillDir, 'tools');
        fs.mkdirSync(toolsDir, { recursive: true });

        for (const toolName of tools) {
          const toolContent = this.generateToolStub(toolName, request.name, languages);
          const ext = this.pickToolExtension(languages);
          fs.writeFileSync(path.join(toolsDir, `${toolName}${ext}`), toolContent, 'utf8');
        }
      }

      // Create templates/ directory if description mentions templates
      if (request.purpose.toLowerCase().includes('template')) {
        const templatesDir = path.join(skillDir, 'templates');
        fs.mkdirSync(templatesDir, { recursive: true });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        skillName: request.name,
        path: skillDir,
        errors: [`Failed to write skill files: ${errMsg}`],
        durationMs: Date.now() - startTime,
      };
    }

    // 5. Verify with retry
    let verified = false;
    for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
      const verificationErrors = this.verifySkill(skillDir, request.name);

      if (verificationErrors.length === 0) {
        verified = true;
        break;
      }

      errors.push(...verificationErrors.map(e => `[attempt ${attempt}] ${e}`));

      if (attempt < MAX_FIX_ATTEMPTS) {
        // Attempt to fix: regenerate SKILL.md if frontmatter is invalid
        const hasFrontmatterError = verificationErrors.some(e => e.includes('frontmatter'));
        if (hasFrontmatterError) {
          const fixedMd = this.generateSkillMd(request);
          fs.writeFileSync(path.join(skillDir, 'SKILL.md'), fixedMd, 'utf8');
        }
      }
    }

    // 6. Invalidate loader cache so hot-reload picks it up
    this.loader.invalidateCache();

    // 7. Verify loader can read it
    const skills = this.loader.loadAll();
    const found = skills.find(s => s.name === request.name);
    if (!found) {
      errors.push('SkillLoader could not read the new skill after creation.');
    }

    const duration = Date.now() - startTime;

    if (!verified && !found) {
      return {
        success: false,
        skillName: request.name,
        path: skillDir,
        errors,
        durationMs: duration,
      };
    }

    console.log(`[SkillCreator] Created skill '${request.name}' in ${duration}ms.`);

    return {
      success: true,
      skillName: request.name,
      path: skillDir,
      metadata: found || undefined,
      errors: errors.length > 0 ? errors : undefined,
      durationMs: duration,
    };
  }

  /**
   * Run verification suite on an existing skill.
   */
  testSkill(skillName: string): { passed: boolean; errors: string[] } {
    const skillDir = path.join(this.skillsDir, skillName);

    if (!fs.existsSync(skillDir)) {
      return { passed: false, errors: [`Skill directory not found: ${skillDir}`] };
    }

    const errors = this.verifySkill(skillDir, skillName);

    // Also check loader can read it
    this.loader.invalidateCache();
    const skills = this.loader.loadAll();
    const found = skills.find(s => s.name === skillName);
    if (!found) {
      errors.push('SkillLoader could not read this skill.');
    }

    return {
      passed: errors.length === 0,
      errors,
    };
  }

  /**
   * List all installed skills with their status.
   */
  listInstalledSkills(): { name: string; valid: boolean; metadata?: SkillMetadata }[] {
    this.loader.invalidateCache();
    const skills = this.loader.loadAll();

    // Also scan for directories without valid SKILL.md
    const result: { name: string; valid: boolean; metadata?: SkillMetadata }[] = [];

    if (fs.existsSync(this.skillsDir)) {
      const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const found = skills.find(s => s.name === entry.name);
        result.push({
          name: entry.name,
          valid: !!found,
          metadata: found,
        });
      }
    }

    return result;
  }

  // --- Private helpers ---

  private validateSkillName(name: string): { valid: boolean; reason?: string } {
    if (!name || name.trim().length === 0) {
      return { valid: false, reason: 'Skill name cannot be empty.' };
    }

    // Must be lowercase with hyphens only
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      return {
        valid: false,
        reason: 'Skill name must be lowercase, start with a letter, and use only letters, numbers, and hyphens.',
      };
    }

    if (name.length > 64) {
      return { valid: false, reason: 'Skill name must be 64 characters or fewer.' };
    }

    return { valid: true };
  }

  private generateSkillMd(request: SkillCreateRequest): string {
    const tools = request.tools || [];
    const languages = request.languages || [];

    const frontmatter: Record<string, unknown> = {
      name: request.name,
      description: request.description,
      version: '1.0',
      author: 'BollaNetwork',
      tools: tools,
      languages: languages.length > 0 ? languages : ['typescript'],
    };

    const yamlStr = yaml.dump(frontmatter, { lineWidth: -1 });

    return `---
${yamlStr.trimEnd()}
---

# ${this.titleCase(request.name)} Skill

${request.description}

## Purpose

${request.purpose}

## Instructions

When this skill is active, you should:
1. Understand the user's request related to ${request.name}
2. Use the available tools to accomplish the task
3. Report the results clearly

${tools.length > 0 ? `## Available Tools\n\n${tools.map(t => `- \`${t}\`: Tool for ${request.name}`).join('\n')}\n` : ''}
## Rules

- Always validate inputs before processing
- Report errors clearly to the user
- Follow the purpose described above
`;
  }

  private generateToolStub(toolName: string, skillName: string, languages: string[]): string {
    const lang = languages.length > 0 ? languages[0] : 'typescript';

    if (lang === 'python') {
      return `#!/usr/bin/env python3
"""
Tool: ${toolName}
Skill: ${skillName}
"""
import sys
import json

def main():
    input_data = json.loads(sys.stdin.read())

    # TODO: Implement tool logic
    result = {
        "success": True,
        "output": f"Tool ${toolName} executed successfully"
    }

    print(json.dumps(result))

if __name__ == "__main__":
    main()
`;
    }

    // Default: TypeScript
    return `// Tool: ${toolName}
// Skill: ${skillName}

import * as readline from 'readline';

async function main(): Promise<void> {
  const chunks: string[] = [];

  process.stdin.on('data', (chunk: Buffer) => {
    chunks.push(chunk.toString());
  });

  process.stdin.on('end', () => {
    const input = JSON.parse(chunks.join(''));

    // TODO: Implement tool logic
    const result = {
      success: true,
      output: \`Tool ${toolName} executed successfully\`,
    };

    process.stdout.write(JSON.stringify(result));
  });
}

main().catch((err) => {
  const result = { success: false, output: String(err) };
  process.stdout.write(JSON.stringify(result));
  process.exit(1);
});
`;
  }

  private pickToolExtension(languages: string[]): string {
    const lang = languages.length > 0 ? languages[0] : 'typescript';
    switch (lang) {
      case 'python':
        return '.py';
      case 'javascript':
        return '.js';
      case 'bash':
        return '.sh';
      default:
        return '.ts';
    }
  }

  private verifySkill(skillDir: string, skillName: string): string[] {
    const errors: string[] = [];

    const skillFile = path.join(skillDir, 'SKILL.md');

    // Check SKILL.md exists
    if (!fs.existsSync(skillFile)) {
      errors.push('SKILL.md not found in skill directory.');
      return errors;
    }

    // Check frontmatter is valid YAML
    const content = fs.readFileSync(skillFile, 'utf8');
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);

    if (!frontmatterMatch) {
      errors.push('SKILL.md has no valid YAML frontmatter (missing --- markers).');
      return errors;
    }

    try {
      const parsed = yaml.load(frontmatterMatch[1]) as Record<string, unknown>;

      if (!parsed || typeof parsed !== 'object') {
        errors.push('SKILL.md frontmatter is not a valid YAML object.');
        return errors;
      }

      if (!parsed.name) {
        errors.push('SKILL.md frontmatter missing required field: name');
      }

      if (!parsed.description) {
        errors.push('SKILL.md frontmatter missing required field: description');
      }

      if (parsed.name && parsed.name !== skillName) {
        errors.push(`SKILL.md frontmatter name '${parsed.name}' does not match directory name '${skillName}'.`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push(`SKILL.md frontmatter YAML parse error: ${errMsg}`);
    }

    // Check tool files have valid syntax (basic check — file is not empty)
    const toolsDir = path.join(skillDir, 'tools');
    if (fs.existsSync(toolsDir)) {
      const toolFiles = fs.readdirSync(toolsDir);
      for (const file of toolFiles) {
        const filePath = path.join(toolsDir, file);
        const stat = fs.statSync(filePath);
        if (stat.size === 0) {
          errors.push(`Tool file '${file}' is empty.`);
        }
      }
    }

    return errors;
  }

  private titleCase(name: string): string {
    return name
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
