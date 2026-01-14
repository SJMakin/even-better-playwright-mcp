/**
 * Snapshot tool - captures accessibility snapshot with refs and compression
 */

import { z } from 'zod';
import { getPage, getSnapshot, setLastSnapshot } from '../browser.js';
import { SmartOutlineSimple } from '../utils/smart-outline.js';

export const snapshotSchema = z.object({
  compress: z.boolean().optional().default(true).describe('Whether to compress the snapshot using smart outline'),
});

const SNAPSHOT_DESCRIPTION = `Get compressed accessibility snapshot with ref IDs.

Returns: DOM tree with [ref=e1], [ref=e2] etc.
Use refs with execute tool: await $('e1').click()
Call again after navigation (refs become stale).

Options:
- compress: Enable smart compression (default: true)
  Reduces token usage by ~90% via list folding and wrapper removal.`;

export const snapshotTool = {
  name: 'snapshot',
  description: SNAPSHOT_DESCRIPTION,
  inputSchema: snapshotSchema,
};

export async function handleSnapshot(params: z.infer<typeof snapshotSchema>): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const { compress = true } = params;
  const page = await getPage();
  
  const url = page.url();
  const title = await page.title();
  const rawSnapshot = await getSnapshot(page);

  // Store the raw snapshot for search functionality
  setLastSnapshot(rawSnapshot);

  // Apply compression if enabled
  let snapshot: string;
  if (compress) {
    const outliner = new SmartOutlineSimple();
    snapshot = outliner.generate(rawSnapshot);
  } else {
    snapshot = rawSnapshot;
  }

  const result = [
    `### Page Info`,
    `- URL: ${url}`,
    `- Title: ${title}`,
    ``,
    `### Accessibility Snapshot`,
    snapshot,
  ].join('\n');

  return {
    content: [{ type: 'text', text: result }],
  };
}
