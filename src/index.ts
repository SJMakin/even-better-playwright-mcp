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
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { snapshotTool, snapshotSchema, createSnapshotHandler } from './tools/snapshot.js';
import { screenshotTool, screenshotSchema, createScreenshotHandler } from './tools/screenshot.js';
import { executeTool, executeSchema, createExecuteHandler } from './tools/execute.js';
import { searchTool, searchSchema, createSearchHandler } from './tools/search.js';
import { networkRequestsTool, createNetworkHandler } from './tools/network.js';
import { BrowserManager, BrowserConfig } from './browser.js';

export { BrowserManager };
export type { BrowserConfig };

const SERVER_NAME = 'even-better-playwright-mcp';
const SERVER_VERSION = '0.1.0';

/**
 * Interface for server instance
 */
export interface PlaywrightMcpServer {
  server: Server;
  browserManager: BrowserManager;
  cleanup: () => Promise<void>;
}

/**
 * Create and configure the MCP server with a BrowserManager instance
 */
export function createServerInstance(config?: BrowserConfig): PlaywrightMcpServer {
  const browserManager = new BrowserManager(config);

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // Create tool handlers with injected browser manager
  const handleSnapshot = createSnapshotHandler(browserManager);
  const handleScreenshot = createScreenshotHandler(browserManager);
  const handleExecute = createExecuteHandler(browserManager);
  const handleSearch = createSearchHandler(browserManager);
  const handleNetworkRequests = createNetworkHandler(browserManager);

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
          return await handleNetworkRequests(args as any || {});
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

  // Resource definitions for API documentation
  const resources = [
    {
      uri: 'playwriter://resources/debugger-api',
      name: 'Debugger API',
      description: 'CDP Debugger API - set breakpoints, step through code, inspect variables',
      mimeType: 'text/markdown',
    },
    {
      uri: 'playwriter://resources/editor-api',
      name: 'Editor API',
      description: 'CDP Editor API - view and live-edit page scripts and CSS at runtime',
      mimeType: 'text/markdown',
    },
    {
      uri: 'playwriter://resources/styles-api',
      name: 'Styles API',
      description: 'CDP Styles API - inspect CSS styles applied to elements',
      mimeType: 'text/markdown',
    },
  ];

  // Helper to load resource content
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const loadResource = (name: string): string => {
    const resourcePath = join(__dirname, 'resources', `${name}.md`);
    return readFileSync(resourcePath, 'utf-8');
  };

  // List available resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources };
  });

  // Read resource content
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    const resourceMap: Record<string, string> = {
      'playwriter://resources/debugger-api': 'debugger-api',
      'playwriter://resources/editor-api': 'editor-api',
      'playwriter://resources/styles-api': 'styles-api',
    };

    const resourceName = resourceMap[uri];
    if (!resourceName) {
      throw new Error(`Unknown resource: ${uri}`);
    }

    const content = loadResource(resourceName);
    return {
      contents: [
        {
          uri,
          mimeType: 'text/markdown',
          text: content,
        },
      ],
    };
  });

  return {
    server,
    browserManager,
    cleanup: async () => {
      await browserManager.close();
    },
  };
}

/**
 * Start the MCP server with optional configuration
 */
export async function startServer(config: BrowserConfig = {}): Promise<void> {
  const { server, cleanup } = createServerInstance(config);

  const transport = new StdioServerTransport();

  // Handle cleanup on exit
  process.on('SIGINT', async () => {
    await cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await cleanup();
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

// Export tool factories and schemas for library consumers
export {
  createSnapshotHandler,
  createScreenshotHandler,
  createExecuteHandler,
  createSearchHandler,
  createNetworkHandler,
};
