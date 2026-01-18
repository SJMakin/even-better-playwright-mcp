/**
 * Browser console log management - persistent per-page logging
 * Adapted from playwriter's console log system
 */

import type { Page, ConsoleMessage } from 'playwright';

const MAX_LOGS_PER_PAGE = 5000;

// Store logs per page using page._guid as identifier
const browserLogs: Map<string, string[]> = new Map();

/**
 * Get unique identifier for a page
 */
async function getPageTargetId(page: Page): Promise<string> {
  return (page as any)._guid || 'unknown';
}

/**
 * Check if value is a RegExp
 */
function isRegExp(value: any): value is RegExp {
  return typeof value === 'object' && value !== null &&
         typeof value.test === 'function' && typeof value.exec === 'function';
}

/**
 * Set up console listener for a page
 * Captures all console output and stores it persistently
 */
export function setupPageConsoleListener(page: Page): void {
  const targetId = (page as any)._guid as string | undefined;

  if (!targetId) {
    console.warn('[browser-logs] Could not get page targetId, skipping console listener setup');
    return;
  }

  // Initialize log storage for this page
  if (!browserLogs.has(targetId)) {
    browserLogs.set(targetId, []);
  }

  // Clear logs when main frame navigates
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      browserLogs.set(targetId, []);
    }
  });

  // Clean up when page closes
  page.on('close', () => {
    browserLogs.delete(targetId);
  });

  // Capture all console messages
  page.on('console', (msg: ConsoleMessage) => {
    const logEntry = `[${msg.type()}] ${msg.text()}`;
    const pageLogs = browserLogs.get(targetId);

    if (pageLogs) {
      pageLogs.push(logEntry);

      // Keep only the latest MAX_LOGS_PER_PAGE logs
      if (pageLogs.length > MAX_LOGS_PER_PAGE) {
        pageLogs.shift();
      }
    }
  });
}

export interface GetLatestLogsOptions {
  page?: Page;
  count?: number;
  search?: string | RegExp;
}

/**
 * Get latest browser console logs with optional filtering
 */
export async function getLatestLogs(options?: GetLatestLogsOptions): Promise<string[]> {
  const { page, count, search } = options || {};

  let allLogs: string[] = [];

  if (page) {
    const targetId = await getPageTargetId(page);
    const pageLogs = browserLogs.get(targetId) || [];
    allLogs = [...pageLogs];
  } else {
    // Get logs from all pages
    for (const pageLogs of browserLogs.values()) {
      allLogs.push(...pageLogs);
    }
  }

  // Apply search filter if provided
  if (search) {
    const matchIndices: number[] = [];

    for (let i = 0; i < allLogs.length; i++) {
      const log = allLogs[i];
      let isMatch = false;

      if (typeof search === 'string') {
        isMatch = log.includes(search);
      } else if (isRegExp(search)) {
        isMatch = search.test(log);
      }

      if (isMatch) {
        matchIndices.push(i);
      }
    }

    // Collect logs with 5 lines of context above and below each match
    const CONTEXT_LINES = 5;
    const includedIndices = new Set<number>();

    for (const idx of matchIndices) {
      const start = Math.max(0, idx - CONTEXT_LINES);
      const end = Math.min(allLogs.length - 1, idx + CONTEXT_LINES);
      for (let i = start; i <= end; i++) {
        includedIndices.add(i);
      }
    }

    // Build result with separators between non-contiguous sections
    const sortedIndices = [...includedIndices].sort((a, b) => a - b);
    const result: string[] = [];

    for (let i = 0; i < sortedIndices.length; i++) {
      const logIdx = sortedIndices[i];
      if (i > 0 && sortedIndices[i - 1] !== logIdx - 1) {
        result.push('---');
      }
      result.push(allLogs[logIdx]);
    }

    allLogs = result;
  }

  // Apply count limit (return last N logs)
  return count !== undefined ? allLogs.slice(-count) : allLogs;
}

/**
 * Clear all stored browser logs
 */
export function clearAllLogs(): void {
  browserLogs.clear();
}

/**
 * Format logs for display
 */
export function formatBrowserLogs(logs: string[]): string {
  if (logs.length === 0) {
    return 'No browser console logs captured';
  }

  return `Browser Console Logs (${logs.length} entries):\n${logs.join('\n')}`;
}
