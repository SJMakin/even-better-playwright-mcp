/**
 * CDP Session management using Playwright's built-in CDPSession.
 * Simplified wrapper around page.context().newCDPSession(page).
 */

import type { Page, CDPSession } from 'playwright';

// Cache CDP sessions per page to avoid creating multiple sessions
const sessionCache = new WeakMap<Page, CDPSession>();

/**
 * Get or create a CDP session for the given page.
 * Uses Playwright's native CDP support via newCDPSession.
 * 
 * @param page - Playwright Page instance
 * @returns CDP session for the page
 * 
 * @example
 * ```ts
 * const cdp = await getCDPSession(page);
 * await cdp.send('Debugger.enable');
 * ```
 */
export async function getCDPSession(page: Page): Promise<CDPSession> {
  const cached = sessionCache.get(page);
  if (cached) {
    return cached;
  }

  const session = await page.context().newCDPSession(page);
  sessionCache.set(page, session);
  return session;
}

/**
 * Clear the cached CDP session for a page.
 * Call this if you need to create a fresh session.
 */
export function clearCDPSession(page: Page): void {
  sessionCache.delete(page);
}

export type { CDPSession };
