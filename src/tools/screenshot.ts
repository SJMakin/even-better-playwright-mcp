/**
 * Screenshot tool - captures page screenshot as base64
 */

import { z } from 'zod';
import { BrowserManager } from '../browser.js';
import { showAriaRefLabels, hideAriaRefLabels } from '../visual/index.js';

export const screenshotSchema = z.object({
  ref: z.string().optional().describe('Element ref from snapshot to screenshot. If not provided, screenshots the viewport.'),
  fullPage: z.boolean().optional().describe('Take full page screenshot instead of viewport.'),
  withLabels: z.boolean().optional().describe('Show Vimium-style ref labels on interactive elements in the screenshot.'),
});

const SCREENSHOT_DESCRIPTION = `Capture page screenshot.

Options:
- ref: Screenshot specific element by ref (e.g., 'e5')
- fullPage: Capture entire scrollable area
- withLabels: Show Vimium-style ref labels on interactive elements

When withLabels is used, labels are color-coded by role:
- Yellow: links
- Orange: buttons
- Coral: text inputs
- Pink: checkboxes/radios
- Blue: images/videos`;

export const screenshotTool = {
  name: 'screenshot',
  description: SCREENSHOT_DESCRIPTION,
  inputSchema: screenshotSchema,
};

export function createScreenshotHandler(browserManager: BrowserManager) {
  return async function handleScreenshot(params: z.infer<typeof screenshotSchema>): Promise<{
    content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>;
  }> {
    const page = await browserManager.getPage();

    let buffer: Buffer;
    let description: string;
    let snapshot: string | undefined;

    // Show labels if requested (only for viewport/fullPage, not element screenshots)
    if (params.withLabels && !params.ref) {
      const result = await showAriaRefLabels({ page });
      snapshot = result.snapshot;
    }

    try {
      if (params.ref) {
        // Screenshot specific element by ref
        const locator = await browserManager.refLocator(page, { ref: params.ref });
        buffer = await locator.screenshot({ type: 'png' });
        description = `Screenshot of element [ref=${params.ref}]`;
      } else if (params.fullPage) {
        // Full page screenshot
        buffer = await page.screenshot({ type: 'png', fullPage: true });
        description = params.withLabels
          ? 'Full page screenshot with ref labels'
          : 'Full page screenshot';
      } else {
        // Viewport screenshot
        buffer = await page.screenshot({ type: 'png' });
        description = params.withLabels
          ? 'Viewport screenshot with ref labels'
          : 'Viewport screenshot';
      }
    } finally {
      // Always hide labels after screenshot
      if (params.withLabels && !params.ref) {
        await hideAriaRefLabels({ page });
      }
    }

    const base64 = buffer.toString('base64');

    const content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [
      { type: 'text', text: description },
      { type: 'image', data: base64, mimeType: 'image/png' },
    ];

    // Include snapshot if labels were shown
    if (snapshot) {
      content.push({
        type: 'text',
        text: `\n### Accessibility Snapshot\n${snapshot}`
      });
    }

    return { content };
  };
}
