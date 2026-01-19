/**
 * Execute tool - runs arbitrary Playwright code in a sandboxed VM
 * "God mode" tool with full Playwright API access
 */

import { z } from 'zod';
import { BrowserManager } from '../browser.js';
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
- \`context\` - Browser context, access all pages via context.pages()
- \`state\` - Persistent object across calls (e.g., state.myPage = await context.newPage())
- \`$('e5')\` - Shorthand for page.locator('aria-ref=e5')
- \`accessibilitySnapshot()\` - Get current page snapshot
- \`require\` - Load Node.js modules (path, url, crypto, buffer, util, assert, os, fs)
- Node.js globals: setTimeout, setInterval, fetch, URL, Buffer, crypto, etc.

## Rules
- **Multiple calls**: Use multiple execute calls for complex logic - helps understand intermediate state and isolate failures
- **Never close**: Never call browser.close() or context.close(). Only close pages you created or if user asks
- **No bringToFront**: Never call unless user asks - it's disruptive and unnecessary
- **Check state after actions**: Always verify page state after clicking/submitting (see next section)
- **Clean up listeners**: Call page.removeAllListeners() at end to prevent leaks
- **Wait for load**: Use page.waitForLoadState('domcontentloaded') not page.waitForEvent('load') - waitForEvent times out if already loaded
- **Avoid timeouts**: Prefer proper waits over page.waitForTimeout() - there are better ways

## Checking Page State
After any action (click, submit, navigate), verify what happened:
\`\`\`js
console.log('url:', page.url()); console.log(await accessibilitySnapshot().then(x => x.split('\\n').slice(0, 30).join('\\n')));
\`\`\`
For visually complex pages (grids, galleries, dashboards), use screenshotWithAccessibilityLabels({ page }) instead.

## Accessibility Snapshots
\`\`\`js
await accessibilitySnapshot()  // Full snapshot
await accessibilitySnapshot({ search: /button|submit/i })  // Filter results
await accessibilitySnapshot({ showDiffSinceLastCall: true })  // Show changes
\`\`\`

Example output:
\`\`\`
- banner [ref=e3]:
    - link "Home" [ref=e5] [cursor=pointer]:
        - /url: /
    - navigation [ref=e12]:
        - link "Docs" [ref=e13] [cursor=pointer]
\`\`\`

Use aria-ref to interact - **NO quotes around the ref value**:
\`\`\`js
await page.locator('aria-ref=e13').click()  // or: await $('e13').click()
\`\`\`

For pagination: \`(await accessibilitySnapshot()).split('\\n').slice(0, 50).join('\\n')\`

**Choosing snapshot method:**
- Use \`accessibilitySnapshot\` for simple pages, text search, token efficiency
- Use \`screenshotWithAccessibilityLabels\` for complex visual layouts, spatial position matters

## Selector Best Practices
For unknown sites: use accessibilitySnapshot() with aria-ref
For development (with source access), prefer:
1. \`[data-testid="submit"]\` - explicit test attributes
2. \`getByRole('button', { name: 'Save' })\` - semantic
3. \`getByText('Sign in')\`, \`getByLabel('Email')\` - user-facing
4. \`input[name="email"]\` - semantic HTML
5. Avoid: classes/IDs that change frequently

If locator matches multiple elements (strict mode violation), use \`.first()\`, \`.last()\`, or \`.nth(n)\`:
\`\`\`js
await page.locator('button').first().click()
await page.locator('li').nth(3).click()  // 4th item (0-indexed)
\`\`\`

## Working with Pages
\`\`\`js
const pages = context.pages().filter(x => x.url().includes('localhost'));
state.newPage = await context.newPage(); await state.newPage.goto('https://example.com');
\`\`\`

## Navigation
\`\`\`js
await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });
await waitForPageLoad({ page, timeout: 5000 });
\`\`\`

## Common Patterns
**Popups**: \`const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('a[target=_blank]')]); await popup.waitForLoadState();\`
**Downloads**: \`const [download] = await Promise.all([page.waitForEvent('download'), page.click('button.download')]); await download.saveAs('/tmp/' + download.suggestedFilename());\`
**iFrames**: \`const frame = page.frameLocator('#my-iframe'); await frame.locator('button').click();\`
**Dialogs**: \`page.on('dialog', async d => { await d.accept(); }); await page.click('button');\`
**Load files**: \`const fs = require('fs'); const content = fs.readFileSync('./data.txt', 'utf-8'); await page.locator('textarea').fill(content);\`

## page.evaluate
Code inside page.evaluate() runs in the browser - use plain JavaScript only. console.log inside evaluate runs in browser, not visible here:
\`\`\`js
const title = await page.evaluate(() => document.title);
console.log('Title:', title);  // Log outside evaluate
\`\`\`

## Utility Functions
- \`getLatestLogs({ page?, count?, search? })\` - Get browser console logs
- \`getCleanHTML({ locator, search?, showDiffSinceLastCall?, includeStyles? })\` - Get cleaned HTML
- \`waitForPageLoad({ page, timeout? })\` - Smart load detection (ignores analytics/ads)
- \`getCDPSession()\` - Get CDP session for raw Chrome DevTools Protocol commands
- \`getLocatorStringForElement(locator)\` - Get stable selector from ephemeral aria-ref
- \`getReactSource({ locator })\` - Get React component source location (dev mode only)
- \`getStylesForLocator({ locator, cdp })\` - Inspect CSS styles (read styles-api resource first)
- \`createDebugger({ cdp })\` - Set breakpoints, step through code (read debugger-api resource first)
- \`createEditor({ cdp })\` - View/edit page scripts and CSS (read editor-api resource first)
- \`screenshotWithAccessibilityLabels({ page })\` - Screenshot with Vimium-style visual labels (yellow=links, orange=buttons, coral=inputs)

## Network Interception
For scraping/reverse-engineering APIs, intercept network instead of scrolling DOM:
\`\`\`js
state.requests = []; state.responses = [];
page.on('request', req => { if (req.url().includes('/api/')) state.requests.push({ url: req.url(), method: req.method(), headers: req.headers() }); });
page.on('response', async res => { if (res.url().includes('/api/')) { try { state.responses.push({ url: res.url(), status: res.status(), body: await res.json() }); } catch {} } });
\`\`\`
Then trigger actions and analyze: \`console.log('Captured', state.responses.length, 'API calls');\`
Clean up when done: \`page.removeAllListeners('request'); page.removeAllListeners('response');\`

IMPORTANT: After navigation, refs are stale - call snapshot tool again.`;

export const executeTool = {
  name: 'browser_execute',
  description: EXECUTE_DESCRIPTION,
  inputSchema: executeSchema,
};

const MAX_RESPONSE_LENGTH = 6000;

export function createExecuteHandler(browserManager: BrowserManager) {
  return async function handleExecute(params: z.infer<typeof executeSchema>): Promise<{
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
  }> {
    const { code, timeout } = params;

    try {
      const page = await browserManager.getPage();
      const context = await browserManager.getContext();

      if (!context) {
        throw new Error('Browser context not available');
      }

      const result = await executeInVM(code, {
        page,
        context,
        browserManager,
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
  };
}
