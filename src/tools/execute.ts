/**
 * Execute tool - runs arbitrary Playwright code in a sandboxed VM
 * "God mode" tool with full Playwright API access
 */

import { z } from 'zod';
import { getPage, getContext, getUserState } from '../browser.js';
import { executeInVM, formatVMResult, CodeExecutionTimeoutError } from '../vm-context.js';

export const executeSchema = z.object({
  code: z.string().describe(
    'Playwright code with {page, context, state, $} in scope. ' +
    'Should be concise - use ; for multiple statements.'
  ),
  timeout: z.number().optional().default(30000).describe(
    'Timeout in milliseconds (default: 30000)'
  ),
});

const EXECUTE_DESCRIPTION = `Execute Playwright code with these in scope:
- \`page\` - Current Playwright page
- \`context\` - Browser context
- \`state\` - Persistent object across calls
- \`$('e5')\` - Shorthand for page.locator('aria-ref=e5')
- \`accessibilitySnapshot()\` - Get current page snapshot

Common patterns:
- Navigation: await page.goto('https://example.com')
- Click by ref: await $('e5').click()
- Fill input: await $('e12').fill('text')
- Get text: await $('e3').textContent()
- Wait: await page.waitForLoadState('networkidle')

IMPORTANT: After navigation, refs are stale - call snapshot tool again.

Safe modules available via require():
path, url, crypto, buffer, util, assert, os, fs (sandboxed)`;

export const executeTool = {
  name: 'browser_execute',
  description: EXECUTE_DESCRIPTION,
  inputSchema: executeSchema,
};

const MAX_RESPONSE_LENGTH = 6000;

export async function handleExecute(params: z.infer<typeof executeSchema>): Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}> {
  const { code, timeout } = params;

  try {
    const page = await getPage();
    const context = getContext();

    if (!context) {
      throw new Error('Browser context not available');
    }

    const result = await executeInVM(code, {
      page,
      context,
      state: getUserState(),
      timeout,
    });

    // Format result
    let responseText = formatVMResult(result);

    // Truncate if too long
    if (responseText.length > MAX_RESPONSE_LENGTH) {
      responseText = responseText.slice(0, MAX_RESPONSE_LENGTH) +
        `\n\n[Truncated to ${MAX_RESPONSE_LENGTH} chars. Use pagination or filter results.]`;
    }

    return {
      content: [{ type: 'text', text: responseText.trim() }],
      isError: !!result.error,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    // Provide contextual hints based on error type
    let hint = '';
    
    // Stale ref handling - refs become invalid after navigation
    if (message.includes('ref') && message.includes('not found')) {
      hint = '\n\n[HINT: Page may have navigated. Refs are stale after navigation. Call snapshot tool to get fresh refs.]';
    }
    // Timeout handling
    else if (message.includes('timeout') || message.includes('Timeout') || error instanceof CodeExecutionTimeoutError) {
      hint = '\n\n[HINT: Operation timed out. Try increasing timeout or check if element exists/is visible.]';
    }
    // Element not visible/clickable
    else if (message.includes('intercept') || message.includes('not visible') || message.includes('hidden')) {
      hint = '\n\n[HINT: Element may be hidden or covered by another element. Try scrolling or closing overlays.]';
    }
    // Connection errors
    else if (message.includes('Target closed') || message.includes('connection') || message.includes('Protocol')) {
      hint = '\n\n[HINT: Browser connection lost. The browser may have been closed - try again to relaunch.]';
    }
    // Navigation errors
    else if (message.includes('net::') || message.includes('ERR_')) {
      hint = '\n\n[HINT: Network error during navigation. Check the URL and network connectivity.]';
    }

    return {
      content: [{ type: 'text', text: `Error executing code: ${message}${hint}` }],
      isError: true,
    };
  }
}
