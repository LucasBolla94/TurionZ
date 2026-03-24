// ============================================================
// TurionZ — Discord Adapter
// Created by BollaNetwork
// ============================================================

import { Client, GatewayIntentBits, Message as DiscordMessage } from 'discord.js';
import { InternalMessage, AgentLoopOutput } from '../../../types';
import { AuthenticationGateway } from '../../../security/AuthenticationGateway';
import { MessageRouter } from '../../MessageRouter';

const MAX_DISCORD_LENGTH = 2000;

export class DiscordAdapter {
  private client: Client;
  private auth: AuthenticationGateway;
  private router: MessageRouter;

  constructor(botToken: string) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.auth = AuthenticationGateway.getInstance();
    this.router = MessageRouter.getInstance();
    this.setupHandlers(botToken);
  }

  async start(botToken: string): Promise<void> {
    await this.client.login(botToken);
    console.log('[Discord] Bot is running.');
  }

  async stop(): Promise<void> {
    this.client.destroy();
    console.log('[Discord] Bot stopped.');
  }

  private setupHandlers(botToken: string): void {
    this.client.on('ready', () => {
      console.log(`[Discord] Logged in as ${this.client.user?.tag}`);
    });

    this.client.on('messageCreate', async (msg: DiscordMessage) => {
      // Ignore bot messages
      if (msg.author.bot) return;

      // Only respond to DMs or when mentioned
      const isDM = !msg.guild;
      const isMentioned = msg.mentions.has(this.client.user!);
      if (!isDM && !isMentioned) return;

      await this.handleMessage(msg);
    });
  }

  private async handleMessage(msg: DiscordMessage): Promise<void> {
    const userId = msg.author.id;
    const username = msg.author.username;

    // Authenticate
    const authResult = await this.auth.authenticate('discord', userId, username);

    if (authResult.result === 'denied_silent') {
      return; // Complete silence
    }

    if (authResult.result === 'pairing_initiated') {
      await msg.reply(
        `Solicitação de acesso registrada.\nSeu código: ${authResult.pairingCode}\nAguarde aprovação do administrador.`
      );
      return;
    }

    try {
      // Show typing
      if ('sendTyping' in msg.channel) {
        await (msg.channel as any).sendTyping();
      }

      // Clean content (remove mention)
      let content = msg.content;
      if (this.client.user) {
        content = content.replace(new RegExp(`<@!?${this.client.user.id}>`, 'g'), '').trim();
      }

      if (!content) return;

      const message: InternalMessage = {
        id: msg.id,
        userId,
        platform: 'discord',
        conversationId: msg.channel.id,
        type: 'text',
        content,
        attachments: [],
        flags: { requires_audio_reply: false, source_type: 'text' },
        timestamp: new Date(),
      };

      const result = await this.router.routeMessage(message);
      await this.sendResponse(msg, result);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Discord] Error: ${errMsg}`);
      await msg.reply('⚠️ Ocorreu um erro ao processar sua mensagem.');
    }
  }

  private async sendResponse(msg: DiscordMessage, result: AgentLoopOutput): Promise<void> {
    const text = result.response || '(Sem resposta)';

    if (result.status === 'error') {
      await msg.reply(`⚠️ ${text}`);
      return;
    }

    // Discord limit is 2000 chars
    if (text.length <= MAX_DISCORD_LENGTH) {
      await msg.reply(text);
    } else {
      // Chunk
      const chunks = this.splitText(text, MAX_DISCORD_LENGTH - 50);
      for (const chunk of chunks) {
        await msg.reply(chunk);
      }
    }
  }

  private splitText(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      let splitAt = remaining.lastIndexOf('\n', maxLength);
      if (splitAt < maxLength * 0.5) {
        splitAt = remaining.lastIndexOf(' ', maxLength);
      }
      if (splitAt < maxLength * 0.5) {
        splitAt = maxLength;
      }

      chunks.push(remaining.substring(0, splitAt));
      remaining = remaining.substring(splitAt).trimStart();
    }

    return chunks;
  }
}
