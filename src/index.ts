#!/usr/bin/env node
/**
 * even-better-playwright-mcp - MCP server entry point
 * Combines the best of better-playwright-mcp, playwriter, and playwright-mcp
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { snapshotTool, snapshotSchema, handleSnapshot } from './tools/snapshot.js';
import { screenshotTool, screenshotSchema, handleScreenshot } from './tools/screenshot.js';
import { executeTool, executeSchema, handleExecute } from './tools/execute.js';
import { searchTool, searchSchema, handleSearch } from './tools/search.js';
import { networkRequestsTool, getNetworkRequests } from './tools/network.js';
import { closeBrowser, setBrowserConfig, BrowserConfig } from './browser.js';

export type { BrowserConfig };

const SERVER_NAME = 'even-better-playwright-mcp';
const SERVER_VERSION = '0.1.0';

/**
 * Create and configure the MCP server
 */
function createServer(): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: snapshotTool.name,
          description: snapshotTool.description,
          inputSchema: zodToJsonSchema(snapshotSchema),
        },
        {
          name: screenshotTool.name,
          description: screenshotTool.description,
          inputSchema: zodToJsonSchema(screenshotSchema),
        },
        {
          name: executeTool.name,
          description: executeTool.description,
          inputSchema: zodToJsonSchema(executeSchema),
        },
        {
          name: searchTool.name,
          description: searchTool.description,
          inputSchema: zodToJsonSchema(searchSchema),
        },
        {
          name: networkRequestsTool.name,
          description: networkRequestsTool.description,
          inputSchema: networkRequestsTool.inputSchema,
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'snapshot': {
          const parsed = snapshotSchema.parse(args || {});
          return await handleSnapshot(parsed);
        }
        case 'screenshot': {
          const parsed = screenshotSchema.parse(args || {});
          return await handleScreenshot(parsed);
        }
        case 'execute':
        case 'browser_execute': {
          const parsed = executeSchema.parse(args || {});
          return await handleExecute(parsed);
        }
        case 'browser_search_snapshot': {
          const parsed = searchSchema.parse(args || {});
          return await handleSearch(parsed);
        }
        case 'browser_network_requests': {
          return await getNetworkRequests(args as any || {});
        }
        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Start the MCP server with optional configuration
 */
export async function startServer(config: BrowserConfig = {}): Promise<void> {
  // Apply browser configuration
  setBrowserConfig(config);
  
  const server = createServer();
  const transport = new StdioServerTransport();

  // Handle cleanup on exit
  process.on('SIGINT', async () => {
    await closeBrowser();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await closeBrowser();
    process.exit(0);
  });

  await server.connect(transport);
  
  const browserInfo = config.browser ?? 'chromium';
  const modeInfo = config.headless ? 'headless' : 'headed';
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started (${browserInfo}, ${modeInfo})`);
}

// Run directly if this is the main module
const isMainModule = import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/') ?? '');
if (isMainModule || process.argv[1]?.includes('index')) {
  startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}
