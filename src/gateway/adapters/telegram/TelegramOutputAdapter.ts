// ============================================================
// TurionZ — Telegram Output Adapter
// Created by BollaNetwork
// ============================================================

import { Bot, Context, InputFile } from 'grammy';
import * as fs from 'fs';
import * as path from 'path';
import { AgentLoopOutput } from '../../../types';

const TELEGRAM_MAX_LENGTH = 4096;
const CHUNK_SIZE = 4000; // Safe margin
const TMP_DIR = path.join(process.cwd(), 'tmp');

export class TelegramOutputAdapter {
  private bot: Bot;

  constructor(bot: Bot) {
    this.bot = bot;
  }

  async send(ctx: Context, result: AgentLoopOutput): Promise<void> {
    // Error status
    if (result.status === 'error') {
      await this.sendError(ctx, result.response);
      return;
    }

    // Aborted
    if (result.status === 'aborted') {
      await ctx.reply(result.response || 'Processamento cancelado.');
      return;
    }

    // Max iterations
    if (result.status === 'max_iterations') {
      await ctx.reply(`⚠️ ${result.response}`);
      return;
    }

    let text = result.response;

    // Clean up LLM artifacts that shouldn't be shown to users
    text = this.cleanResponse(text);

    if (!text || text.trim().length === 0) {
      await ctx.reply('(Sem resposta)');
      return;
    }

    // Check if response should be a file
    if (this.shouldSendAsFile(text)) {
      await this.sendAsFile(ctx, text);
      return;
    }

    // Text response — chunk if needed
    if (text.length <= TELEGRAM_MAX_LENGTH) {
      await ctx.reply(text);
    } else {
      await this.sendChunked(ctx, text);
    }
  }

  async sendError(ctx: Context, message: string): Promise<void> {
    const safe = message.replace(/sk-[a-zA-Z0-9]+/g, '[REDACTED]');
    await ctx.reply(`⚠️ ${safe}`);
  }

  async sendProgress(ctx: Context, message: string): Promise<void> {
    await ctx.reply(`🔄 ${message}`);
  }

  async sendProgressByChatId(chatId: string | number, message: string): Promise<void> {
    try {
      await this.bot.api.sendMessage(chatId, `🔄 ${message}`);
    } catch (error) {
      // Non-fatal — user might have blocked bot
    }
  }

  private async sendChunked(ctx: Context, text: string): Promise<void> {
    const chunks = this.splitIntoChunks(text, CHUNK_SIZE);

    console.log(`[TelegramOutput] Sending ${chunks.length} chunks`);

    // Send sequentially (for...of) to maintain order
    for (const chunk of chunks) {
      try {
        await ctx.reply(chunk);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);

        // Handle rate limiting (429)
        if (errMsg.includes('429') || errMsg.includes('Too Many Requests')) {
          const retryMatch = errMsg.match(/retry after (\d+)/i);
          const retryAfter = retryMatch ? parseInt(retryMatch[1], 10) * 1000 : 5000;
          console.log(`[TelegramOutput] Rate limited. Waiting ${retryAfter}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryAfter));
          await ctx.reply(chunk); // Retry once
        } else if (errMsg.includes('Forbidden')) {
          console.log('[TelegramOutput] User blocked bot. Aborting send.');
          return;
        } else {
          throw error;
        }
      }
    }
  }

  private async sendAsFile(ctx: Context, content: string): Promise<void> {
    const fileName = `turionz_output_${Date.now()}.md`;
    const tmpPath = path.join(TMP_DIR, fileName);

    try {
      if (!fs.existsSync(TMP_DIR)) {
        fs.mkdirSync(TMP_DIR, { recursive: true });
      }

      fs.writeFileSync(tmpPath, content, 'utf8');
      await ctx.replyWithDocument(new InputFile(tmpPath, fileName));
    } catch (error) {
      // Fallback to chunked text
      console.warn('[TelegramOutput] File send failed, falling back to chunks.');
      await this.sendChunked(ctx, content);
    } finally {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    }
  }

  private shouldSendAsFile(text: string): boolean {
    // If text contains markdown file markers or is very long
    if (text.includes('```') && text.length > 8000) return true;
    if (text.length > 20000) return true;
    return false;
  }

  private cleanResponse(text: string): string {
    if (!text) return '';

    let cleaned = text;

    // Remove tool call artifacts that LLMs sometimes include in their response
    // Pattern: (Função usada: tool_name)\n\njson\n{...}
    cleaned = cleaned.replace(/\(Função usada:.*?\)\s*\n*json\s*\n*\{[\s\S]*?\}/gi, '');

    // Pattern: (Function used: tool_name)
    cleaned = cleaned.replace(/\(Function used:.*?\)\s*\n*/gi, '');
    cleaned = cleaned.replace(/\(Função usada:.*?\)\s*\n*/gi, '');

    // Remove raw JSON tool calls that leaked into response
    cleaned = cleaned.replace(/```json\s*\n*\{"(query|command|path|action)"[\s\S]*?\}\s*\n*```/gi, '');
    cleaned = cleaned.replace(/\n*json\n\{[\s\S]*?\}\n*/gi, '');

    // Remove "searching/buscando" filler that came before tool result
    cleaned = cleaned.replace(/.*está buscando.*\n*/gi, '');
    cleaned = cleaned.replace(/.*um segundo.*\n*/gi, '');

    // Remove excessive whitespace
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

    return cleaned;
  }

  private splitIntoChunks(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Find a good split point (newline or space)
      let splitAt = remaining.lastIndexOf('\n', maxLength);
      if (splitAt < maxLength * 0.5) {
        splitAt = remaining.lastIndexOf(' ', maxLength);
      }
      if (splitAt < maxLength * 0.5) {
        splitAt = maxLength; // Hard split as last resort
      }

      chunks.push(remaining.substring(0, splitAt));
      remaining = remaining.substring(splitAt).trimStart();
    }

    return chunks;
  }
}
