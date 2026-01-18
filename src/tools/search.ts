/**
 * Search tool - search snapshot content with regex
 */

import { z } from 'zod';
import { BrowserManager } from '../browser.js';
import { searchSnapshot } from '../utils/search.js';

export const searchSchema = z.object({
  pattern: z.string().describe('Regex pattern to search for in the snapshot'),
  ignoreCase: z.boolean().optional().default(false).describe('Whether to ignore case when matching'),
  lineLimit: z.number().optional().default(100).describe('Maximum number of lines to return (1-100)'),
});

const SEARCH_DESCRIPTION = `Search current snapshot with regex.

Requires: Call snapshot first.
Returns: Matching lines with refs.

Options:
- pattern: Regex pattern to search for
- ignoreCase: Case-insensitive matching (default: false)
- lineLimit: Max lines to return (default: 100)

Use this to find specific elements in large pages without
re-reading the entire snapshot.`;

export const searchTool = {
  name: 'browser_search_snapshot',
  description: SEARCH_DESCRIPTION,
  inputSchema: searchSchema,
};

export function createSearchHandler(browserManager: BrowserManager) {
  return async function handleSearch(params: z.infer<typeof searchSchema>): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    const { pattern, ignoreCase = false, lineLimit = 100 } = params;

    const snapshot = browserManager.getLastSnapshot();

    if (!snapshot) {
      return {
        content: [{ type: 'text', text: 'No snapshot available. Run the snapshot tool first to capture the page.' }],
      };
    }

    const result = searchSnapshot(snapshot, { pattern, ignoreCase, lineLimit });

    if (result.matchCount === 0) {
      return {
        content: [{ type: 'text', text: `No matches found for pattern: ${pattern}` }],
      };
    }

    const header = result.truncated
      ? `Found ${result.matchCount} matches (showing first ${lineLimit}):`
      : `Found ${result.matchCount} matches:`;

    return {
      content: [{ type: 'text', text: `${header}\n\n${result.result}` }],
    };
  };
}
