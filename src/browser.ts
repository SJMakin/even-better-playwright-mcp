/**
 * Browser/context management for even-better-playwright-mcp
 */

import {
  chromium,
  firefox,
  webkit,
  Browser,
  BrowserContext,
  Page,
  type LaunchOptions,
  type BrowserContextOptions,
} from 'playwright';
import { setupPageConsoleListener } from './utils/browser-logs.js';
import { NetworkCapture } from './utils/network-capture.js';

/**
 * Get accessibility snapshot from Playwright's internal API.
 * Standalone utility function that can be used without BrowserManager.
 */
export async function getAccessibilitySnapshot(page: Page): Promise<string> {
  // Use Playwright's internal _snapshotForAI method
  // Returns { full: string, incremental: string }
  const result = await (page as any)._snapshotForAI();
  return result.full;
}

/**
 * Browser configuration options
 */
export interface BrowserConfig {
  browser?: 'chromium' | 'firefox' | 'webkit';
  headless?: boolean;
  cdpEndpoint?: string;
  userDataDir?: string;
  isolated?: boolean;              // Force ephemeral context (overrides userDataDir)
  launchOptions?: LaunchOptions;   // Pass-through to Playwright launch
  contextOptions?: BrowserContextOptions; // Pass-through to Playwright context
}

interface BrowserState {
  browser: Browser | null;
  context: BrowserContext | null;
  page: Page | null;
  lastSnapshot: string | null;
  config: BrowserConfig;
}

export class BrowserManager {
  private state: BrowserState;
  private userState: Record<string, unknown>;
  private config: BrowserConfig;
  private lastSnapshots: WeakMap<Page, string>;      // Per-page snapshot tracking
  private browserLogs: Map<string, string[]>;         // Browser console logs
  private networkCaptureInstance: NetworkCapture | null;  // Network request capture

  constructor(config?: BrowserConfig) {
    // Validate and normalize config
    this.config = { ...config };

    // Warn if isolated + userDataDir both set
    if (this.config.isolated && this.config.userDataDir) {
      console.warn('[BrowserManager] isolated: true overrides userDataDir setting');
      delete this.config.userDataDir;
    }

    this.state = {
      browser: null,
      context: null,
      page: null,
      lastSnapshot: null,
      config: this.config,
    };
    this.userState = {};
    this.lastSnapshots = new WeakMap();
    this.browserLogs = new Map();
    this.networkCaptureInstance = null;
  }

  /**
   * Get browser launcher based on config
   */
  private getBrowserType() {
    switch (this.config.browser) {
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
  async launchBrowser(): Promise<Page> {
    if (this.state.page) {
      return this.state.page;
    }

    const browserType = this.getBrowserType();
    const config = this.config;

    // Three paths:
    // 1. Connect via CDP to existing browser
    if (config.cdpEndpoint) {
      this.state.browser = await browserType.connectOverCDP(config.cdpEndpoint);
      const contexts = this.state.browser.contexts();
      this.state.context = contexts[0] || await this.state.browser.newContext({
        viewport: { width: 1280, height: 720 },
        ...config.contextOptions,
      });
      const pages = this.state.context.pages();
      this.state.page = pages[0] || await this.state.context.newPage();

      // Set up console listener for existing pages
      pages.forEach(page => setupPageConsoleListener(page, this.browserLogs));

      // Set up console listener for future pages
      this.state.context.on('page', (page) => setupPageConsoleListener(page, this.browserLogs));
    }
    // 2. Persistent context with user data directory (if not isolated)
    else if (config.userDataDir && !config.isolated) {
      const launchOptions: Parameters<typeof browserType.launchPersistentContext>[1] = {
        headless: config.headless ?? false,
        viewport: { width: 1280, height: 720 },
        ...config.launchOptions,
        ...config.contextOptions,
      };

      this.state.context = await browserType.launchPersistentContext(
        config.userDataDir,
        launchOptions
      );
      this.state.browser = null; // Persistent context doesn't expose browser
      this.state.page = this.state.context.pages()[0] || await this.state.context.newPage();

      setupPageConsoleListener(this.state.page, this.browserLogs);
      this.state.context.on('page', (page) => setupPageConsoleListener(page, this.browserLogs));
    }
    // 3. Standard launch (new browser instance / isolated mode)
    else {
      this.state.browser = await browserType.launch({
        headless: config.headless ?? false,
        ...config.launchOptions,
      });
      this.state.context = await this.state.browser.newContext({
        viewport: { width: 1280, height: 720 },
        ...config.contextOptions,
      });
      this.state.page = await this.state.context.newPage();

      setupPageConsoleListener(this.state.page, this.browserLogs);
      this.state.context.on('page', (page) => setupPageConsoleListener(page, this.browserLogs));
    }

    // Set reasonable timeouts
    this.state.page.setDefaultNavigationTimeout(60000);
    this.state.page.setDefaultTimeout(5000);

    return this.state.page;
  }

  /**
   * Get current page, launching browser if needed
   */
  async getPage(): Promise<Page> {
    if (!this.state.page) {
      return this.launchBrowser();
    }
    return this.state.page;
  }

  /**
   * Get current browser context
   */
  async getContext(): Promise<BrowserContext | null> {
    return this.state.context;
  }

  /**
   * Get browser instance
   */
  async getBrowser(): Promise<Browser | null> {
    return this.state.browser;
  }

  /**
   * Get persistent user state object.
   * State persists across execute calls but resets on browser restart.
   */
  getUserState(): Record<string, unknown> {
    return this.userState;
  }

  /**
   * Clear all user state
   */
  clearUserState(): void {
    Object.keys(this.userState).forEach((key) => delete this.userState[key]);
  }

  /**
   * Store the last captured snapshot for search (global)
   */
  setLastSnapshot(snapshot: string): void {
    this.state.lastSnapshot = snapshot;
  }

  /**
   * Get the last captured snapshot (global)
   */
  getLastSnapshot(): string | null {
    return this.state.lastSnapshot;
  }

  /**
   * Get last snapshot for a specific page
   */
  getLastSnapshotForPage(page: Page): string | null {
    return this.lastSnapshots.get(page) || null;
  }

  /**
   * Set last snapshot for a specific page
   */
  setLastSnapshotForPage(page: Page, snapshot: string): void {
    this.lastSnapshots.set(page, snapshot);
  }

  /**
   * Get the browser logs Map
   */
  getBrowserLogs(): Map<string, string[]> {
    return this.browserLogs;
  }

  /**
   * Get or create network capture instance
   */
  getNetworkCapture(): NetworkCapture {
    if (!this.networkCaptureInstance) {
      this.networkCaptureInstance = new NetworkCapture();
    }
    return this.networkCaptureInstance;
  }

  /**
   * Get snapshot for AI using Playwright's internal API
   * Returns accessibility snapshot with refs like [ref=e1]
   */
  async getSnapshot(page: Page): Promise<string> {
    return getAccessibilitySnapshot(page);
  }

  /**
   * Get locator for element by aria ref
   * The ref system uses aria-ref selector engine built into Playwright
   */
  getRefLocator(page: Page, ref: string) {
    return page.locator(`aria-ref=${ref}`);
  }

  /**
   * Validate that a ref exists in snapshot and return locator
   */
  async refLocator(
    page: Page,
    params: { ref: string; element?: string }
  ): Promise<ReturnType<Page['locator']>> {
    const snapshot = await this.getSnapshot(page);

    if (!snapshot.includes(`[ref=${params.ref}]`)) {
      throw new Error(
        `Ref ${params.ref} not found in the current page snapshot. Try capturing a new snapshot.`
      );
    }

    const locator = this.getRefLocator(page, params.ref);

    if (params.element) {
      return locator.describe(params.element);
    }

    return locator;
  }

  /**
   * Close browser and cleanup
   */
  async close(): Promise<void> {
    // Stop network capture if active
    if (this.networkCaptureInstance) {
      this.networkCaptureInstance.stop();
    }

    // Close browser or context
    if (this.state.browser) {
      await this.state.browser.close();
    } else if (this.state.context) {
      // Close persistent context
      await this.state.context.close();
    }

    // Clear state
    this.state.browser = null;
    this.state.context = null;
    this.state.page = null;
    this.state.lastSnapshot = null;

    // Clear user state on browser restart
    this.clearUserState();

    // Clear browser logs
    this.browserLogs.clear();
  }
}
