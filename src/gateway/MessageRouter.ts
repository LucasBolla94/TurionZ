// ============================================================
// TurionZ — Message Router (Gateway → Core → Gateway)
// Created by BollaNetwork
// ============================================================

import { InternalMessage, AgentLoopOutput } from '../types';

export type MessageHandler = (message: InternalMessage) => Promise<AgentLoopOutput>;
export type ProgressHandler = (platform: string, userId: string, message: string) => Promise<void>;

export class MessageRouter {
  private static instance: MessageRouter;
  private messageHandler: MessageHandler | null = null;
  private progressHandler: ProgressHandler | null = null;

  private constructor() {}

  static getInstance(): MessageRouter {
    if (!MessageRouter.instance) {
      MessageRouter.instance = new MessageRouter();
    }
    return MessageRouter.instance;
  }

  setMessageHandler(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  setProgressHandler(handler: ProgressHandler): void {
    this.progressHandler = handler;
  }

  async routeMessage(message: InternalMessage): Promise<AgentLoopOutput> {
    if (!this.messageHandler) {
      throw new Error('No message handler registered. Is the AgentController initialized?');
    }

    console.log(
      `[Router] Message from ${message.platform}:${message.userId} (type: ${message.type})`
    );

    return this.messageHandler(message);
  }

  async sendProgress(platform: string, userId: string, message: string): Promise<void> {
    if (this.progressHandler) {
      await this.progressHandler(platform, userId, message);
    }
  }
}
