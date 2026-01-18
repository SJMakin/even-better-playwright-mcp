# E2E Tests for even-better-playwright-mcp

## Overview

Comprehensive end-to-end test suite that validates all MCP tools using a real MCP client/server connection against Hacker News.

## Running Tests

```bash
# Run all e2e tests
npm run test:e2e

# Run all tests (when more are added)
npm test
```

## Test Coverage

The e2e test suite (`e2e.test.js`) covers all 15 scenarios:

### 1. Tool Discovery
- ✅ Lists all 5 available tools
- ✅ Validates tool names and schemas

### 2. browser_execute Tool
- ✅ Navigate to Hacker News
- ✅ Get page title and URL
- ✅ Click links and verify navigation
- ✅ Access elements on the page
- ✅ Use persistent state across calls
- ✅ Access utility functions (waitForPageLoad, getCleanHTML)
- ✅ Error handling for invalid code
- ✅ Timeout handling

### 3. snapshot Tool
- ✅ Get accessibility snapshot with refs
- ✅ Get fresh snapshot after navigation
- ✅ Validate snapshot contains page content

### 4. browser_search_snapshot Tool
- ✅ Search snapshot content with regex
- ✅ Case-insensitive search
- ✅ Result limiting

### 5. screenshot Tool
- ✅ Take full page screenshot
- ✅ Return base64 PNG image data

### 6. browser_network_requests Tool
- ✅ Capture network traffic
- ✅ Filter static resources
- ✅ Limit results

### 7. Full Workflow
- ✅ Combined workflow: navigate → snapshot → search → screenshot → network

## Test Architecture

### Transport Layer
Uses `InMemoryTransport` for direct client/server connection without stdio overhead.

```javascript
[clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
```

### Server Instance
Creates headless browser instance for testing:

```javascript
serverInstance = createServerInstance({
  browser: 'chromium',
  headless: true,
});
```

### Test Lifecycle
- **before**: Setup MCP client/server connection
- **test**: Run individual test cases
- **after**: Clean up browser and close connections

## Key Test Scenarios

### Navigation & Interaction
```javascript
await client.callTool({
  name: 'browser_execute',
  arguments: {
    code: "await page.goto('https://news.ycombinator.com')",
  },
});
```

### Snapshot & Search
```javascript
// Get snapshot
await client.callTool({ name: 'snapshot', arguments: {} });

// Search snapshot
await client.callTool({
  name: 'browser_search_snapshot',
  arguments: { pattern: 'login', ignoreCase: true },
});
```

### Persistent State
```javascript
// First call
state.visitCount = (state.visitCount || 0) + 1;

// Second call - state persists
state.visitCount; // Returns 2
```

### Error Handling
```javascript
// Validates timeout errors
code: 'await new Promise(resolve => setTimeout(resolve, 10000))',
timeout: 1000  // Should timeout

// Validates execution errors
code: 'throw new Error("Test error")'  // Should catch error
```

## Test Results

All 15 tests pass in approximately 40-45 seconds:

```
# tests 15
# suites 1
# pass 15
# fail 0
```

## Dependencies

Uses Node.js built-in test runner (no external test framework):
- `node:test` - Native test runner
- `node:assert` - Native assertion library
- `@modelcontextprotocol/sdk` - MCP client/server

## Adding New Tests

To add new test cases:

1. Add test to `test/e2e.test.js`:
```javascript
test('Your test name', async () => {
  const response = await client.callTool({
    name: 'tool_name',
    arguments: { /* ... */ },
  });

  assert.ok(response.content, 'Assertion message');
});
```

2. Run tests:
```bash
npm run test:e2e
```

## CI/CD Integration

The test suite is designed for CI/CD pipelines:

- Uses headless browser (no GUI required)
- Deterministic test ordering
- Clear pass/fail criteria
- Comprehensive error messages
- ~45 second execution time

Example GitHub Actions workflow:

```yaml
- name: Run E2E Tests
  run: |
    npm run build
    npm run test:e2e
```
