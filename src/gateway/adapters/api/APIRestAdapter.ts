// ============================================================
// TurionZ — API REST Adapter
// Created by BollaNetwork
// ============================================================

import express, { Request, Response, NextFunction } from 'express';
import { InternalMessage, AgentLoopOutput } from '../../../types';
import { MessageRouter } from '../../MessageRouter';
import { VaultManager } from '../../../security/VaultManager';

const DEFAULT_PORT = 3000;

export class APIRestAdapter {
  private app: express.Application;
  private router: MessageRouter;
  private server: ReturnType<express.Application['listen']> | null = null;
  private apiKey: string | null = null;

  constructor() {
    this.app = express();
    this.router = MessageRouter.getInstance();
    this.setupMiddleware();
    this.setupRoutes();
  }

  async start(port?: number): Promise<void> {
    const listenPort = port || parseInt(process.env.API_PORT || String(DEFAULT_PORT), 10);

    // Load API key from vault or env
    const vault = VaultManager.getInstance();
    this.apiKey = vault.readOrEnv('api_access_key', 'API_ACCESS_KEY');

    this.server = this.app.listen(listenPort, () => {
      console.log(`[API] REST adapter running on port ${listenPort}.`);
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.server = null;
      console.log('[API] REST adapter stopped.');
    }
  }

  private setupMiddleware(): void {
    this.app.use(express.json({ limit: '10mb' }));

    // Auth middleware
    this.app.use('/api', (req: Request, res: Response, next: NextFunction) => {
      if (!this.apiKey) {
        // No API key configured — allow all (dev mode)
        next();
        return;
      }

      const authHeader = req.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${this.apiKey}`) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        agent: 'TurionZ',
        version: '0.1.0',
        timestamp: new Date().toISOString(),
      });
    });

    // Send message
    this.app.post('/api/message', async (req: Request, res: Response) => {
      try {
        const { content, userId, conversationId } = req.body;

        if (!content || typeof content !== 'string') {
          res.status(400).json({ error: 'Missing or invalid "content" field.' });
          return;
        }

        const message: InternalMessage = {
          id: `api-${Date.now()}`,
          userId: userId || 'api-user',
          platform: 'api',
          conversationId: conversationId || `api-${Date.now()}`,
          type: 'text',
          content,
          attachments: [],
          flags: { requires_audio_reply: false, source_type: 'text' },
          timestamp: new Date(),
        };

        const result = await this.router.routeMessage(message);

        res.json({
          response: result.response,
          status: result.status,
          metrics: result.metrics,
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[API] Error: ${errMsg}`);
        res.status(500).json({ error: 'Internal server error.' });
      }
    });

    // Get status
    this.app.get('/api/status', (_req: Request, res: Response) => {
      res.json({
        agent: 'TurionZ (Thor)',
        version: '0.1.0',
        creator: 'BollaNetwork',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      });
    });
  }
}
