/**
 * Browser/context management for even-better-playwright-mcp
 */

import { chromium, firefox, webkit, Browser, BrowserContext, Page } from 'playwright';
import { setupPageConsoleListener } from './utils/browser-logs.js';

/**
 * Browser configuration options
 */
export interface BrowserConfig {
  browser?: 'chromium' | 'firefox' | 'webkit';
  headless?: boolean;
  cdpEndpoint?: string;
  userDataDir?: string;
}

interface BrowserState {
  browser: Browser | null;
  context: BrowserContext | null;
  page: Page | null;
  lastSnapshot: string | null;
  config: BrowserConfig;
}

const state: BrowserState = {
  browser: null,
  context: null,
  page: null,
  lastSnapshot: null,
  config: {},
};

/**
 * User state that persists across execute calls.
 * Reset on browser restart.
 */
const userState: Record<string, unknown> = {};

/**
 * Set browser configuration (call before launching browser)
 */
export function setBrowserConfig(config: BrowserConfig): void {
  state.config = config;
}

/**
 * Get browser launcher based on config
 */
function getBrowserType() {
  switch (state.config.browser) {
    case 'firefox':
      return firefox;
    case 'webkit':
      return webkit;
    case 'chromium':
    default:
      return chromium;
  }
}

/**
 * Launch browser and create context/page
 */
export async function launchBrowser(): Promise<Page> {
  if (state.page) {
    return state.page;
  }

  const browserType = getBrowserType();
  const config = state.config;

  // Connect to existing browser via CDP or launch new
  if (config.cdpEndpoint) {
    state.browser = await browserType.connectOverCDP(config.cdpEndpoint);
    const contexts = state.browser.contexts();
    state.context = contexts[0] || await state.browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const pages = state.context.pages();
    state.page = pages[0] || await state.context.newPage();

    // Set up console listener for existing pages
    pages.forEach(setupPageConsoleListener);

    // Set up console listener for future pages
    state.context.on('page', setupPageConsoleListener);
  } else {
    // Launch new browser
    const launchOptions: Parameters<typeof browserType.launchPersistentContext>[1] = {
      headless: config.headless ?? false,
      viewport: { width: 1280, height: 720 },
    };

    if (config.userDataDir) {
      // Use persistent context with user data directory
      state.context = await browserType.launchPersistentContext(
        config.userDataDir,
        launchOptions
      );
      state.browser = null; // Persistent context doesn't expose browser
      state.page = state.context.pages()[0] || await state.context.newPage();
    } else {
      // Standard launch
      state.browser = await browserType.launch({
        headless: config.headless ?? false,
      });
      state.context = await state.browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      state.page = await state.context.newPage();
    }

    // Set up console listener for the page
    setupPageConsoleListener(state.page);

    // Set up console listener for future pages
    state.context.on('page', setupPageConsoleListener);
  }
  
  // Set reasonable timeouts
  state.page.setDefaultNavigationTimeout(60000);
  state.page.setDefaultTimeout(5000);

  return state.page;
}

/**
 * Get current page, launching browser if needed
 */
export async function getPage(): Promise<Page> {
  if (!state.page) {
    return launchBrowser();
  }
  return state.page;
}

/**
 * Get current browser context
 */
export function getContext(): BrowserContext | null {
  return state.context;
}

/**
 * Get browser instance
 */
export function getBrowser(): Browser | null {
  return state.browser;
}

/**
 * Close browser and cleanup
 */
export async function closeBrowser(): Promise<void> {
  if (state.browser) {
    await state.browser.close();
    state.browser = null;
    state.context = null;
    state.page = null;
    state.lastSnapshot = null;
    // Clear user state on browser restart
    clearUserState();
  }
}

/**
 * Get persistent user state object.
 * State persists across execute calls but resets on browser restart.
 */
export function getUserState(): Record<string, unknown> {
  return userState;
}

/**
 * Clear all user state
 */
export function clearUserState(): void {
  Object.keys(userState).forEach((key) => delete userState[key]);
}

/**
 * Store the last captured snapshot for search
 */
export function setLastSnapshot(snapshot: string): void {
  state.lastSnapshot = snapshot;
}

/**
 * Get the last captured snapshot
 */
export function getLastSnapshot(): string | null {
  return state.lastSnapshot;
}

/**
 * Get snapshot for AI using Playwright's internal API
 * Returns accessibility snapshot with refs like [ref=e1]
 */
export async function getSnapshot(page: Page): Promise<string> {
  // Use Playwright's internal _snapshotForAI method
  // Returns { full: string, incremental: string }
  const result = await (page as any)._snapshotForAI();
  return result.full;
}

/**
 * Get locator for element by aria ref
 * The ref system uses aria-ref selector engine built into Playwright
 */
export function getRefLocator(page: Page, ref: string) {
  return page.locator(`aria-ref=${ref}`);
}

/**
 * Validate that a ref exists in snapshot and return locator
 */
export async function refLocator(
  page: Page, 
  params: { ref: string; element?: string }
): Promise<ReturnType<Page['locator']>> {
  const snapshot = await getSnapshot(page);
  
  if (!snapshot.includes(`[ref=${params.ref}]`)) {
    throw new Error(
      `Ref ${params.ref} not found in the current page snapshot. Try capturing a new snapshot.`
    );
  }
  
  const locator = getRefLocator(page, params.ref);
  
  if (params.element) {
    return locator.describe(params.element);
  }
  
  return locator;
}
