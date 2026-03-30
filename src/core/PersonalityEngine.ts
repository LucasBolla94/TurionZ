// ============================================================
// TurionZ — Personality Engine (SOUL.md + IDENTITY.md + MEMORY.md)
// Created by BollaNetwork
// ============================================================

import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_PERSONALITY = `You are TurionZ (Thor), an AI personal agent created by Bolla Network.
You are professional, friendly, intelligent, and direct.
You communicate like a director of operations reporting to the CEO.
Keep responses concise. Use simple language. Never invent information.`;

const TOOL_AWARENESS = `
# Your Available Tools

You have tools that let you ACT in the real world. ALWAYS use the right tool for the job:

## Information & Web
- **web_search** — Search the internet via DuckDuckGo. Use for: prices, news, weather, any real-time info.
- **web_fetch** — Fetch content from a URL. Use to read websites, APIs, documentation.
- **memory_search** — Search YOUR past conversations. Use ONLY for remembering what was discussed before.

## Files & Code
- **read_file** — Read file contents.
- **write_file** — Create or overwrite a file.
- **edit_file** — Replace specific text in a file (surgical edit).
- **delete_file** — Delete a file.
- **list_directory** — List files in a directory.
- **glob_search** — Find files by pattern (e.g., "**/*.ts").
- **grep_search** — Search text inside files by regex.

## System
- **execute_command** — Run shell commands (ls, npm, pip, curl, etc).
- **git** — Git operations (status, commit, push, pull, diff, log, etc).

## Agent Management
- **create_sub_agent** — Delegate a complex task to a specialist sub-agent.
- **check_sub_agent** — Check status of running sub-agents.
- **communicate_sub_agent** — Send data between sub-agents.

## Skills
- **create_skill** — Create a new skill (SKILL.md + tools) and install it.

## IMPORTANT RULES:
1. When user asks about real-time information (prices, news, weather, current events) → use **web_search** FIRST, not memory_search.
2. When user asks to do something on the system → use **execute_command** or file tools.
3. When user asks about past conversations → use **memory_search**.
4. NEVER say "I can't do that" if you have a tool for it. TRY the tool first.
5. If a tool fails, explain the error and suggest alternatives.
6. If you don't have a tool for something, suggest creating a skill with **create_skill**.
7. Always respond in the same language the user writes (PT-BR if they write in Portuguese).
`;

const MAX_PERSONALITY_TOKENS = 10000;
const CHARS_PER_TOKEN_ESTIMATE = 4;
const MAX_PERSONALITY_CHARS = MAX_PERSONALITY_TOKENS * CHARS_PER_TOKEN_ESTIMATE;

export class PersonalityEngine {
  private agentsDir: string;
  private soulContent: string = '';
  private identityContent: string = '';
  private memoryContent: string = '';

  constructor(agentsDir?: string) {
    this.agentsDir = agentsDir || path.join(process.cwd(), '.agents');
  }

  load(): void {
    this.soulContent = this.readFile('SOUL.md');
    this.identityContent = this.readFile('IDENTITY.md');
    this.memoryContent = this.readFile('MEMORY.md');

    if (this.soulContent) {
      console.log('[Personality] SOUL.md loaded.');
    } else {
      console.warn('[Personality] SOUL.md not found. Using default personality.');
    }

    if (this.identityContent) {
      console.log('[Personality] IDENTITY.md loaded.');
    }

    if (this.memoryContent) {
      console.log('[Personality] MEMORY.md loaded.');
    }
  }

  getSystemPromptPrefix(): string {
    const parts: string[] = [];

    // Identity first (short)
    if (this.identityContent) {
      parts.push('# Identity\n' + this.identityContent);
    }

    // Soul (main personality)
    if (this.soulContent) {
      parts.push(this.soulContent);
    } else {
      parts.push(DEFAULT_PERSONALITY);
    }

    // Tool awareness (so Thor knows what he can do)
    parts.push(TOOL_AWARENESS);

    // Memory (lessons learned)
    if (this.memoryContent) {
      parts.push('# Learned Context\n' + this.memoryContent);
    }

    let combined = parts.join('\n\n---\n\n');

    // Truncate if too large
    if (combined.length > MAX_PERSONALITY_CHARS) {
      console.warn(
        `[Personality] Content too large (${combined.length} chars). Truncating to ${MAX_PERSONALITY_CHARS}.`
      );
      combined = combined.substring(0, MAX_PERSONALITY_CHARS) + '\n\n[... truncated for context limit]';
    }

    return combined;
  }

  getSoulContent(): string {
    return this.soulContent;
  }

  getIdentityContent(): string {
    return this.identityContent;
  }

  getMemoryContent(): string {
    return this.memoryContent;
  }

  private readFile(filename: string): string {
    const filePath = path.join(this.agentsDir, filename);
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf8').trim();
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[Personality] Failed to read ${filename}: ${errMsg}`);
    }
    return '';
  }
}
