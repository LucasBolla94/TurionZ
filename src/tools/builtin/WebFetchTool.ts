// ============================================================
// TurionZ — Web Fetch Tool (Built-in)
// Created by BollaNetwork
// ============================================================

import { BaseTool } from '../BaseTool';
import { ToolResult } from '../../types';

export class WebFetchTool extends BaseTool {
  readonly name = 'web_fetch';
  readonly description =
    'Fetch the content of a URL via HTTP GET. Returns plain text with HTML tags stripped. Handles redirects and timeouts.';
  readonly parameters = {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch',
      },
      maxLength: {
        type: 'number',
        description: 'Maximum character length of returned content (default: 10000)',
      },
    },
    required: ['url'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const url = args.url as string;
    const maxLength = (args.maxLength as number) || 10000;

    if (!url || url.trim().length === 0) {
      return this.error('URL cannot be empty.');
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return this.error('URL must start with http:// or https://');
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,text/plain,application/json',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        },
        redirect: 'follow',
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return this.error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      let text = await response.text();

      // Strip HTML tags if HTML content
      if (contentType.includes('text/html')) {
        text = this.stripHtml(text);
      }

      // Truncate
      if (text.length > maxLength) {
        text = text.substring(0, maxLength) + `\n... (truncated at ${maxLength} chars)`;
      }

      return this.success(`URL: ${url}\nContent-Type: ${contentType}\n\n${text}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('aborted') || errMsg.includes('abort')) {
        return this.error(`Request timed out after 10 seconds: ${url}`);
      }
      return this.error(`Fetch failed: ${errMsg}`);
    }
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();
  }
}
