#!/usr/bin/env node
/**
 * CLI entry point for even-better-playwright-mcp
 */

import { parseArgs } from 'util';
import { startServer, BrowserConfig } from '../src/index.js';

const { values } = parseArgs({
  options: {
    browser: { 
      type: 'string', 
      default: 'chromium',
      description: 'Browser to use: chromium, firefox, webkit'
    },
    headless: { 
      type: 'boolean', 
      default: false,
      description: 'Run browser in headless mode'
    },
    'cdp-endpoint': { 
      type: 'string',
      description: 'Connect to existing browser via CDP endpoint URL'
    },
    'user-data-dir': { 
      type: 'string',
      description: 'Persistent browser profile directory'
    },
    port: { 
      type: 'string',
      description: 'HTTP/SSE transport port (future use)'
    },
    help: { 
      type: 'boolean', 
      short: 'h',
      description: 'Show help'
    },
  },
  allowPositionals: false,
});

if (values.help) {
  console.log(`
even-better-playwright-mcp - A Playwright MCP server combining the best features

Usage: even-better-playwright-mcp [options]

Options:
  --browser <browser>       Browser to use: chromium, firefox, webkit (default: chromium)
  --headless               Run browser in headless mode (default: false)
  --cdp-endpoint <url>     Connect to existing browser via CDP endpoint
  --user-data-dir <path>   Use persistent browser profile directory
  --port <port>            HTTP/SSE transport port (future use)
  -h, --help               Show this help message

Examples:
  # Basic usage (launches Chromium in headed mode)
  even-better-playwright-mcp

  # Use Firefox in headless mode
  even-better-playwright-mcp --browser firefox --headless

  # Connect to existing Chrome instance
  even-better-playwright-mcp --cdp-endpoint ws://localhost:9222

  # Use persistent profile
  even-better-playwright-mcp --user-data-dir ./browser-profile
`);
  process.exit(0);
}

// Build browser configuration from CLI args
const config: BrowserConfig = {
  browser: (values.browser as 'chromium' | 'firefox' | 'webkit') ?? 'chromium',
  headless: values.headless ?? false,
  cdpEndpoint: values['cdp-endpoint'],
  userDataDir: values['user-data-dir'],
};

// Validate browser option
if (!['chromium', 'firefox', 'webkit'].includes(config.browser!)) {
  console.error(`Error: Invalid browser "${config.browser}". Use chromium, firefox, or webkit.`);
  process.exit(1);
}

// Start the MCP server with configuration
startServer(config).catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
