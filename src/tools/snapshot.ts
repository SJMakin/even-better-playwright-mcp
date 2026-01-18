/**
 * Snapshot tool - captures accessibility snapshot with refs and compression
 */

import { z } from 'zod';
import { createPatch } from 'diff';
import { getPage, getSnapshot, setLastSnapshot } from '../browser.js';
import { SmartOutlineSimple } from '../utils/smart-outline.js';

// Store last snapshots for diff functionality
const lastSnapshots = new WeakMap<any, string>();

function isRegExp(value: any): value is RegExp {
  return typeof value === 'object' && value !== null &&
         typeof value.test === 'function' && typeof value.exec === 'function';
}

export const snapshotSchema = z.object({
  compress: z.boolean().optional().default(true).describe('Whether to compress the snapshot using smart outline'),
  search: z.union([z.string(), z.instanceof(RegExp)]).optional().describe('Search pattern (string or regex) to filter snapshot results'),
  showDiff: z.boolean().optional().default(false).describe('Show diff since last snapshot call'),
});

const SNAPSHOT_DESCRIPTION = `Get compressed accessibility snapshot with ref IDs.

Returns: DOM tree with [ref=e1], [ref=e2] etc.
Use refs with execute tool: await $('e1').click()
Call again after navigation (refs become stale).

Options:
- compress: Enable smart compression (default: true)
  Reduces token usage by ~90% via list folding and wrapper removal.
- search: Search pattern (string or regex) to filter results with context
- showDiff: Show changes since last snapshot (useful for tracking page updates)`;

export const snapshotTool = {
  name: 'snapshot',
  description: SNAPSHOT_DESCRIPTION,
  inputSchema: snapshotSchema,
};

export async function handleSnapshot(params: z.infer<typeof snapshotSchema>): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const { compress = true, search, showDiff = false } = params;
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

  // Sanitize to remove unpaired surrogates
  snapshot = snapshot.toWellFormed?.() ?? snapshot;

  // Handle diff mode
  if (showDiff) {
    const previousSnapshot = lastSnapshots.get(page);

    if (!previousSnapshot) {
      lastSnapshots.set(page, snapshot);
      return {
        content: [{ type: 'text', text: 'No previous snapshot available. This is the first snapshot for this page. Full snapshot stored for next diff.' }],
      };
    }

    const patch = createPatch('snapshot', previousSnapshot, snapshot, 'previous', 'current', {
      context: 3,
    });

    lastSnapshots.set(page, snapshot);

    if (patch.split('\n').length <= 4) {
      return {
        content: [{ type: 'text', text: 'No changes detected since last snapshot' }],
      };
    }

    return {
      content: [{ type: 'text', text: `### Snapshot Diff\n\n${patch}` }],
    };
  }

  // Store for future diffs
  lastSnapshots.set(page, snapshot);

  // Handle search mode
  if (search) {
    const lines = snapshot.split('\n');
    const matchIndices: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let isMatch = false;

      if (isRegExp(search)) {
        isMatch = search.test(line);
      } else {
        isMatch = line.includes(search as string);
      }

      if (isMatch) {
        matchIndices.push(i);
        if (matchIndices.length >= 10) break;
      }
    }

    if (matchIndices.length === 0) {
      return {
        content: [{ type: 'text', text: `No matches found for: ${search}` }],
      };
    }

    // Collect lines with 5 lines of context
    const CONTEXT_LINES = 5;
    const includedLines = new Set<number>();

    for (const idx of matchIndices) {
      const start = Math.max(0, idx - CONTEXT_LINES);
      const end = Math.min(lines.length - 1, idx + CONTEXT_LINES);
      for (let i = start; i <= end; i++) {
        includedLines.add(i);
      }
    }

    // Build result with separators
    const sortedIndices = [...includedLines].sort((a, b) => a - b);
    const result: string[] = [`### Search Results (${matchIndices.length} matches)\n`];

    for (let i = 0; i < sortedIndices.length; i++) {
      const lineIdx = sortedIndices[i];
      if (i > 0 && sortedIndices[i - 1] !== lineIdx - 1) {
        result.push('---');
      }
      result.push(lines[lineIdx]);
    }

    return {
      content: [{ type: 'text', text: result.join('\n') }],
    };
  }

  // Regular snapshot
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
