/**
 * Clean HTML utility for getting LLM-friendly HTML with search/diff
 * Simplified version inspired by playwriter's formatHtmlForPrompt
 */

import type { Page, Locator } from 'playwright';
import { createPatch } from 'diff';

export interface GetCleanHTMLOptions {
  locator: Locator | Page;
  search?: string | RegExp;
  showDiffSinceLastCall?: boolean;
  maxContentLen?: number;
}

// Store last HTML snapshots per locator/page for diffing
const lastHtmlSnapshots: WeakMap<Page, Map<string, string>> = new WeakMap();

function isPage(obj: any): obj is Page {
  return obj && typeof obj.content === 'function' && typeof obj.goto === 'function';
}

function isRegExp(value: any): value is RegExp {
  return typeof value === 'object' && value !== null &&
         typeof value.test === 'function' && typeof value.exec === 'function';
}

function getSnapshotKey(locator: Locator | Page): string {
  if (isPage(locator)) {
    return '__page__';
  }
  // For locators, use a string representation
  return (locator as any)._selector || '__locator__';
}

/**
 * Basic HTML cleaning - removes scripts, styles, and cleans up whitespace
 */
function cleanHtml(html: string, maxContentLen: number): string {
  // Remove script and style tags with their content
  let cleaned = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Remove comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

  // Truncate very long text content (but keep tags intact)
  if (maxContentLen > 0) {
    cleaned = cleaned.replace(/>([^<]{500,})</g, (match, content) => {
      const truncated = content.slice(0, maxContentLen);
      const remaining = content.length - maxContentLen;
      return `>${truncated}...(${remaining} more chars)<`;
    });
  }

  // Clean up excessive whitespace
  cleaned = cleaned.replace(/\s+/g, ' ');
  cleaned = cleaned.replace(/>\s+</g, '>\n<');

  return cleaned.trim();
}

/**
 * Get cleaned HTML from page or locator with search and diff capabilities
 */
export async function getCleanHTML(options: GetCleanHTMLOptions): Promise<string> {
  const {
    locator,
    search,
    showDiffSinceLastCall = false,
    maxContentLen = 500,
  } = options;

  // Get raw HTML
  let rawHtml: string;
  let page: Page;

  if (isPage(locator)) {
    page = locator;
    rawHtml = await locator.content();
  } else {
    page = locator.page();
    rawHtml = await locator.innerHTML();
  }

  // Clean the HTML
  const cleanedHtml = cleanHtml(rawHtml, maxContentLen);

  // Sanitize to remove unpaired surrogates that break JSON encoding
  let htmlStr = cleanedHtml.toWellFormed?.() ?? cleanedHtml;

  // Handle diffing
  if (showDiffSinceLastCall) {
    let pageSnapshots = lastHtmlSnapshots.get(page);
    if (!pageSnapshots) {
      pageSnapshots = new Map();
      lastHtmlSnapshots.set(page, pageSnapshots);
    }

    const snapshotKey = getSnapshotKey(locator);
    const previousSnapshot = pageSnapshots.get(snapshotKey);

    if (!previousSnapshot) {
      pageSnapshots.set(snapshotKey, htmlStr);
      return 'No previous snapshot available. This is the first call for this locator. Full snapshot stored for next diff.';
    }

    const patch = createPatch('html', previousSnapshot, htmlStr, 'previous', 'current', {
      context: 3,
    });

    pageSnapshots.set(snapshotKey, htmlStr);

    if (patch.split('\n').length <= 4) {
      return 'No changes detected since last snapshot';
    }
    return patch;
  }

  // Store snapshot for future diffs
  let pageSnapshots = lastHtmlSnapshots.get(page);
  if (!pageSnapshots) {
    pageSnapshots = new Map();
    lastHtmlSnapshots.set(page, pageSnapshots);
  }
  pageSnapshots.set(getSnapshotKey(locator), htmlStr);

  // Handle search
  if (search) {
    const lines = htmlStr.split('\n');
    const matchIndices: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let isMatch = false;

      if (isRegExp(search)) {
        isMatch = search.test(line);
      } else {
        isMatch = line.includes(search);
      }

      if (isMatch) {
        matchIndices.push(i);
        if (matchIndices.length >= 10) break;
      }
    }

    if (matchIndices.length === 0) {
      return 'No matches found';
    }

    // Collect lines with 5 lines of context above and below each match
    const CONTEXT_LINES = 5;
    const includedLines = new Set<number>();

    for (const idx of matchIndices) {
      const start = Math.max(0, idx - CONTEXT_LINES);
      const end = Math.min(lines.length - 1, idx + CONTEXT_LINES);
      for (let i = start; i <= end; i++) {
        includedLines.add(i);
      }
    }

    // Build result with separators between non-contiguous sections
    const sortedIndices = [...includedLines].sort((a, b) => a - b);
    const result: string[] = [];

    for (let i = 0; i < sortedIndices.length; i++) {
      const lineIdx = sortedIndices[i];
      if (i > 0 && sortedIndices[i - 1] !== lineIdx - 1) {
        result.push('---');
      }
      result.push(lines[lineIdx]);
    }

    return result.join('\n');
  }

  return htmlStr;
}
