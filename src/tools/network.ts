/**
 * Network requests tool for even-better-playwright-mcp
 * Returns captured network traffic
 */

import { BrowserManager } from '../browser.js';

export interface NetworkRequestsParams {
  includeStatic?: boolean; // Include static resources (images, CSS, fonts)
  limit?: number;          // Max number of requests to return
  clear?: boolean;         // Clear captured requests after returning
}

/**
 * Tool definition for MCP
 */
export const networkRequestsTool = {
  name: 'browser_network_requests',
  description:
    'Get captured network requests from the browser. Automatically starts capturing when first called. ' +
    'Use includeStatic:true to include images/CSS/fonts. Returns recent requests with status, timing, and response previews.',
  inputSchema: {
    type: 'object',
    properties: {
      includeStatic: {
        type: 'boolean',
        description:
          'Whether to include successful static resources like images, fonts, scripts, etc. Defaults to false.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of requests to return (most recent). Defaults to 50.',
      },
      clear: {
        type: 'boolean',
        description: 'Clear captured requests after returning them. Defaults to false.',
      },
    },
  },
};

export function createNetworkHandler(browserManager: BrowserManager) {
  return async function getNetworkRequests(
    params: NetworkRequestsParams = {}
  ): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    try {
      const page = await browserManager.getPage();
      const networkCapture = browserManager.getNetworkCapture();

      // Start capturing if not already started
      networkCapture.start(page, {
        includeStatic: params.includeStatic ?? false,
        captureResponseBody: true,
        maxBodySize: 50 * 1024,
      });

      // Get summary of captured requests
      const summary = networkCapture.getSummary({
        includeStatic: params.includeStatic,
        limit: params.limit ?? 50,
      });

      // Clear if requested
      if (params.clear) {
        networkCapture.clear();
      }

      return {
        content: [
          {
            type: 'text',
            text: summary,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error capturing network requests: ${error.message}`,
          },
        ],
      };
    }
  };
}
