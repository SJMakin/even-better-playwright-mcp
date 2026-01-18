/**
 * Network request/response capture for even-better-playwright-mcp
 * Captures network traffic via Playwright's request/response event listeners
 */

import type { Page, Request, Response } from 'playwright';

export interface NetworkRequest {
  url: string;
  method: string;
  resourceType: string;
  timestamp: number;
  headers: Record<string, string>;
  postData?: string;
  status?: number;
  statusText?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  mimeType?: string;
  timing?: {
    startTime: number;
    responseTime?: number;
    duration?: number;
  };
}

export interface NetworkCaptureOptions {
  includeStatic?: boolean;      // Include images, CSS, JS, fonts
  captureResponseBody?: boolean; // Capture response body (increases memory)
  maxBodySize?: number;          // Max body size in bytes (default: 50KB)
}

const STATIC_RESOURCE_TYPES = new Set([
  'image',
  'stylesheet',
  'font',
  'media',
  'manifest',
  'other'
]);

export class NetworkCapture {
  private requests: Map<string, NetworkRequest> = new Map();
  private page: Page | null = null;
  private options: Required<NetworkCaptureOptions> = {
    includeStatic: false,
    captureResponseBody: true,
    maxBodySize: 50 * 1024, // 50KB
  };
  private requestListener: ((request: Request) => void) | null = null;
  private responseListener: ((response: Response) => void) | null = null;

  /**
   * Start capturing network requests for a page
   */
  start(page: Page, options?: NetworkCaptureOptions): void {
    if (this.page === page) {
      // Already capturing on this page
      return;
    }

    // Stop any existing capture
    this.stop();

    // Update options
    this.options = {
      ...this.options,
      ...options,
    };

    this.page = page;
    this.requests.clear();

    // Request listener
    this.requestListener = (request: Request) => {
      const resourceType = request.resourceType();

      // Skip static resources if not included
      if (!this.options.includeStatic && STATIC_RESOURCE_TYPES.has(resourceType)) {
        return;
      }

      const requestData: NetworkRequest = {
        url: request.url(),
        method: request.method(),
        resourceType,
        timestamp: Date.now(),
        headers: request.headers(),
        postData: request.postData() || undefined,
        timing: {
          startTime: Date.now(),
        },
      };

      this.requests.set(request.url() + ':' + Date.now(), requestData);
    };

    // Response listener
    this.responseListener = async (response: Response) => {
      const request = response.request();
      const resourceType = request.resourceType();

      // Skip static resources if not included
      if (!this.options.includeStatic && STATIC_RESOURCE_TYPES.has(resourceType)) {
        return;
      }

      // Find the matching request
      const key = Array.from(this.requests.keys()).find((k) =>
        k.startsWith(request.url() + ':')
      );

      if (!key) {
        return;
      }

      const requestData = this.requests.get(key)!;
      const now = Date.now();

      // Update with response data
      requestData.status = response.status();
      requestData.statusText = response.statusText();
      requestData.responseHeaders = response.headers();

      if (requestData.timing) {
        requestData.timing.responseTime = now;
        requestData.timing.duration = now - requestData.timing.startTime;
      }

      // Capture response body if enabled
      if (this.options.captureResponseBody) {
        try {
          const contentType = response.headers()['content-type'] || '';
          requestData.mimeType = contentType;

          // Only capture text-based responses
          if (
            contentType.includes('json') ||
            contentType.includes('text') ||
            contentType.includes('xml') ||
            contentType.includes('javascript') ||
            contentType.includes('x-www-form-urlencoded')
          ) {
            const buffer = await response.body();
            if (buffer.length <= this.options.maxBodySize) {
              requestData.responseBody = buffer.toString('utf-8');
            } else {
              requestData.responseBody = `[Body too large: ${buffer.length} bytes]`;
            }
          }
        } catch (error) {
          // Some responses can't be captured (redirects, etc.)
          requestData.responseBody = `[Error capturing body: ${error}]`;
        }
      }

      this.requests.set(key, requestData);
    };

    // Attach listeners
    page.on('request', this.requestListener);
    page.on('response', this.responseListener);
  }

  /**
   * Stop capturing network requests
   */
  stop(): void {
    if (this.page && this.requestListener && this.responseListener) {
      this.page.off('request', this.requestListener);
      this.page.off('response', this.responseListener);
    }

    this.page = null;
    this.requestListener = null;
    this.responseListener = null;
  }

  /**
   * Get all captured requests
   */
  getRequests(options?: { includeStatic?: boolean }): NetworkRequest[] {
    const requests = Array.from(this.requests.values());

    if (options?.includeStatic === false) {
      return requests.filter(req => !STATIC_RESOURCE_TYPES.has(req.resourceType));
    }

    return requests;
  }

  /**
   * Clear all captured requests
   */
  clear(): void {
    this.requests.clear();
  }

  /**
   * Get request count
   */
  getCount(): number {
    return this.requests.size;
  }

  /**
   * Get compact summary of requests (for token efficiency)
   */
  getSummary(options?: { includeStatic?: boolean; limit?: number }): string {
    const requests = this.getRequests({ includeStatic: options?.includeStatic });
    const limit = options?.limit || 50;
    const limitedRequests = requests.slice(-limit); // Get most recent

    if (limitedRequests.length === 0) {
      return 'No network requests captured.';
    }

    let summary = `Network Requests (${requests.length} total, showing last ${limitedRequests.length}):\n\n`;

    for (const req of limitedRequests) {
      const status = req.status ? ` [${req.status}]` : ' [pending]';
      const duration = req.timing?.duration ? ` (${req.timing.duration}ms)` : '';
      const bodyPreview = req.responseBody
        ? ` - ${req.responseBody.substring(0, 100)}${req.responseBody.length > 100 ? '...' : ''}`
        : '';

      summary += `${req.method} ${req.url}${status}${duration}\n`;
      if (req.postData) {
        summary += `  POST: ${req.postData.substring(0, 100)}${req.postData.length > 100 ? '...' : ''}\n`;
      }
      if (bodyPreview) {
        summary += `  RESPONSE: ${bodyPreview}\n`;
      }
      summary += '\n';
    }

    return summary;
  }
}
