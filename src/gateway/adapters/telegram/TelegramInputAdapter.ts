// ============================================================
// TurionZ — Telegram Input Adapter
// Created by BollaNetwork
// ============================================================

import { Bot, Context } from 'grammy';
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string }>;
import { InternalMessage, MessageFlags } from '../../../types';
import { AuthenticationGateway, AuthResult } from '../../../security/AuthenticationGateway';
import { MessageRouter } from '../../MessageRouter';
import { TelegramOutputAdapter } from './TelegramOutputAdapter';

const ABORT_REGEX = /^(para|cancela|stop|esquece|pare|cancel)$/i;
const TMP_DIR = path.join(process.cwd(), 'tmp');

export class TelegramInputAdapter {
  private bot: Bot;
  private auth: AuthenticationGateway;
  private router: MessageRouter;
  private output: TelegramOutputAdapter;
  private activeLoops: Map<string, { abort: () => void }> = new Map();

  constructor(botToken: string) {
    this.bot = new Bot(botToken);
    this.auth = AuthenticationGateway.getInstance();
    this.router = MessageRouter.getInstance();
    this.output = new TelegramOutputAdapter(this.bot);

    // Ensure tmp dir exists
    if (!fs.existsSync(TMP_DIR)) {
      fs.mkdirSync(TMP_DIR, { recursive: true });
    }
  }

  async start(): Promise<void> {
    this.setupHandlers();

    console.log('[Telegram] Starting bot (long polling)...');
    this.bot.start({
      onStart: () => console.log('[Telegram] Bot is running.'),
    });
  }

  async stop(): Promise<void> {
    await this.bot.stop();
    console.log('[Telegram] Bot stopped.');
  }

  getBot(): Bot {
    return this.bot;
  }

  getOutputAdapter(): TelegramOutputAdapter {
    return this.output;
  }

  private setupHandlers(): void {
    // Text messages
    this.bot.on('message:text', async (ctx) => {
      await this.handleMessage(ctx, 'text', ctx.message.text);
    });

    // Documents (PDF, MD)
    this.bot.on('message:document', async (ctx) => {
      await this.handleDocument(ctx);
    });

    // Voice messages (placeholder — Whisper integration later)
    this.bot.on('message:voice', async (ctx) => {
      await ctx.reply('Áudio recebido, mas transcrição ainda não está configurada. Envie em texto por enquanto.');
    });

    // Audio files (placeholder)
    this.bot.on('message:audio', async (ctx) => {
      await ctx.reply('Áudio recebido, mas transcrição ainda não está configurada. Envie em texto por enquanto.');
    });
  }

  private async handleMessage(ctx: Context, type: 'text' | 'document', content: string): Promise<void> {
    const userId = String(ctx.from?.id || '');
    const username = ctx.from?.username;
    const chatId = String(ctx.chat?.id || '');

    if (!userId) return;

    // --- Authentication ---
    const authResult = await this.auth.authenticate('telegram', userId, username);

    if (authResult.result === 'denied_silent') {
      return; // Complete silence
    }

    if (authResult.result === 'pairing_initiated') {
      await ctx.reply(
        `Solicitação de acesso registrada.\nSeu código: ${authResult.pairingCode}\nAguarde aprovação do administrador.`
      );
      return;
    }

    // --- Check for abort ---
    if (ABORT_REGEX.test(content.trim())) {
      const activeLoop = this.activeLoops.get(userId);
      if (activeLoop) {
        activeLoop.abort();
        this.activeLoops.delete(userId);
        await ctx.reply('Ok, parei o processamento!');
        return;
      }
    }

    // --- Process message ---
    try {
      await ctx.api.sendChatAction(ctx.chat!.id, 'typing');

      const message: InternalMessage = {
        id: String(ctx.message?.message_id || Date.now()),
        userId,
        platform: 'telegram',
        conversationId: chatId,
        type,
        content,
        attachments: [],
        flags: {
          requires_audio_reply: false,
          source_type: type === 'document' ? 'document' : 'text',
        },
        timestamp: new Date(),
      };

      // Store abort callback — will be connected to AgentLoop via Controller
      this.activeLoops.set(userId, {
        abort: () => {
          const controller = require('../../core/AgentController').AgentController;
          controller.getInstance().abortUserLoop(userId);
        },
      });

      // Route message to core
      const result = await this.router.routeMessage(message);

      this.activeLoops.delete(userId);

      // Send response via output adapter
      await this.output.send(ctx, result);
    } catch (error) {
      this.activeLoops.delete(userId);
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Telegram] Error processing message: ${errMsg}`);
      await this.output.sendError(ctx, 'Ocorreu um erro ao processar sua mensagem.');
    }
  }

  private async handleDocument(ctx: Context): Promise<void> {
    const doc = ctx.message?.document;
    if (!doc) return;

    const mimeType = doc.mime_type || '';
    const fileName = doc.file_name || 'unknown';

    // Only accept PDF and MD
    const isPdf = mimeType === 'application/pdf' || fileName.endsWith('.pdf');
    const isMd = fileName.endsWith('.md') || mimeType === 'text/markdown';

    if (!isPdf && !isMd) {
      await ctx.reply('No momento processo texto, PDF e Markdown (.md). Outros formatos ainda não são suportados.');
      return;
    }

    let extractedText = '';
    const tmpPath = path.join(TMP_DIR, `${Date.now()}_${fileName}`);

    try {
      await ctx.api.sendChatAction(ctx.chat!.id, 'typing');

      // Download file
      const file = await ctx.getFile();
      const fileUrl = `https://api.telegram.org/file/bot${this.bot.token}/${file.file_path}`;

      const response = await fetch(fileUrl);
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(tmpPath, buffer);

      if (isPdf) {
        const data = await pdfParse(buffer);
        extractedText = data.text || '';
      } else {
        extractedText = buffer.toString('utf8');
      }

      // Combine with caption if present
      const caption = ctx.message?.caption || '';
      const finalContent = caption
        ? `${caption}\n\n--- Conteúdo do arquivo ${fileName} ---\n${extractedText}`
        : `--- Conteúdo do arquivo ${fileName} ---\n${extractedText}`;

      await this.handleMessage(ctx, 'document', finalContent);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Telegram] Document processing error: ${errMsg}`);
      await this.output.sendError(ctx, 'Falha ao processar o documento.');
    } finally {
      // Always cleanup temp file
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    }
  }
}
