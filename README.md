# even-better-playwright-mcp

The **best of all worlds** Playwright MCP server - combining intelligent DOM compression, code execution, visual labels, and advanced DevTools capabilities.

## Features

- 🎭 **Full Playwright API** - Execute any Playwright code via the `execute` tool
- 🏗️ **90%+ DOM Compression** - SimHash-based list folding and wrapper removal
- 📍 **Ref-Based Elements** - Stable `[ref=e1]` identifiers with aria-ref selectors
- 🔍 **Enhanced Search & Diff** - Search snapshots with regex, track changes with diff mode
- 🎯 **Visual Labels** - Vimium-style overlays for screenshot-based interaction
- 🔧 **Advanced DevTools** - Debugger, live editor, styles inspection, React source finding
- 🌐 **Network Capture** - Request/response interception with analytics filtering
- ⏱️ **Smart Page Load** - Intelligent wait that filters analytics and stuck requests
- 📝 **Browser Console Logs** - Persistent per-page logging with search and filtering
- 🧹 **Clean HTML** - Get LLM-friendly HTML with search and diff capabilities
- 🔒 **Sandboxed Execution** - Safe VM with scoped file system and module allowlist

## Installation

```bash
npm install -g even-better-playwright-mcp
```

Or use directly with npx:
```bash
npx even-better-playwright-mcp
```

## Configuration

Add to your MCP client settings (e.g., Claude Desktop's `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["even-better-playwright-mcp"]
    }
  }
}
```

### CLI Options

```
Usage: even-better-playwright-mcp [options]

Options:
  --browser <browser>       Browser to use: chromium, firefox, webkit (default: chromium)
  --headless               Run browser in headless mode (default: false)
  --cdp-endpoint <url>     Connect to existing browser via CDP endpoint
  --user-data-dir <path>   Use persistent browser profile directory
  -h, --help               Show help message
```

### Examples

```bash
# Basic usage (launches Chromium in headed mode)
even-better-playwright-mcp

# Use Firefox in headless mode
even-better-playwright-mcp --browser firefox --headless

# Connect to existing Chrome instance
even-better-playwright-mcp --cdp-endpoint ws://localhost:9222

# Use persistent profile
even-better-playwright-mcp --user-data-dir ./browser-profile
```

## Tools

### 1. `snapshot` - Get Page Structure

Get compressed accessibility snapshot with ref IDs for element targeting.

```
Returns: DOM tree with [ref=e1], [ref=e2] etc.
Use refs with execute tool: await $('e1').click()
Call again after navigation (refs become stale).
```

**Options:**
- `compress` (boolean, default: true) - Enable smart compression (~90% token reduction)
- `search` (string | RegExp) - Search pattern to filter results with 5 lines of context
- `showDiff` (boolean, default: false) - Show changes since last snapshot

**Example output:**
```
### Page Info
- URL: https://example.com
- Title: Example Domain

### Accessibility Snapshot
- document [ref=e1]
  - heading "Example Domain" [level=1] [ref=e2]
  - paragraph [ref=e3]: This domain is for use in illustrative examples...
  - link "More information..." [ref=e4]
```

### 2. `browser_execute` - Run Playwright Code

Execute any Playwright code with full API access. This is the main tool for browser automation.

**Scope variables:**
- `page` - Current Playwright page
- `context` - Browser context
- `state` - Persistent object across calls
- `$('e5')` - Shorthand for `page.locator('aria-ref=e5')`
- `accessibilitySnapshot()` - Get current page snapshot
- `waitForPageLoad()` - Smart page load detection (filters analytics/ads)
- `getLatestLogs()` - Get browser console logs with search/filtering
- `clearAllLogs()` - Clear all stored console logs
- `getCleanHTML()` - Get cleaned HTML with search and diff
- `getLocatorStringForElement()` - Generate selector string from element

**Common patterns:**
```javascript
// Navigate
await page.goto('https://example.com')

// Click by ref (from snapshot)
await $('e5').click()

// Fill input
await $('e12').fill('search query')

// Get text
const text = await $('e3').textContent()

// Wait for network (smart detection, filters analytics/ads)
const result = await waitForPageLoad({ timeout: 30000 })
// => { success: true, waitTimeMs: 1234, pendingRequests: [] }

// Screenshot
await page.screenshot({ path: 'screenshot.png' })
```

**Advanced - DevTools access:**
```javascript
// Get CDP session for debugging
const cdp = await getCDPSession({ page })
const dbg = createDebugger({ cdp })

// Set breakpoint
await dbg.setBreakpoint({ file: 'app.js', line: 42 })

// Inspect styles
const styles = await getStylesForLocator({ locator: $('e5') })

// Find React component source
const source = await getReactSource({ locator: $('e5') })
// => { fileName: 'Button.tsx', lineNumber: 42 }
```

**Browser Console Logs:**
```javascript
// Get latest 50 console logs from current page
const logs = await getLatestLogs({ count: 50 })

// Search logs with regex
const errorLogs = await getLatestLogs({ search: /error|warning/i })

// Get logs from all pages
const allLogs = await getLatestLogs()

// Clear all stored logs
clearAllLogs()
```

**HTML Utilities:**
```javascript
// Get cleaned HTML from page or element
const html = await getCleanHTML({
  locator: page,  // or $('e5') for specific element
  maxContentLen: 500
})

// Search within HTML
const forms = await getCleanHTML({
  locator: page,
  search: 'form'
})

// Track HTML changes
const diff = await getCleanHTML({
  locator: page,
  showDiffSinceLastCall: true
})

// Generate readable selector for element
const button = $('e5')
const selector = await getLocatorStringForElement(button)
// => "page.getByRole('button', { name: 'Submit' })"
```

**Safe modules via require():**
`path`, `url`, `crypto`, `buffer`, `util`, `assert`, `os`, `fs` (sandboxed)

### 3. `screenshot` - Capture Page Image

Capture screenshots with optional visual ref labels.

**Options:**
- `ref` (string) - Screenshot specific element by ref
- `fullPage` (boolean) - Capture entire scrollable area
- `withLabels` (boolean) - Show Vimium-style ref labels

**Label colors by role:**
| Color | Role |
|-------|------|
| Yellow | links |
| Orange | buttons |
| Coral | text inputs |
| Pink | checkboxes, radios |
| Blue | images, videos |

### 4. `browser_search_snapshot` - Search Content

Search the last captured snapshot using regex patterns.

**Options:**
- `pattern` (string) - Regex pattern to search for
- `ignoreCase` (boolean, default: false) - Case-insensitive matching
- `lineLimit` (number, default: 100) - Maximum lines to return

**Example:**
```
Pattern: "button|link"
Result:
- link "Contact Us" [ref=e15]
- button "Submit" [ref=e23]
- link "Privacy Policy" [ref=e31]
```

### 5. `browser_network_requests` - Capture Network Traffic

Get captured network requests with automatic filtering of analytics and ads.

**Options:**
- `includeStatic` (boolean, default: false) - Include images, CSS, fonts
- `limit` (number, default: 50) - Max requests to return (most recent)
- `clear` (boolean, default: false) - Clear captured requests after returning

**Features:**
- Automatically starts capturing on first call
- Filters analytics/tracking domains (Google Analytics, Facebook Pixel, etc.)
- Captures request/response bodies (up to 50KB)
- Shows status codes, timing, and response previews

**Example:**
```
Network Requests (127 total, showing last 50):

POST https://api.example.com/login [200] (245ms)
  POST: {"email":"user@example.com","password":"***"}
  RESPONSE: {"token":"eyJ...","user":{"id":123,"name":"John"}}

GET https://api.example.com/profile [200] (89ms)
  RESPONSE: {"id":123,"name":"John","email":"user@example.com"}
```

## Workflow

### Basic Automation

1. **Get page structure**
   ```
   Use: snapshot tool
   → See all interactive elements with refs
   ```

2. **Interact with elements**
   ```
   Use: execute tool
   Code: await $('e5').click()
   ```

3. **After navigation, refresh refs**
   ```
   Use: snapshot tool again
   → Refs are stale after navigation
   ```

### Visual Automation

1. **Take labeled screenshot**
   ```
   Use: screenshot tool with withLabels: true
   → See visual labels overlaid on elements
   ```

2. **Identify element from image**
   ```
   Label shows: "e5" on a button
   ```

3. **Click using ref**
   ```
   Use: execute tool
   Code: await $('e5').click()
   ```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     even-better-playwright-mcp                  │
├─────────────────────────────────────────────────────────────────┤
│  CORE                                                           │
│  ├── aria-ref selector system ([ref=e1], [ref=e2], etc.)       │
│  ├── page._snapshotForAI() for accessibility snapshots         │
│  └── Standard Playwright browser automation                     │
├─────────────────────────────────────────────────────────────────┤
│  ENHANCED SNAPSHOT                                              │
│  ├── SimHash-based list folding (compress 48 items → 2 lines)  │
│  ├── Useless wrapper removal                                    │
│  ├── Regex-powered content search with context                  │
│  └── Diff tracking (compare snapshots over time)                │
├─────────────────────────────────────────────────────────────────┤
│  CODE EXECUTION                                                 │
│  ├── browser_execute tool (run Playwright code in VM sandbox)  │
│  ├── Sandboxed require (safe module allowlist)                  │
│  ├── Scoped file system (cwd, /tmp only)                       │
│  └── Console log capture and forwarding                         │
├─────────────────────────────────────────────────────────────────┤
│  PERSISTENT LOGGING                                             │
│  ├── Per-page browser console capture (5000 log limit)         │
│  ├── Logs persist across executions and reconnections          │
│  ├── Search logs with regex and context                         │
│  └── Auto-clear on navigation                                   │
├─────────────────────────────────────────────────────────────────┤
│  NETWORK & PAGE UTILITIES                                       │
│  ├── Network capture with analytics filtering                   │
│  ├── Smart page load (filters stuck/analytics requests)        │
│  ├── Clean HTML extraction with search/diff                     │
│  └── Selector string generation from elements                   │
├─────────────────────────────────────────────────────────────────┤
│  ADVANCED DEVTOOLS                                              │
│  ├── Debugger class (breakpoints, step, inspect variables)     │
│  ├── Editor class (live code editing without reload)           │
│  ├── Styles inspection (CSS like DevTools panel)               │
│  └── React source finding (component file/line locations)      │
├─────────────────────────────────────────────────────────────────┤
│  VISUAL OVERLAYS                                                │
│  ├── Vimium-style labels on interactive elements               │
│  ├── Color-coded by role (links=yellow, buttons=orange, etc.)  │
│  └── Screenshot with visible ref labels                         │
└─────────────────────────────────────────────────────────────────┘
```

## Ref System

All projects use the same ref system built into Playwright:

- **Snapshots** generate refs like `[ref=e1]`
- **Selectors** use `page.locator('aria-ref=e1')`
- **Shorthand** `$('e1')` in execute tool

**Important:** Refs become stale after navigation. Always call `snapshot` again after `page.goto()` or clicking links that navigate.

## Compression Algorithm

The snapshot compression achieves ~90% token reduction:

```
Original DOM (5000+ lines)
    ↓ removeUselessWrappers()
    ↓ truncateText(50 chars)
    ↓ detectSimilarPatterns(SimHash)
    ↓ foldLists()
Compressed (<500 lines)
```

**Example:**
```
Before:
- listitem [ref=e234]: Product 1 - Description...
- listitem [ref=e235]: Product 2 - Description...
- listitem [ref=e236]: Product 3 - Description...
... (48 items)

After:
- listitem [ref=e234]: Product 1 - Description...
- listitem (... and 47 more similar) [refs: e235, e236, ...]
```

## Error Handling

The execute tool provides contextual hints:

- **Stale ref**: "Page may have navigated. Refs are stale after navigation. Call snapshot tool to get fresh refs."
- **Timeout**: "Operation timed out. Try increasing timeout or check if element exists/is visible."
- **Hidden element**: "Element may be hidden or covered by another element. Try scrolling or closing overlays."
- **Connection lost**: "Browser connection lost. The browser may have been closed - try again to relaunch."

## Programmatic Usage

The server can be used as a library with full programmatic control:

```typescript
import { createServerInstance, BrowserManager } from 'even-better-playwright-mcp';

// Create server instance with custom config
const { server, browserManager, cleanup } = createServerInstance({
  browser: 'chromium',
  headless: true,
  isolated: true,  // Force ephemeral context
  launchOptions: {
    slowMo: 50,
    args: ['--disable-blink-features=AutomationControlled']
  },
  contextOptions: {
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Custom User Agent'
  }
});

// Connect your transport
await server.connect(transport);

// Cleanup when done
await cleanup();
```

### BrowserConfig Options

- `browser` - Browser type: 'chromium', 'firefox', 'webkit'
- `headless` - Run in headless mode
- `cdpEndpoint` - Connect to existing browser via CDP
- `userDataDir` - Persistent browser profile directory
- `isolated` - Force ephemeral context (overrides userDataDir)
- `launchOptions` - Pass-through to Playwright's browser.launch()
- `contextOptions` - Pass-through to browser.newContext()

### Multi-Session Support

Each `BrowserManager` instance has isolated state:
- Independent browser/context/page
- Separate network capture
- Isolated console logs
- Per-instance persistent state

```typescript
// Create multiple isolated sessions
const session1 = createServerInstance({ browser: 'chromium' });
const session2 = createServerInstance({ browser: 'firefox' });

// Each has its own browser and state
await session1.browserManager.getPage();
await session2.browserManager.getPage();
```

## Development

### Building from Source

```bash
git clone https://github.com/your-repo/even-better-playwright-mcp
cd even-better-playwright-mcp
npm install
npm run build
```

### Running Tests

The project includes comprehensive end-to-end tests:

```bash
# Build first
npm run build

# Run e2e tests
npm run test:e2e

# Run all tests
npm test
```

**Test Coverage**: 15 tests covering all MCP tools against Hacker News
- Tool discovery and validation
- Browser automation (navigate, click, fill forms)
- Accessibility snapshots with ref system
- Screenshot capture
- Network request monitoring
- Persistent state management
- Error and timeout handling
- Full end-to-end workflows

See `test/README.md` for detailed test documentation.

### Project Structure

```
even-better-playwright-mcp/
├── bin/
│   └── cli.ts                  # CLI entry point with arg parsing
├── src/
│   ├── index.ts                # MCP server factory (createServerInstance)
│   ├── browser.ts              # BrowserManager class (refactored!)
│   ├── vm-context.ts           # VM sandbox setup
│   ├── tools/
│   │   ├── snapshot.ts         # Snapshot tool (compressed + search + diff)
│   │   ├── execute.ts          # Execute tool (main)
│   │   ├── screenshot.ts       # Screenshot tool (with labels)
│   │   ├── search.ts           # Search tool
│   │   └── network.ts          # Network capture tool
│   ├── utils/
│   │   ├── smart-outline.ts    # DOM compression
│   │   ├── list-detector.ts    # Pattern detection
│   │   ├── dom-simhash.ts      # SimHash implementation
│   │   ├── scoped-fs.ts        # Sandboxed file system
│   │   ├── search.ts           # Regex search
│   │   ├── browser-logs.ts     # Persistent console logging
│   │   ├── clean-html.ts       # HTML cleaning with search/diff
│   │   ├── locator-string.ts   # Selector generation
│   │   ├── wait-for-page-load.ts  # Smart page load detection
│   │   ├── network-capture.ts  # Network request capture
│   │   └── console-capture.ts  # Console log capture
│   ├── devtools/
│   │   ├── cdp-session.ts      # CDP connection
│   │   ├── debugger.ts         # Debugger class
│   │   ├── editor.ts           # Live editor
│   │   ├── styles.ts           # CSS inspection
│   │   └── react-source.ts     # React locations
│   └── visual/
│       └── aria-labels.ts      # Vimium-style overlays
├── test/
│   ├── e2e.test.js            # Comprehensive E2E test suite
│   └── README.md              # Test documentation
├── package.json
├── tsconfig.json
└── README.md
```

### Recent Refactoring (v0.1.0)

The codebase was refactored from global module-level state to a clean, testable architecture:

**Before**: Global functions and singletons
```typescript
import { getPage, getContext } from './browser.js';
const page = await getPage(); // Global state
```

**After**: Dependency injection with BrowserManager
```typescript
const browserManager = new BrowserManager(config);
const page = await browserManager.getPage(); // Instance state
```

**Benefits**:
- ✅ Multi-session support (multiple isolated browsers)
- ✅ Better testability (no global state)
- ✅ Library-friendly API (clean exports)
- ✅ Full Playwright configuration control
- ✅ Flexible browser lifecycle management

All tool handlers now use factory functions with dependency injection:
```typescript
const handleSnapshot = createSnapshotHandler(browserManager);
const handleExecute = createExecuteHandler(browserManager);
```

## Acknowledgments

This project combines the best ideas from:
- [better-playwright-mcp](https://github.com/) - Intelligent DOM compression
- [playwriter](https://github.com/) - Code execution and DevTools
- [playwright-mcp](https://github.com/microsoft/playwright-mcp) - Microsoft's official MCP

## License

MIT
