/**
 * VM sandbox for executing Playwright code safely.
 * Provides isolated execution environment with controlled access.
 */

import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import type { Page, BrowserContext } from 'playwright';
import { createScopedFS, ScopedFS } from './utils/scoped-fs.js';
import { createCapturedConsole, formatConsoleLogs, type ConsoleLogs } from './utils/console-capture.js';
import { getSnapshot } from './browser.js';

// DevTools imports (Phase 4)
import {
  getCDPSession,
  createDebugger,
  createEditor,
  getStylesForLocator,
  formatStylesAsText,
  getReactSource,
} from './devtools/index.js';

// Visual labels imports (Phase 5)
import {
  showAriaRefLabels,
  hideAriaRefLabels,
  screenshotWithAccessibilityLabels,
} from './visual/index.js';

// Utility imports
import { waitForPageLoad, WaitForPageLoadOptions, WaitForPageLoadResult } from './utils/wait-for-page-load.js';
import { getLatestLogs, clearAllLogs } from './utils/browser-logs.js';
import { getCleanHTML, GetCleanHTMLOptions } from './utils/clean-html.js';
import { getLocatorStringForElement } from './utils/locator-string.js';

// Create require function for use in sandbox
const require = createRequire(import.meta.url);

// Safe globals to expose in sandbox
const SAFE_GLOBALS = {
  setTimeout,
  setInterval,
  clearTimeout,
  clearInterval,
  URL,
  URLSearchParams,
  fetch,
  Buffer,
  TextEncoder,
  TextDecoder,
  crypto,
  AbortController,
  AbortSignal,
  structuredClone,
} as const;

/**
 * Allowlist of Node.js built-in modules safe for sandbox use.
 * Blocks dangerous modules like child_process, vm, net, etc.
 */
const ALLOWED_MODULES = new Set([
  // Safe utility modules
  'path', 'node:path',
  'url', 'node:url',
  'querystring', 'node:querystring',
  
  // Crypto and encoding
  'crypto', 'node:crypto',
  'buffer', 'node:buffer',
  'string_decoder', 'node:string_decoder',
  
  // Utilities
  'util', 'node:util',
  'assert', 'node:assert',
  'events', 'node:events',
  
  // Streams and compression
  'stream', 'node:stream',
  'zlib', 'node:zlib',
  
  // HTTP (fetch already available)
  'http', 'node:http',
  'https', 'node:https',
  
  // System info (read-only)
  'os', 'node:os',
  
  // fs returns sandboxed version
  'fs', 'node:fs',
]);

// Singleton scoped fs instance
const scopedFs: ScopedFS = createScopedFS();

/**
 * Create a sandboxed require that only allows safe modules.
 */
function createSandboxedRequire(originalRequire: NodeRequire): NodeRequire {
  const sandboxedRequire = ((id: string) => {
    if (!ALLOWED_MODULES.has(id)) {
      const error = new Error(
        `Module "${id}" is not allowed in sandbox. ` +
        `Allowed: ${[...ALLOWED_MODULES].filter((m) => !m.startsWith('node:')).join(', ')}`
      );
      error.name = 'ModuleNotAllowedError';
      throw error;
    }

    // Return sandboxed fs
    if (id === 'fs' || id === 'node:fs') {
      return scopedFs;
    }

    return originalRequire(id);
  }) as NodeRequire;

  sandboxedRequire.resolve = originalRequire.resolve;
  sandboxedRequire.cache = originalRequire.cache;
  sandboxedRequire.extensions = originalRequire.extensions;
  sandboxedRequire.main = originalRequire.main;

  return sandboxedRequire;
}

const sandboxedRequire = createSandboxedRequire(require);

export interface VMContextOptions {
  page: Page;
  context: BrowserContext;
  state: Record<string, unknown>;
  timeout?: number;
}

export interface VMExecutionResult {
  result: unknown;
  consoleLogs: ConsoleLogs[];
  error?: Error;
}

export class CodeExecutionTimeoutError extends Error {
  constructor(timeout: number) {
    super(`Code execution timed out after ${timeout}ms`);
    this.name = 'CodeExecutionTimeoutError';
  }
}

/**
 * Create $ shorthand function for locator access.
 * Usage: $('e5') returns page.locator('aria-ref=e5')
 */
function createRefHelper(page: Page, lastSnapshotRef: { value: string | null }) {
  return function $(ref: string) {
    // Validate ref exists in last snapshot if we have one
    if (lastSnapshotRef.value && !lastSnapshotRef.value.includes(`[ref=${ref}]`)) {
      throw new Error(
        `Ref "${ref}" not found in snapshot. The ref may be stale. ` +
        `Call snapshot tool again to get fresh refs.`
      );
    }
    return page.locator(`aria-ref=${ref}`);
  };
}

/**
 * Execute code in a sandboxed VM context.
 */
export async function executeInVM(
  code: string,
  options: VMContextOptions
): Promise<VMExecutionResult> {
  const { page, context, state, timeout = 30000 } = options;
  const { console: customConsole, logs } = createCapturedConsole();
  
  // Track last snapshot for ref validation
  const lastSnapshotRef = { value: null as string | null };
  
  // Helper to get accessibility snapshot
  const accessibilitySnapshot = async (): Promise<string> => {
    const snapshot = await getSnapshot(page);
    lastSnapshotRef.value = snapshot;
    return snapshot;
  };

  // Create VM context object with all helpers
  const vmContextObj = {
    page,
    context,
    state,
    console: customConsole,
    $: createRefHelper(page, lastSnapshotRef),
    accessibilitySnapshot,
    require: sandboxedRequire,
    ...SAFE_GLOBALS,
    
    // DevTools (Phase 4) - CDP-powered debugging and editing
    getCDPSession: () => getCDPSession(page),
    createDebugger,
    createEditor,
    getStylesForLocator,
    formatStylesAsText,
    getReactSource,
    
    // Visual Labels (Phase 5) - Vimium-style overlays
    showAriaRefLabels: (options?: { interactiveOnly?: boolean; timeout?: number }) =>
      showAriaRefLabels({ page, ...options }),
    hideAriaRefLabels: () => hideAriaRefLabels({ page }),
    screenshotWithAccessibilityLabels: (options?: { interactiveOnly?: boolean }) =>
      screenshotWithAccessibilityLabels({ page, ...options }),

    // Utilities - Smart page load detection
    waitForPageLoad: (options?: Omit<WaitForPageLoadOptions, 'page'>) =>
      waitForPageLoad({ page, ...options }),

    // Browser Console Logs - Persistent logging across executions
    getLatestLogs: (options?: Omit<Parameters<typeof getLatestLogs>[0], 'page'>) =>
      getLatestLogs({ page, ...options }),
    clearAllLogs,

    // HTML Utilities
    getCleanHTML: (options: Omit<GetCleanHTMLOptions, 'locator'> & { locator?: any }) =>
      getCleanHTML({ locator: options.locator || page, ...options }),
    getLocatorStringForElement,
  };

  const vmContext = vm.createContext(vmContextObj);
  
  // Wrap code in async IIFE
  const wrappedCode = `(async () => { ${code} })()`;

  try {
    const result = await Promise.race([
      vm.runInContext(wrappedCode, vmContext, {
        timeout,
        displayErrors: true,
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new CodeExecutionTimeoutError(timeout)), timeout)
      ),
    ]);

    return { result, consoleLogs: logs };
  } catch (error) {
    return { 
      result: undefined, 
      consoleLogs: logs, 
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}

/**
 * Format VM execution result for MCP response.
 */
export function formatVMResult(result: VMExecutionResult): string {
  let responseText = formatConsoleLogs(result.consoleLogs);

  if (result.error) {
    const isTimeout = result.error instanceof CodeExecutionTimeoutError;
    const hint = isTimeout ? '' : 
      '\n\n[HINT: If this is a stale ref error, call snapshot tool again to get fresh refs.]';
    responseText += `Error: ${result.error.message}${hint}`;
    return responseText;
  }

  if (result.result !== undefined) {
    responseText += 'Return value:\n';
    if (typeof result.result === 'string') {
      responseText += result.result;
    } else {
      try {
        responseText += JSON.stringify(result.result, null, 2);
      } catch {
        responseText += String(result.result);
      }
    }
  } else if (result.consoleLogs.length === 0) {
    responseText += 'Code executed successfully (no output)';
  }

  return responseText;
}
