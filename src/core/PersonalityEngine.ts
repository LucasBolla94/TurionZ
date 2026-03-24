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
