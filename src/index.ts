#!/usr/bin/env node
// @yellowkode/suno-mcp — MCP Server for Suno AI
// github.com/YellowKode-Academy/suno-mcp
// by YellowKode Academy

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createHandlers, toolSchemas } from '@yellowkode/suno-mcp-core';
import type { GenerateMusicParams } from '@yellowkode/suno-mcp-core';
import { detectApiBase, isSunoBoardKey } from './config.js';

const SUNO_API_KEY = process.env.SUNO_API_KEY;
const MAX_POLL_ATTEMPTS = parseInt(process.env.MAX_POLL_ATTEMPTS || '30');
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '10000');

if (!SUNO_API_KEY) {
  console.error('[suno-mcp] ERROR: SUNO_API_KEY environment variable is required');
  console.error('[suno-mcp] Use a sunoapi.org key (e.g. e57efd1b...) or a SunoBoard key (sb_...)');
  process.exit(1);
}

const SUNO_API_BASE = detectApiBase(SUNO_API_KEY, process.env.SUNO_API_BASE_URL);

if (isSunoBoardKey(SUNO_API_KEY)) {
  console.error('[suno-mcp] Using SunoBoard API — generations will appear in your dashboard');
} else {
  console.error('[suno-mcp] Using sunoapi.org directly (BYOK mode)');
}

const handlers = createHandlers({
  apiKey: SUNO_API_KEY,
  baseUrl: SUNO_API_BASE,
  maxPollAttempts: MAX_POLL_ATTEMPTS,
  pollIntervalMs: POLL_INTERVAL_MS,
  apiType: isSunoBoardKey(SUNO_API_KEY) ? 'sunoboard' : 'sunoapi',
});

// ─────────────────────────────────────────
// MCP Server
// ─────────────────────────────────────────

const server = new Server(
  { name: '@yellowkode/suno-mcp', version: '1.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolSchemas }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: unknown;

    switch (name) {
      case 'generate_music':
        result = await handlers.generateMusic(args as unknown as GenerateMusicParams);
        break;
      case 'get_music_status':
        result = await handlers.getMusicStatus(args!.taskId as string);
        break;
      case 'wait_for_music':
        result = await handlers.waitForMusic(args!.taskId as string);
        break;
      case 'list_recent_music':
        result = await handlers.listRecentMusic(
          (args?.page as number) || 1,
          (args?.limit as number) || 20,
        );
        break;
      case 'get_credits':
        result = await handlers.getCredits();
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
});

// ─────────────────────────────────────────
// Startup health check
// ─────────────────────────────────────────

async function main() {
  const provider = isSunoBoardKey(SUNO_API_KEY!) ? 'SunoBoard' : 'sunoapi.org';
  console.error(`[suno-mcp] Validating ${provider} API key...`);

  try {
    const credits = await handlers.getCredits();
    console.error(`[suno-mcp] ✓ Connected to ${provider} — ${credits.remaining} credits remaining`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[suno-mcp] ✗ API key validation failed: ${message}`);
    console.error('[suno-mcp] Server will start but tool calls will fail until the key is valid.');
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[suno-mcp] MCP Server running — by YellowKode Academy');
}

main().catch((error) => {
  console.error('[suno-mcp] Fatal error:', error);
  process.exit(1);
});
