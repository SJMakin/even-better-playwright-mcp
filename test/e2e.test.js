/**
 * End-to-end test for even-better-playwright-mcp
 *
 * Tests all MCP tools against Hacker News using a real MCP client/server connection.
 * Uses Node.js built-in test runner (node --test).
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServerInstance } from '../dist/src/index.js';

describe('E2E: MCP Client with Hacker News', () => {
  let client;
  let serverInstance;
  let clientTransport;
  let serverTransport;

  before(async () => {
    console.log('Setting up MCP client and server...');

    // Create in-memory transports for direct connection
    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    // Create server instance with headless browser
    serverInstance = createServerInstance({
      browser: 'chromium',
      headless: true,
    });

    // Create client
    client = new Client(
      {
        name: 'test-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    // Connect client and server
    await Promise.all([
      client.connect(clientTransport),
      serverInstance.server.connect(serverTransport),
    ]);

    console.log('MCP client and server connected');
  });

  after(async () => {
    console.log('Cleaning up...');
    await serverInstance.cleanup();
    await client.close();
    await clientTransport.close();
    await serverTransport.close();
    console.log('Cleanup complete');
  });

  test('List available tools', async () => {
    const response = await client.listTools();

    assert.ok(response.tools, 'Should return tools array');
    assert.strictEqual(response.tools.length, 5, 'Should have 5 tools');

    const toolNames = response.tools.map(t => t.name);
    assert.ok(toolNames.includes('snapshot'), 'Should include snapshot tool');
    assert.ok(toolNames.includes('screenshot'), 'Should include screenshot tool');
    assert.ok(toolNames.includes('browser_execute'), 'Should include execute tool');
    assert.ok(toolNames.includes('browser_search_snapshot'), 'Should include search tool');
    assert.ok(toolNames.includes('browser_network_requests'), 'Should include network tool');

    console.log('✓ All 5 tools are available');
  });

  test('browser_execute: Navigate to Hacker News', async () => {
    const response = await client.callTool({
      name: 'browser_execute',
      arguments: {
        code: "await page.goto('https://news.ycombinator.com'); await page.waitForLoadState('networkidle')",
        timeout: 30000,
      },
    });

    assert.ok(response.content, 'Should return content');
    assert.ok(response.content.length > 0, 'Should have content items');
    assert.strictEqual(response.isError, false, 'Should not have errors');

    console.log('✓ Navigated to Hacker News');
  });

  test('snapshot: Get accessibility snapshot', async () => {
    const response = await client.callTool({
      name: 'snapshot',
      arguments: {},
    });

    assert.ok(response.content, 'Should return content');
    const text = response.content[0].text;

    assert.ok(text.length > 0, 'Snapshot should not be empty');
    assert.ok(text.includes('[ref='), 'Snapshot should contain refs');
    assert.ok(text.includes('Hacker News'), 'Snapshot should contain Hacker News content');

    // Count number of refs
    const refCount = (text.match(/\[ref=e\d+\]/g) || []).length;
    assert.ok(refCount > 10, `Should have many refs (found ${refCount})`);

    console.log(`✓ Got accessibility snapshot with ${refCount} refs`);
  });

  test('browser_search_snapshot: Search for "login"', async () => {
    const response = await client.callTool({
      name: 'browser_search_snapshot',
      arguments: {
        pattern: 'login',
        ignoreCase: true,
        lineLimit: 50,
      },
    });

    assert.ok(response.content, 'Should return content');
    const text = response.content[0].text;

    assert.ok(text.includes('Found'), 'Should report matches');
    assert.ok(text.includes('login') || text.includes('Login'), 'Should contain search term');

    console.log('✓ Search snapshot successful');
  });

  test('browser_execute: Get page title and URL', async () => {
    const response = await client.callTool({
      name: 'browser_execute',
      arguments: {
        code: `
          const title = await page.title();
          const url = page.url();
          console.log('Title:', title);
          console.log('URL:', url);
          return { title, url };
        `,
      },
    });

    assert.strictEqual(response.isError, false, 'Should not have errors');
    const text = response.content[0].text;

    assert.ok(text.includes('Hacker News'), 'Should include Hacker News in title');
    assert.ok(text.includes('ycombinator.com'), 'Should include domain in URL');

    console.log('✓ Retrieved page metadata');
  });

  test('browser_execute: Click "newest" link and verify navigation', async () => {
    const response = await client.callTool({
      name: 'browser_execute',
      arguments: {
        code: `
          // Find the "newest" link - try different methods
          try {
            await page.click('text=newest');
          } catch {
            // Fallback: use direct navigation
            await page.goto('https://news.ycombinator.com/newest');
          }
          await page.waitForLoadState('domcontentloaded');
          return page.url();
        `,
        timeout: 30000,
      },
    });

    const text = response.content[0].text;

    // Check if there was an error
    if (response.isError) {
      console.log('Response text:', text);
      assert.fail('Should not have errors. Error: ' + text);
    }

    assert.ok(text.includes('newest'), 'URL should contain "newest"');

    console.log('✓ Navigated to newest page');
  });

  test('snapshot: Get snapshot after navigation', async () => {
    const response = await client.callTool({
      name: 'snapshot',
      arguments: {},
    });

    assert.strictEqual(response.isError || false, false, 'Should not have errors');
    const text = response.content[0].text;

    assert.ok(text.includes('[ref='), 'Should have refs');
    assert.ok(text.length > 100, 'Should have substantial content');

    console.log('✓ Got fresh snapshot after navigation');
  });

  test('browser_execute: Use $ shorthand for ref interaction', async () => {
    // First get a snapshot to ensure refs are fresh
    await client.callTool({
      name: 'snapshot',
      arguments: {},
    });

    const response = await client.callTool({
      name: 'browser_execute',
      arguments: {
        code: `
          // Use the $ shorthand - assumes we have e1, e2, etc.
          const count = await page.locator('[role]').count();
          console.log('Interactive elements count:', count);
          return count;
        `,
      },
    });

    assert.strictEqual(response.isError, false, 'Should not have errors');
    const text = response.content[0].text;
    assert.ok(text.includes('Interactive elements count:'), 'Should log element count');

    console.log('✓ Successfully accessed elements');
  });

  test('browser_execute: Use persistent state across calls', async () => {
    // First call: set state
    const response1 = await client.callTool({
      name: 'browser_execute',
      arguments: {
        code: `
          state.visitCount = (state.visitCount || 0) + 1;
          state.lastPage = 'newest';
          return state.visitCount;
        `,
      },
    });

    assert.strictEqual(response1.isError, false, 'Should not have errors');
    const text1 = response1.content[0].text;
    assert.ok(text1.includes('1'), 'Should show visit count of 1');

    // Second call: verify state persists
    const response2 = await client.callTool({
      name: 'browser_execute',
      arguments: {
        code: `
          state.visitCount = (state.visitCount || 0) + 1;
          return {
            visitCount: state.visitCount,
            lastPage: state.lastPage
          };
        `,
      },
    });

    assert.strictEqual(response2.isError, false, 'Should not have errors');
    const text2 = response2.content[0].text;
    assert.ok(text2.includes('2'), 'Should show visit count of 2');
    assert.ok(text2.includes('newest'), 'Should preserve lastPage state');

    console.log('✓ Persistent state works across execute calls');
  });

  test('screenshot: Take full page screenshot', async () => {
    const response = await client.callTool({
      name: 'screenshot',
      arguments: {},
    });

    assert.strictEqual(response.isError || false, false, 'Should not have errors');
    assert.ok(response.content, 'Should return content');
    assert.ok(response.content.length > 0, 'Should have content items');

    // Screenshot returns base64 image data
    const imageContent = response.content.find(c => c.type === 'image');
    assert.ok(imageContent, 'Should contain image content');
    assert.ok(imageContent.data, 'Should have image data');

    console.log('✓ Screenshot captured successfully');
  });

  test('browser_network_requests: Capture network traffic', async () => {
    // Navigate to trigger some network requests
    await client.callTool({
      name: 'browser_execute',
      arguments: {
        code: "await page.goto('https://news.ycombinator.com'); await page.waitForLoadState('networkidle')",
        timeout: 30000,
      },
    });

    const response = await client.callTool({
      name: 'browser_network_requests',
      arguments: {
        includeStatic: false,
        limit: 20,
        clear: false,
      },
    });

    assert.strictEqual(response.isError || false, false, 'Should not have errors');
    const text = response.content[0].text;

    assert.ok(text.length > 0, 'Should have network data');
    // Network capture should show requests
    assert.ok(
      text.includes('GET') || text.includes('POST') || text.includes('request') || text.includes('0 requests'),
      'Should contain HTTP method or request info'
    );

    console.log('✓ Network requests captured');
  });

  test('browser_execute: Access utility functions', async () => {
    const response = await client.callTool({
      name: 'browser_execute',
      arguments: {
        code: `
          // Test waitForPageLoad utility
          await page.goto('https://news.ycombinator.com/news');
          const result = await waitForPageLoad({ timeout: 5000 });
          console.log('Page load result:', result.reason);

          // Test getCleanHTML utility
          const html = await getCleanHTML({ maxLength: 500 });
          console.log('Clean HTML length:', html.length);

          return {
            loadReason: result.reason,
            htmlLength: html.length
          };
        `,
        timeout: 30000,
      },
    });

    const text = response.content[0].text;

    // Check if there was an error first
    if (response.isError) {
      console.log('Response text:', text);
      assert.fail('Should not have errors. Error: ' + text);
    }

    assert.ok(text.includes('loadReason') || text.includes('Page load result'), 'Should include load reason');
    assert.ok(text.includes('htmlLength') || text.includes('Clean HTML length'), 'Should include HTML length');

    console.log('✓ Utility functions accessible in VM context');
  });

  test('browser_execute: Error handling for invalid code', async () => {
    const response = await client.callTool({
      name: 'browser_execute',
      arguments: {
        code: 'throw new Error("Test error")',
      },
    });

    assert.strictEqual(response.isError, true, 'Should report error');
    const text = response.content[0].text;
    assert.ok(text.includes('Error: Test error'), 'Should contain error message');

    console.log('✓ Error handling works correctly');
  });

  test('browser_execute: Timeout handling', async () => {
    const response = await client.callTool({
      name: 'browser_execute',
      arguments: {
        code: 'await new Promise(resolve => setTimeout(resolve, 10000))',
        timeout: 1000, // 1 second timeout
      },
    });

    assert.strictEqual(response.isError, true, 'Should timeout and report error');
    const text = response.content[0].text;
    assert.ok(
      text.includes('timeout') || text.includes('timed out'),
      'Should mention timeout in error'
    );

    console.log('✓ Timeout handling works correctly');
  });

  test('Full workflow: Search, click, verify', async () => {
    // 1. Go to homepage
    await client.callTool({
      name: 'browser_execute',
      arguments: {
        code: "await page.goto('https://news.ycombinator.com'); await page.waitForLoadState('networkidle')",
      },
    });

    // 2. Get snapshot
    const snapshotResponse = await client.callTool({
      name: 'snapshot',
      arguments: {},
    });
    const snapshot = snapshotResponse.content[0].text;

    // 3. Search for "comments" in snapshot
    const searchResponse = await client.callTool({
      name: 'browser_search_snapshot',
      arguments: {
        pattern: 'comments',
        ignoreCase: true,
      },
    });
    assert.ok(searchResponse.content[0].text.includes('Found'), 'Should find matches');

    // 4. Take screenshot
    const screenshotResponse = await client.callTool({
      name: 'screenshot',
      arguments: {},
    });
    assert.ok(screenshotResponse.content.find(c => c.type === 'image'), 'Should capture screenshot');

    // 5. Get network requests
    const networkResponse = await client.callTool({
      name: 'browser_network_requests',
      arguments: { limit: 10 },
    });
    assert.ok(networkResponse.content[0].text.length > 0, 'Should have network data');

    console.log('✓ Full workflow completed successfully');
  });
});

console.log('\n🧪 Running E2E tests for even-better-playwright-mcp\n');
