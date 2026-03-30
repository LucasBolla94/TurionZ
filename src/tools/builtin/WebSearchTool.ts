// ============================================================
// TurionZ — Web Search Tool (Built-in)
// Created by BollaNetwork
// ============================================================

import { BaseTool } from '../BaseTool';
import { ToolResult } from '../../types';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export class WebSearchTool extends BaseTool {
  readonly name = 'web_search';
  readonly description =
    'Search the web using DuckDuckGo. Returns titles, URLs, and snippets. No API key needed.';
  readonly parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5)',
      },
    },
    required: ['query'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const query = args.query as string;
    const maxResults = (args.maxResults as number) || 5;

    if (!query || query.trim().length === 0) {
      return this.error('Query cannot be empty.');
    }

    try {
      const encoded = encodeURIComponent(query);
      const url = `https://html.duckduckgo.com/html/?q=${encoded}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return this.error(`Search failed: HTTP ${response.status}`);
      }

      const html = await response.text();
      const results = this.parseResults(html, maxResults);

      if (results.length === 0) {
        return this.success(`No results found for: ${query}`);
      }

      const formatted = results
        .map(
          (r, i) =>
            `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`
        )
        .join('\n\n');

      return this.success(
        `Search results for "${query}" (${results.length} results):\n\n${formatted}`
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('aborted') || errMsg.includes('abort')) {
        return this.error('Search timed out after 10 seconds.');
      }
      return this.error(`Search failed: ${errMsg}`);
    }
  }

  private parseResults(html: string, max: number): SearchResult[] {
    const results: SearchResult[] = [];

    // DuckDuckGo HTML result blocks
    const resultBlocks = html.match(/<div class="result[^"]*"[\s\S]*?<\/div>\s*<\/div>/g) || [];

    for (const block of resultBlocks) {
      if (results.length >= max) break;

      // Extract title
      const titleMatch = block.match(/<a[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/);
      const title = titleMatch
        ? titleMatch[1].replace(/<[^>]+>/g, '').trim()
        : '';

      // Extract URL
      const urlMatch = block.match(/href="([^"]*)"[^>]*class="result__a"/);
      let url = urlMatch ? urlMatch[1] : '';
      // DuckDuckGo wraps URLs in redirects
      if (url.includes('uddg=')) {
        const decoded = decodeURIComponent(url.split('uddg=')[1]?.split('&')[0] || '');
        url = decoded || url;
      }

      // Extract snippet
      const snippetMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
      const snippet = snippetMatch
        ? snippetMatch[1].replace(/<[^>]+>/g, '').trim()
        : '';

      if (title && url) {
        results.push({ title, url, snippet });
      }
    }

    return results;
  }
}
